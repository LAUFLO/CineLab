import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { ModelDef } from '@shared/provider-schema'
import type { HttpTemplate } from '@shared/http-template'

export type LocalAdapterType = 'config' | 'template' | 'code' | 'sidecar'

export interface SidecarHealthConfig {
  path: string
  intervalMs: number
}

export interface LocalAdapterManifest {
  id: string
  version: string
  type: LocalAdapterType
  entry?: string
  models?: string
  tests?: string[]
  /** sidecar 协议；openai 复用 openai-compat，http-template 复用模板 */
  protocol?: 'openai' | 'http-template'
  /** http-template sidecar 的模板文件，默认 template.json */
  template?: string
  /** sidecar 基础地址，只允许本机 */
  baseUrl?: string
  headers?: Record<string, string>
  apiKeyEnv?: string
  health?: SidecarHealthConfig
}

export interface LocalAdapterProviderConfig {
  id: string
  name: string
  baseUrl: string
  headers?: Record<string, string>
  apiKeyEnv?: string
}

export interface LocalAdapterData {
  manifest: LocalAdapterManifest
  provider: LocalAdapterProviderConfig
  models: ModelDef[]
}

const DEFAULT_ENTRY: Record<LocalAdapterType, string> = {
  code: 'adapter.ts',
  config: 'models.json',
  template: 'template.json',
  sidecar: ''
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as unknown
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`读取 ${file} 失败：${reason}`)
  }
}

function parseStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, item]) => [key, asString(item)] as const)
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

export function parseManifest(raw: unknown): LocalAdapterManifest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('manifest.json 必须是对象')
  }

  const item = raw as Record<string, unknown>
  const id = asString(item.id)
  if (!id) throw new Error('manifest.id 不能为空')
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(id)) {
    throw new Error('manifest.id 只能包含字母、数字和连字符')
  }

  const version = asString(item.version) ?? '0.0.0'
  const type = asString(item.type) ?? 'code'
  if (
    type !== 'config' &&
    type !== 'template' &&
    type !== 'code' &&
    type !== 'sidecar'
  ) {
    throw new Error('manifest.type 必须是 config / template / code / sidecar')
  }

  const protocol = asString(item.protocol) as
    | 'openai'
    | 'http-template'
    | undefined
  if (
    protocol &&
    protocol !== 'openai' &&
    protocol !== 'http-template'
  ) {
    throw new Error('manifest.protocol 必须是 openai / http-template')
  }

  const baseUrl = asString(item.baseUrl)
  if (type === 'sidecar' && !baseUrl) {
    throw new Error('sidecar 必须配置 manifest.baseUrl')
  }

  const healthRaw =
    item.health && typeof item.health === 'object' && !Array.isArray(item.health)
      ? (item.health as Record<string, unknown>)
      : {}
  const healthInterval = Number(healthRaw.intervalMs)
  const health: SidecarHealthConfig | undefined =
    type === 'sidecar'
      ? {
          path: asString(healthRaw.path) ?? '/health',
          intervalMs:
            Number.isFinite(healthInterval) && healthInterval > 0
              ? healthInterval
              : 30_000
        }
      : undefined

  const tests = Array.isArray(item.tests)
    ? item.tests.filter((entry): entry is string => typeof entry === 'string')
    : undefined

  const entry =
    asString(item.entry) ??
    (type === 'sidecar' ? undefined : DEFAULT_ENTRY[type])

  return {
    id,
    version,
    type,
    ...(entry ? { entry } : {}),
    models: asString(item.models) ?? 'models.json',
    ...(type === 'sidecar' ? { protocol: protocol ?? 'openai' } : {}),
    ...(type === 'sidecar' && (protocol ?? 'openai') === 'http-template'
      ? { template: asString(item.template) ?? 'template.json' }
      : {}),
    ...(baseUrl ? { baseUrl } : {}),
    ...(parseStringRecord(item.headers)
      ? { headers: parseStringRecord(item.headers) }
      : {}),
    ...(asString(item.apiKeyEnv) ? { apiKeyEnv: asString(item.apiKeyEnv) } : {}),
    ...(health ? { health } : {}),
    ...(tests && tests.length > 0 ? { tests } : {})
  }
}

function parseProvider(
  raw: unknown,
  adapterId: string,
  type: LocalAdapterType
): LocalAdapterProviderConfig {
  const item =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {}
  const headers = parseStringRecord(item.headers)

  return {
    id:
      asString(item.id) ??
      (type === 'sidecar' ? `sidecar:${adapterId}` : `local:${adapterId}`),
    name: asString(item.name) ?? adapterId,
    baseUrl: asString(item.baseUrl) ?? '',
    ...(headers ? { headers } : {}),
    ...(asString(item.apiKeyEnv) ? { apiKeyEnv: asString(item.apiKeyEnv) } : {})
  }
}

function parseModel(
  raw: unknown,
  adapterId: string,
  index: number,
  type: LocalAdapterType,
  protocol: 'openai' | 'http-template'
): ModelDef {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`models[${index}] 必须是对象`)
  }

  const item = raw as Record<string, unknown>
  const id = asString(item.id)
  const name = asString(item.name)
  const capability = asString(item.capability)
  const remoteModel = asString(item.remoteModel)
  if (!id) throw new Error(`models[${index}].id 不能为空`)
  if (!name) throw new Error(`models[${index}].name 不能为空`)
  if (!capability) throw new Error(`models[${index}].capability 不能为空`)
  if (!remoteModel) throw new Error(`models[${index}].remoteModel 不能为空`)

  const params = Array.isArray(item.params) ? item.params : []
  const modes = Array.isArray(item.modes) ? item.modes : undefined
  const inputs = Array.isArray(item.inputs) ? item.inputs : undefined
  const adapter =
    type === 'sidecar'
      ? asString(item.adapter) ??
        (protocol === 'http-template' ? 'http-template' : 'openai-compat')
      : `local:${adapterId}`

  return {
    ...(item as unknown as ModelDef),
    id,
    name,
    capability: capability as ModelDef['capability'],
    remoteModel,
    params: params as ModelDef['params'],
    ...(modes ? { modes: modes as ModelDef['modes'] } : {}),
    ...(inputs ? { inputs: inputs as ModelDef['inputs'] } : {}),
    adapter,
    localAdapter: adapterId,
    source: {
      kind: 'manual',
      notes:
        type === 'sidecar'
          ? `Sidecar 适配器 ${adapterId}`
          : `本地适配器 ${adapterId}`
    }
  }
}

export function parseModelsFile(
  raw: unknown,
  adapterId: string,
  type: LocalAdapterType = 'code',
  protocol: 'openai' | 'http-template' = 'openai'
): {
  provider: LocalAdapterProviderConfig
  models: ModelDef[]
} {
  const item = Array.isArray(raw)
    ? { models: raw }
    : raw && typeof raw === 'object'
      ? (raw as Record<string, unknown>)
      : null
  if (!item) throw new Error('models.json 必须是对象或模型数组')
  if (!Array.isArray(item.models)) {
    throw new Error('models.json 缺少 models 数组')
  }

  return {
    provider: parseProvider(item.provider, adapterId, type),
    models: item.models.map((model, index) =>
      parseModel(model, adapterId, index, type, protocol)
    )
  }
}

export async function readLocalAdapter(dir: string): Promise<LocalAdapterData> {
  const manifest = parseManifest(await readJson(join(dir, 'manifest.json')))
  const modelsFile = join(dir, manifest.models ?? 'models.json')
  const parsed = parseModelsFile(
    await readJson(modelsFile),
    manifest.id,
    manifest.type,
    manifest.protocol ?? 'openai'
  )

  if (
    manifest.type === 'sidecar' &&
    manifest.protocol === 'http-template' &&
    parsed.models.some((model) => !model.template)
  ) {
    const templateFile = join(dir, manifest.template ?? 'template.json')
    const template = await readJson(templateFile)
    if (!template || typeof template !== 'object' || Array.isArray(template)) {
      throw new Error(`${templateFile} 必须是 http-template 对象`)
    }
    parsed.models = parsed.models.map((model) => ({
      ...model,
      template: model.template ?? (template as HttpTemplate)
    }))
  }

  return { manifest, ...parsed }
}
