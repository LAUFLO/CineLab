import { app, safeStorage } from 'electron'
import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  ConnectionTestInput,
  ConnectionTestResult,
  ModelDef,
  ProviderConfig,
  ProviderInput,
  ProviderType
} from '@shared/provider-schema'
import { klingAuthorization } from '../providers/kling-auth'

interface StoredProvider {
  id: string
  name: string
  type?: ProviderType
  baseUrl: string
  models: ModelDef[]
  encryptedKey?: string
  encryptedSecret?: string
  createdAt: string
  updatedAt: string
}

interface SettingsFile {
  version: 1
  providers: StoredProvider[]
}

function settingsFile(): string {
  return join(app.getPath('userData'), 'settings.json')
}

async function readSettings(): Promise<SettingsFile> {
  try {
    const raw = JSON.parse(await fs.readFile(settingsFile(), 'utf8')) as Partial<SettingsFile>
    if (Array.isArray(raw.providers)) {
      return { version: 1, providers: raw.providers }
    }
  } catch {
    // 文件不存在或损坏，返回空配置
  }
  return { version: 1, providers: [] }
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

function toPublic(provider: StoredProvider): ProviderConfig {
  return {
    id: provider.id,
    name: provider.name,
    type: provider.type ?? 'openai-compat',
    baseUrl: provider.baseUrl,
    models: provider.models,
    hasKey: Boolean(provider.encryptedKey),
    hasSecret: Boolean(provider.encryptedSecret),
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt
  }
}

export async function listProviders(): Promise<ProviderConfig[]> {
  const data = await readSettings()
  return data.providers.map(toPublic)
}

export interface ResolvedProvider {
  type: ProviderType
  baseUrl: string
  apiKey: string
  secretKey: string
  models: ModelDef[]
}

export async function resolveProvider(id: string): Promise<ResolvedProvider | null> {
  const data = await readSettings()
  const provider = data.providers.find((item) => item.id === id)
  if (!provider) return null

  return {
    type: provider.type ?? 'openai-compat',
    baseUrl: provider.baseUrl,
    apiKey: provider.encryptedKey ? decryptKey(provider.encryptedKey) : '',
    secretKey: provider.encryptedSecret
      ? decryptKey(provider.encryptedSecret)
      : '',
    models: provider.models
  }
}

export async function saveProvider(input: ProviderInput): Promise<ProviderConfig> {
  const data = await readSettings()
  const now = new Date().toISOString()
  const existing = input.id
    ? data.providers.find((provider) => provider.id === input.id)
    : undefined

  const provider: StoredProvider = {
    id: existing?.id ?? randomUUID(),
    name: input.name.trim() || '未命名供应商',
    type: input.type ?? existing?.type ?? 'openai-compat',
    baseUrl: input.baseUrl.trim().replace(/\/+$/, ''),
    models: input.models,
    encryptedKey:
      input.apiKey && input.apiKey.trim()
        ? encryptKey(input.apiKey.trim())
        : existing?.encryptedKey,
    encryptedSecret:
      input.secretKey && input.secretKey.trim()
        ? encryptKey(input.secretKey.trim())
        : existing?.encryptedSecret,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  }

  if (existing) {
    data.providers = data.providers.map((item) =>
      item.id === provider.id ? provider : item
    )
  } else {
    data.providers.push(provider)
  }

  await writeSettings(data)
  return toPublic(provider)
}

export async function deleteProvider(id: string): Promise<void> {
  const data = await readSettings()
  data.providers = data.providers.filter((provider) => provider.id !== id)
  await writeSettings(data)
}

export async function testConnection(
  input: ConnectionTestInput
): Promise<ConnectionTestResult> {
  try {
    const data = await readSettings()
    const stored = input.id
      ? data.providers.find((provider) => provider.id === input.id)
      : undefined

    const type = input.type ?? stored?.type ?? 'openai-compat'
    const apiKey =
      input.apiKey?.trim() ||
      (stored?.encryptedKey ? decryptKey(stored.encryptedKey) : '')
    const secretKey =
      input.secretKey?.trim() ||
      (stored?.encryptedSecret ? decryptKey(stored.encryptedSecret) : '')
    const baseUrl = input.baseUrl.trim().replace(/\/+$/, '')

    if (!baseUrl) return { ok: false, message: 'Base URL 不能为空' }
    if (!apiKey) return { ok: false, message: 'API Key 不能为空' }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)

    if (type === 'kling') {
      const response = await fetch(`${baseUrl}/v1/videos/text2video/0`, {
        headers: { Authorization: klingAuthorization(apiKey, secretKey) },
        signal: controller.signal
      })
      clearTimeout(timer)

      if (response.status === 401 || response.status === 403) {
        const text = await response.text().catch(() => '')
        return {
          ok: false,
          message: `鉴权失败 HTTP ${response.status}: ${text.slice(0, 200)}`
        }
      }

      return { ok: true, message: '连接成功（鉴权通过）' }
    }

    const response = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal
    })
    clearTimeout(timer)

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      return { ok: false, message: `HTTP ${response.status} ${text.slice(0, 200)}` }
    }

    const json = (await response.json().catch(() => null)) as { data?: unknown[] } | null
    const count = Array.isArray(json?.data) ? json.data.length : 0

    return {
      ok: true,
      message: count > 0 ? `连接成功，发现 ${count} 个模型` : '连接成功'
    }
  } catch (error) {
    return { ok: false, message: String(error) }
  }
}
