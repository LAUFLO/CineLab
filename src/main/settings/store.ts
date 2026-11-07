import { app, safeStorage } from 'electron'
import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  ConnectionTestInput,
  ConnectionTestResult,
  FetchModelsResult,
  ModelDef,
  ProviderConfig,
  ProviderInput,
  ProviderType
} from '@shared/provider-schema'
import type { ModelsFileProvider } from '@shared/models-file'
import type { OperationBindings } from '@shared/operation-schema'
import { klingAuthorization } from '../providers/kling-auth'
import { mergeHeaders } from '../providers/headers'
import {
  enqueueModelsWrite,
  loadModelsConfig,
  removeModelsProvider,
  resolveModels,
  saveModelsConfig,
  toModelsProvider,
  upsertModelsProvider
} from './models-config'

interface ProviderKeyEntry {
  encryptedKey?: string
  encryptedSecret?: string
}

type ProviderKeys = Record<string, ProviderKeyEntry>

interface SettingsFile {
  version: 2
  providerKeys: ProviderKeys
  operationBindings?: OperationBindings
}

interface LegacyStoredProvider {
  id: string
  name: string
  type?: ProviderType
  baseUrl: string
  models: ModelDef[]
  encryptedKey?: string
  encryptedSecret?: string
}

interface RawSettings {
  version: number
  providerKeys: ProviderKeys
  operationBindings: OperationBindings
  legacyProviders: LegacyStoredProvider[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function settingsFile(): string {
  return join(app.getPath('userData'), 'settings.json')
}

function readProviderKeys(value: unknown): ProviderKeys {
  if (!isRecord(value)) return {}

  const result: ProviderKeys = {}
  for (const [id, entry] of Object.entries(value)) {
    if (!isRecord(entry)) continue
    const encryptedKey =
      typeof entry.encryptedKey === 'string' ? entry.encryptedKey : undefined
    const encryptedSecret =
      typeof entry.encryptedSecret === 'string' ? entry.encryptedSecret : undefined
    if (encryptedKey || encryptedSecret) {
      result[id] = {
        ...(encryptedKey ? { encryptedKey } : {}),
        ...(encryptedSecret ? { encryptedSecret } : {})
      }
    }
  }
  return result
}

function readOperationBindings(value: unknown): OperationBindings {
  if (!isRecord(value)) return {}

  const result: OperationBindings = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string' && entry.trim()) {
      result[key] = entry.trim()
    }
  }
  return result
}

async function readRawSettings(): Promise<RawSettings> {
  let raw: unknown
  try {
    raw = JSON.parse(await fs.readFile(settingsFile(), 'utf8')) as unknown
  } catch {
    return {
      version: 2,
      providerKeys: {},
      operationBindings: {},
      legacyProviders: []
    }
  }

  if (!isRecord(raw)) {
    return {
      version: 2,
      providerKeys: {},
      operationBindings: {},
      legacyProviders: []
    }
  }

  if (Array.isArray(raw.providers)) {
    const legacyProviders = raw.providers.filter(
      (item): item is LegacyStoredProvider =>
        isRecord(item) &&
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        typeof item.baseUrl === 'string'
    )
    const providerKeys: ProviderKeys = {}
    for (const provider of legacyProviders) {
      if (provider.encryptedKey || provider.encryptedSecret) {
        providerKeys[provider.id] = {
          ...(provider.encryptedKey ? { encryptedKey: provider.encryptedKey } : {}),
          ...(provider.encryptedSecret
            ? { encryptedSecret: provider.encryptedSecret }
            : {})
        }
      }
    }
    return {
      version: 1,
      providerKeys,
      operationBindings: readOperationBindings(raw.operationBindings),
      legacyProviders
    }
  }

  return {
    version: 2,
    providerKeys: readProviderKeys(raw.providerKeys),
    operationBindings: readOperationBindings(raw.operationBindings),
    legacyProviders: []
  }
}

async function writeSettings(data: SettingsFile): Promise<void> {
  const file = settingsFile()
  await fs.mkdir(dirname(file), { recursive: true })

  const tmp = `${file}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')

  try {
    await fs.rename(tmp, file)
  } catch {
    await fs.rm(file, { force: true })
    await fs.rename(tmp, file)
  }
}

function encryptKey(key: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('系统安全存储不可用，无法保存 API Key')
  }
  return safeStorage.encryptString(key).toString('base64')
}

function decryptKey(encrypted: string): string {
  return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
}

let migrationPromise: Promise<void> | null = null

/** 把旧 settings.json 中的供应商迁移到 models.json，只保留加密 Key */
export function ensureMigrated(): Promise<void> {
  if (!migrationPromise) {
    migrationPromise = migrateLegacySettings().catch((error: unknown) => {
      migrationPromise = null
      throw error
    })
  }
  return migrationPromise
}

async function migrateLegacySettings(): Promise<void> {
  const raw = await readRawSettings()
  if (raw.legacyProviders.length === 0) return

  const config = await loadModelsConfig()
  if (config.errors.length > 0) {
    throw new Error(`models.json 存在错误，暂不迁移：${config.errors[0]}`)
  }

  const providers = [...config.providers]
  const providerKeys: ProviderKeys = { ...raw.providerKeys }

  for (const legacy of raw.legacyProviders) {
    if (!providers.some((provider) => provider.id === legacy.id)) {
      providers.push({
        id: legacy.id,
        name: legacy.name,
        type: legacy.type ?? 'openai-compat',
        baseUrl: legacy.baseUrl,
        models: Array.isArray(legacy.models) ? legacy.models : []
      })
    }
  }

  await enqueueModelsWrite(() => saveModelsConfig(providers))
  await writeSettings({
    version: 2,
    providerKeys,
    operationBindings: raw.operationBindings
  })
}

export async function listProviders(): Promise<ProviderConfig[]> {
  await ensureMigrated()
  const [config, raw] = await Promise.all([loadModelsConfig(), readRawSettings()])

  return config.providers.map((provider) =>
    toModelsProvider(provider, raw.providerKeys[provider.id])
  )
}

export interface ResolvedProvider {
  type: ProviderType
  baseUrl: string
  headers?: Record<string, string>
  apiKey: string
  secretKey: string
  models: ModelDef[]
}

export async function resolveProvider(id: string): Promise<ResolvedProvider | null> {
  await ensureMigrated()
  const [config, raw] = await Promise.all([loadModelsConfig(), readRawSettings()])
  const provider = config.providers.find((item) => item.id === id)
  if (!provider) return null

  const stored = raw.providerKeys[id]
  const envKey = provider.apiKeyEnv
    ? process.env[provider.apiKeyEnv]
    : undefined

  return {
    type: provider.type ?? 'openai-compat',
    baseUrl: provider.baseUrl,
    ...(provider.headers ? { headers: provider.headers } : {}),
    apiKey: stored?.encryptedKey ? decryptKey(stored.encryptedKey) : envKey || '',
    secretKey: stored?.encryptedSecret ? decryptKey(stored.encryptedSecret) : '',
    models: resolveModels(provider)
  }
}

let providerWriteChain: Promise<unknown> = Promise.resolve()

function enqueueProviderWrite<T>(task: () => Promise<T>): Promise<T> {
  const next = providerWriteChain.then(task, task)
  providerWriteChain = next.catch(() => undefined)
  return next
}

export async function saveProvider(input: ProviderInput): Promise<ProviderConfig> {
  await ensureMigrated()

  return enqueueProviderWrite(async () => {
    const config = await loadModelsConfig()
    if (config.errors.length > 0) {
      throw new Error(config.errors[0])
    }

    const id = input.id ?? randomUUID()
    const existing = config.providers.find((provider) => provider.id === id)
    const provider: ModelsFileProvider = {
      ...(existing ?? {}),
      id,
      name: input.name.trim() || '未命名供应商',
      type: input.type ?? existing?.type ?? 'openai-compat',
      baseUrl: input.baseUrl.trim().replace(/\/+$/, ''),
      models: input.models
    }
    delete provider.apiKey

    const headers = Object.fromEntries(
      Object.entries(input.headers ?? {})
        .map(([key, value]) => [key.trim(), value] as const)
        .filter(([key, value]) => key.length > 0 && value.length > 0)
    )
    if (Object.keys(headers).length > 0) {
      provider.headers = headers
    } else {
      delete provider.headers
    }

    await saveModelsConfig(upsertModelsProvider(config.providers, provider))

    const raw = await readRawSettings()
    const providerKeys: ProviderKeys = { ...raw.providerKeys }
    const entry: ProviderKeyEntry = { ...(providerKeys[id] ?? {}) }

    if (input.apiKey && input.apiKey.trim()) {
      entry.encryptedKey = encryptKey(input.apiKey.trim())
    }
    if (input.secretKey && input.secretKey.trim()) {
      entry.encryptedSecret = encryptKey(input.secretKey.trim())
    }

    if (entry.encryptedKey || entry.encryptedSecret) {
      providerKeys[id] = entry
    } else {
      delete providerKeys[id]
    }

    await writeSettings({
      version: 2,
      providerKeys,
      operationBindings: raw.operationBindings
    })
    return toModelsProvider(provider, entry)
  })
}

export async function deleteProvider(id: string): Promise<void> {
  await ensureMigrated()

  await enqueueProviderWrite(async () => {
    const config = await loadModelsConfig()
    if (config.errors.length > 0) {
      throw new Error(config.errors[0])
    }

    await saveModelsConfig(removeModelsProvider(config.providers, id))

    const raw = await readRawSettings()
    const providerKeys: ProviderKeys = { ...raw.providerKeys }
    delete providerKeys[id]
    await writeSettings({
      version: 2,
      providerKeys,
      operationBindings: raw.operationBindings
    })
  })
}

export async function getOperationBindings(): Promise<OperationBindings> {
  await ensureMigrated()
  const raw = await readRawSettings()
  return raw.operationBindings
}

export async function saveOperationBindings(
  bindings: OperationBindings
): Promise<void> {
  await ensureMigrated()

  await enqueueProviderWrite(async () => {
    const raw = await readRawSettings()
    await writeSettings({
      version: 2,
      providerKeys: raw.providerKeys,
      operationBindings: readOperationBindings(bindings)
    })
  })
}

function connectionErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: { code?: string } }).cause
    const code = cause?.code
    if (code === 'ENOTFOUND') return '域名解析失败，请检查 Base URL'
    if (code === 'ECONNREFUSED') return '连接被拒绝，请检查 Base URL 和端口'
    if (code === 'ECONNRESET') return '连接被重置，请稍后重试'
    if (code === 'ETIMEDOUT') return '连接超时，请检查网络或代理'
    if (error.name === 'AbortError') return '连接超时，请检查 Base URL 或网络'
    return error.message
  }
  return String(error)
}

function httpErrorMessage(status: number, text: string): string {
  if (status === 401 || status === 403) {
    return `API Key 无效或没有权限（HTTP ${status}）`
  }
  if (status === 404) {
    return '接口不存在（HTTP 404），请检查 Base URL 是否包含正确的版本路径'
  }
  if (status >= 500) {
    return `服务端错误（HTTP ${status}），请稍后重试`
  }
  const detail = text.trim().slice(0, 200)
  return detail ? `HTTP ${status}: ${detail}` : `HTTP ${status}`
}

export async function testConnection(
  input: ConnectionTestInput
): Promise<ConnectionTestResult> {
  try {
    const [config, raw] = await Promise.all([loadModelsConfig(), readRawSettings()])
    const provider = input.id
      ? config.providers.find((item) => item.id === input.id)
      : undefined
    const stored = input.id ? raw.providerKeys[input.id] : undefined
    const envKey = provider?.apiKeyEnv
      ? process.env[provider.apiKeyEnv]
      : undefined

    const type = input.type ?? provider?.type ?? 'openai-compat'
    const customHeaders = input.headers ?? provider?.headers
    const apiKey =
      input.apiKey?.trim() ||
      (stored?.encryptedKey ? decryptKey(stored.encryptedKey) : '') ||
      envKey ||
      ''
    const secretKey =
      input.secretKey?.trim() ||
      (stored?.encryptedSecret ? decryptKey(stored.encryptedSecret) : '')
    const baseUrl = (input.baseUrl || provider?.baseUrl || '')
      .trim()
      .replace(/\/+$/, '')

    if (!baseUrl) return { ok: false, message: 'Base URL 不能为空' }
    if (!apiKey) return { ok: false, message: 'API Key 不能为空' }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)

    if (type === 'kling') {
      const response = await fetch(`${baseUrl}/v1/videos/text2video/0`, {
        headers: mergeHeaders(
          { Authorization: klingAuthorization(apiKey, secretKey) },
          customHeaders
        ),
        signal: controller.signal
      })
      clearTimeout(timer)

      if (response.status === 401 || response.status === 403) {
        const text = await response.text().catch(() => '')
        return {
          ok: false,
          message: httpErrorMessage(response.status, text)
        }
      }

      return { ok: true, message: '连接成功（鉴权通过）' }
    }

    const response = await fetch(`${baseUrl}/models`, {
      headers: mergeHeaders({ Authorization: `Bearer ${apiKey}` }, customHeaders),
      signal: controller.signal
    })
    clearTimeout(timer)

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      return {
        ok: false,
        message: httpErrorMessage(response.status, text)
      }
    }

    const json = (await response.json().catch(() => null)) as { data?: unknown[] } | null
    const count = Array.isArray(json?.data) ? json.data.length : 0

    return {
      ok: true,
      message: count > 0 ? `连接成功，发现 ${count} 个模型` : '连接成功'
    }
  } catch (error) {
    return { ok: false, message: connectionErrorMessage(error) }
  }
}

export async function fetchModels(
  input: ConnectionTestInput
): Promise<FetchModelsResult> {
  try {
    const [config, raw] = await Promise.all([loadModelsConfig(), readRawSettings()])
    const provider = input.id
      ? config.providers.find((item) => item.id === input.id)
      : undefined
    const stored = input.id ? raw.providerKeys[input.id] : undefined
    const envKey = provider?.apiKeyEnv
      ? process.env[provider.apiKeyEnv]
      : undefined

    const type = input.type ?? provider?.type ?? 'openai-compat'
    const customHeaders = input.headers ?? provider?.headers
    if (type === 'kling') {
      return {
        ok: false,
        message: '可灵暂不支持通过接口获取模型列表',
        models: []
      }
    }

    const apiKey =
      input.apiKey?.trim() ||
      (stored?.encryptedKey ? decryptKey(stored.encryptedKey) : '') ||
      envKey ||
      ''
    const baseUrl = (input.baseUrl || provider?.baseUrl || '')
      .trim()
      .replace(/\/+$/, '')

    if (!baseUrl) return { ok: false, message: 'Base URL 不能为空', models: [] }
    if (!apiKey) return { ok: false, message: 'API Key 不能为空', models: [] }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20000)
    const response = await fetch(`${baseUrl}/models`, {
      headers: mergeHeaders({ Authorization: `Bearer ${apiKey}` }, customHeaders),
      signal: controller.signal
    })
    clearTimeout(timer)

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      return {
        ok: false,
        message: httpErrorMessage(response.status, text),
        models: []
      }
    }

    const payload = (await response.json().catch(() => null)) as unknown
    const list = Array.isArray(payload)
      ? payload
      : Array.isArray((payload as { data?: unknown[] } | null)?.data)
        ? ((payload as { data: unknown[] }).data)
        : []

    const models = list
      .map((item) => {
        if (typeof item === 'string') return item
        const id = (item as { id?: unknown } | null)?.id
        return typeof id === 'string' ? id : ''
      })
      .filter((id): id is string => id.length > 0)

    return {
      ok: true,
      message:
        models.length > 0
          ? `找到 ${models.length} 个模型`
          : '连接成功，但接口没有返回模型',
      models
    }
  } catch (error) {
    return { ok: false, message: connectionErrorMessage(error), models: [] }
  }
}
