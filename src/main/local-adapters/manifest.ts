import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { ModelDef } from '@shared/provider-schema'

export type LocalAdapterType = 'config' | 'template' | 'code'

export interface LocalAdapterManifest {
  id: string
  version: string
  type: LocalAdapterType
  entry?: string
  models?: string
  tests?: string[]
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
  template: 'template.json'
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
  if (type !== 'config' && type !== 'template' && type !== 'code') {
    throw new Error('manifest.type 必须是 config / template / code')
  }

  const tests = Array.isArray(item.tests)
    ? item.tests.filter((entry): entry is string => typeof entry === 'string')
    : undefined

  return {
    id,
    version,
    type,
    entry: asString(item.entry) ?? DEFAULT_ENTRY[type],
    models: asString(item.models) ?? 'models.json',
    ...(tests && tests.length > 0 ? { tests } : {})
  }
}

function parseProvider(
  raw: unknown,
  adapterId: string
): LocalAdapterProviderConfig {
  const item =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {}
  const headers =
    item.headers && typeof item.headers === 'object' && !Array.isArray(item.headers)
      ? Object.fromEntries(
          Object.entries(item.headers as Record<string, unknown>)
            .map(([key, value]) => [key, asString(value)])
            .filter((entry): entry is [string, string] => Boolean(entry[1]))
        )
      : undefined

  return {
    id: asString(item.id) ?? `local:${adapterId}`,
    name: asString(item.name) ?? adapterId,
    baseUrl: asString(item.baseUrl) ?? '',
    ...(headers && Object.keys(headers).length > 0 ? { headers } : {}),
    ...(asString(item.apiKeyEnv) ? { apiKeyEnv: asString(item.apiKeyEnv) } : {})
  }
}

function parseModel(raw: unknown, adapterId: string, index: number): ModelDef {
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

  return {
    ...(item as unknown as ModelDef),
    id,
    name,
    capability: capability as ModelDef['capability'],
    remoteModel,
    params: params as ModelDef['params'],
    ...(modes ? { modes: modes as ModelDef['modes'] } : {}),
    ...(inputs ? { inputs: inputs as ModelDef['inputs'] } : {}),
    adapter: `local:${adapterId}`,
    localAdapter: adapterId,
    source: {
      kind: 'manual',
      notes: `本地适配器 ${adapterId}`
    }
  }
}

export function parseModelsFile(
  raw: unknown,
  adapterId: string
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
    provider: parseProvider(item.provider, adapterId),
    models: item.models.map((model, index) =>
      parseModel(model, adapterId, index)
    )
  }
}

export async function readLocalAdapter(dir: string): Promise<LocalAdapterData> {
  const manifest = parseManifest(await readJson(join(dir, 'manifest.json')))
  const modelsFile = join(dir, manifest.models ?? 'models.json')
  const parsed = parseModelsFile(await readJson(modelsFile), manifest.id)
  return { manifest, ...parsed }
}
