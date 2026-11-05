import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  MODEL_PRESETS,
  type Capability,
  type ModelDef,
  type ParamDef,
  type ProviderConfig,
  type ProviderType
} from '@shared/provider-schema'
import type {
  ModelsConfigStatus,
  ModelsFile,
  ModelsFileModel,
  ModelsFileProvider
} from '@shared/models-file'
import type { HttpTemplate } from '@shared/http-template'

const CAPABILITIES: Capability[] = [
  'image.t2i',
  'image.i2i',
  'text.chat',
  'video.t2v',
  'audio.tts',
  'audio.music'
]

const PROVIDER_TYPES: ProviderType[] = ['openai-compat', 'kling']

const ADAPTERS = [
  'openai-compat',
  'agnes-video',
  'volcengine-video',
  'http-template',
  'minimax-video',
  'minimax-legacy',
  'kling-video'
]

const PARAM_TYPES = ['select', 'number', 'text', 'boolean']

interface ParsedModels {
  providers: ModelsFileProvider[]
  errors: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function validateParams(
  params: unknown,
  path: string,
  errors: string[]
): ParamDef[] | undefined {
  if (params === undefined) return undefined
  if (!Array.isArray(params)) {
    errors.push(`${path}.params 必须是数组`)
    return undefined
  }

  const result: ParamDef[] = []
  params.forEach((item, index) => {
    const itemPath = `${path}.params[${index}]`
    if (!isRecord(item)) {
      errors.push(`${itemPath} 必须是对象`)
      return
    }

    const key = readString(item.key)
    const label = readString(item.label)
    const type = readString(item.type)

    if (!key) errors.push(`${itemPath}.key 不能为空`)
    if (!label) errors.push(`${itemPath}.label 不能为空`)
    if (!type || !PARAM_TYPES.includes(type)) {
      errors.push(`${itemPath}.type 必须是 ${PARAM_TYPES.join(' / ')}`)
    }
    if (!key || !label || !type) return

    const param: ParamDef = {
      key,
      label,
      type: type as ParamDef['type']
    }

    if (item.defaultValue !== undefined) {
      param.defaultValue = item.defaultValue as ParamDef['defaultValue']
    }
    if (item.min !== undefined) param.min = Number(item.min)
    if (item.max !== undefined) param.max = Number(item.max)

    if (type === 'select') {
      if (!Array.isArray(item.options) || item.options.length === 0) {
        errors.push(`${itemPath}.options 不能为空`)
        return
      }

      const options = item.options
        .map((option, optionIndex) => {
          if (!isRecord(option)) {
            errors.push(`${itemPath}.options[${optionIndex}] 必须是对象`)
            return null
          }
          const value = readString(option.value) ?? String(option.value ?? '')
          const optionLabel = readString(option.label) ?? value
          if (!value) {
            errors.push(`${itemPath}.options[${optionIndex}].value 不能为空`)
            return null
          }
          return { value, label: optionLabel }
        })
        .filter((option): option is { value: string; label: string } => Boolean(option))

      if (options.length === 0) return
      param.options = options
    }

    result.push(param)
  })

  return result
}

function validateModel(
  item: unknown,
  path: string,
  errors: string[]
): ModelsFileModel | null {
  if (!isRecord(item)) {
    errors.push(`${path} 必须是对象`)
    return null
  }

  const id = readString(item.id)
  if (!id) {
    errors.push(`${path}.id 不能为空`)
    return null
  }

  const preset = readString(item.preset)
  if (preset && !MODEL_PRESETS.some((model) => model.id === preset)) {
    errors.push(`${path}.preset 不存在：${preset}`)
    return null
  }

  if (!preset) {
    if (!readString(item.name)) errors.push(`${path}.name 不能为空`)
    if (!readString(item.remoteModel)) errors.push(`${path}.remoteModel 不能为空`)

    const capability = readString(item.capability)
    if (!capability || !CAPABILITIES.includes(capability as Capability)) {
      errors.push(
        `${path}.capability 必须是 ${CAPABILITIES.join(' / ')}`
      )
    }
  }

  const adapter = readString(item.adapter)
  if (adapter && !ADAPTERS.includes(adapter)) {
    errors.push(`${path}.adapter 不支持：${adapter}，可用值 ${ADAPTERS.join(' / ')}`)
  }

  const template = item.template
  if (template !== undefined) {
    if (!isRecord(template)) {
      errors.push(`${path}.template 必须是对象`)
    } else {
      if (!isRecord(template.submit)) {
        errors.push(`${path}.template.submit 必须是对象`)
      }
      if (!isRecord(template.poll)) {
        errors.push(`${path}.template.poll 必须是对象`)
      } else {
        if (!readString(template.poll.taskIdPath)) {
          errors.push(`${path}.template.poll.taskIdPath 不能为空`)
        }
        if (!readString(template.poll.resultPath)) {
          errors.push(`${path}.template.poll.resultPath 不能为空`)
        }
      }
    }
  }

  const params = validateParams(item.params, path, errors)

  return {
    id,
    ...(preset ? { preset } : {}),
    ...(readString(item.name) ? { name: readString(item.name) } : {}),
    ...(readString(item.capability)
      ? { capability: readString(item.capability) as Capability }
      : {}),
    ...(readString(item.remoteModel)
      ? { remoteModel: readString(item.remoteModel) }
      : {}),
    ...(adapter ? { adapter } : {}),
    ...(isRecord(template) ? { template: template as unknown as HttpTemplate } : {}),
    ...(params ? { params } : {})
  }
}

export function parseModelsFile(input: unknown, file: string): ParsedModels {
  const errors: string[] = []
  const providers: ModelsFileProvider[] = []

  if (!isRecord(input)) {
    return { providers, errors: [`${file}: 根节点必须是对象`] }
  }

  const version = Number(input.version ?? 1)
  if (version !== 1) {
    errors.push(`${file}: version 只支持 1`)
  }

  if (!Array.isArray(input.providers)) {
    errors.push(`${file}: providers 必须是数组`)
    return { providers, errors }
  }

  const providerIds = new Set<string>()

  input.providers.forEach((item, providerIndex) => {
    const path = `${file}: providers[${providerIndex}]`
    if (!isRecord(item)) {
      errors.push(`${path} 必须是对象`)
      return
    }

    const id = readString(item.id)
    const name = readString(item.name)
    const baseUrl = readString(item.baseUrl)

    if (!id) errors.push(`${path}.id 不能为空`)
    if (!name) errors.push(`${path}.name 不能为空`)
    if (!baseUrl) errors.push(`${path}.baseUrl 不能为空`)
    if (!id || !name || !baseUrl) return

    if (providerIds.has(id)) {
      errors.push(`${path}.id 重复：${id}`)
      return
    }
    providerIds.add(id)

    const type = readString(item.type) as ProviderType | undefined
    if (type && !PROVIDER_TYPES.includes(type)) {
      errors.push(`${path}.type 必须是 ${PROVIDER_TYPES.join(' / ')}`)
      return
    }

    const adapter = readString(item.adapter)
    if (adapter && !ADAPTERS.includes(adapter)) {
      errors.push(`${path}.adapter 不支持：${adapter}`)
      return
    }

    if (!Array.isArray(item.models) || item.models.length === 0) {
      errors.push(`${path}.models 不能为空`)
      return
    }

    const modelIds = new Set<string>()
    const models: ModelsFileModel[] = []

    item.models.forEach((modelItem, modelIndex) => {
      const model = validateModel(modelItem, `${path}.models[${modelIndex}]`, errors)
      if (!model) return
      if (modelIds.has(model.id)) {
        errors.push(`${path}.models[${modelIndex}].id 重复：${model.id}`)
        return
      }
      modelIds.add(model.id)
      models.push(model)
    })

    if (models.length === 0) return

    const apiKeyEnv = readString(item.apiKeyEnv)
    const apiKey = readString(item.apiKey)

    providers.push({
      id,
      name,
      ...(type ? { type } : {}),
      ...(adapter ? { adapter } : {}),
      baseUrl,
      ...(apiKeyEnv ? { apiKeyEnv } : {}),
      ...(apiKey ? { apiKey } : {}),
      models
    })
  })

  return { providers, errors }
}

export function modelsFileCandidates(): string[] {
  const files = [join(app.getPath('userData'), 'models.json')]
  if (!app.isPackaged) {
    const devFile = join(app.getAppPath(), 'models.json')
    if (!files.includes(devFile)) files.push(devFile)
  }
  return files
}

export interface LoadedModelsConfig {
  files: Array<{ path: string; exists: boolean }>
  providers: ModelsFileProvider[]
  errors: string[]
}

export async function loadModelsConfig(): Promise<LoadedModelsConfig> {
  const files: Array<{ path: string; exists: boolean }> = []
  const providers = new Map<string, ModelsFileProvider>()
  const errors: string[] = []

  for (const file of modelsFileCandidates()) {
    let raw: string

    try {
      raw = await fs.readFile(file, 'utf8')
    } catch {
      files.push({ path: file, exists: false })
      continue
    }

    files.push({ path: file, exists: true })

    let json: unknown
    try {
      json = JSON.parse(raw) as ModelsFile
    } catch (error) {
      errors.push(`${file}: JSON 解析失败：${String(error)}`)
      continue
    }

    const parsed = parseModelsFile(json, file)
    errors.push(...parsed.errors)
    for (const provider of parsed.providers) {
      providers.set(provider.id, provider)
    }
  }

  return { files, providers: [...providers.values()], errors }
}

function inferAdapter(remoteModel: string): string {
  if (/^agnes-video/i.test(remoteModel)) return 'agnes-video'
  if (/^kling-/i.test(remoteModel)) return 'kling-video'
  if (/^minimax-h3/i.test(remoteModel)) return 'minimax-video'
  if (/^minimax-hailuo/i.test(remoteModel)) return 'minimax-legacy'
  if (/seedance/i.test(remoteModel)) return 'volcengine-video'
  return 'openai-compat'
}

export function resolveModels(provider: ModelsFileProvider): ModelDef[] {
  return provider.models.map((item) => {
    const preset = item.preset
      ? MODEL_PRESETS.find((model) => model.id === item.preset)
      : undefined

    const remoteModel = item.remoteModel ?? preset?.remoteModel ?? item.id

    return {
      id: item.id,
      name: item.name ?? preset?.name ?? item.id,
      capability: item.capability ?? preset?.capability ?? 'image.t2i',
      remoteModel,
      params: item.params ?? preset?.params ?? [],
      adapter:
        item.adapter ??
        provider.adapter ??
        preset?.adapter ??
        inferAdapter(remoteModel),
      ...(item.template ?? preset?.template
        ? { template: item.template ?? preset?.template }
        : {})
    }
  })
}

export function toModelsProvider(
  provider: ModelsFileProvider,
  stored?: { encryptedKey?: string; encryptedSecret?: string; createdAt?: string; updatedAt?: string }
): ProviderConfig {
  const envKey = provider.apiKeyEnv
    ? process.env[provider.apiKeyEnv]
    : undefined

  return {
    id: provider.id,
    name: provider.name,
    type: provider.type ?? 'openai-compat',
    baseUrl: provider.baseUrl,
    models: resolveModels(provider),
    hasKey: Boolean(stored?.encryptedKey) || Boolean(envKey) || Boolean(provider.apiKey),
    hasSecret: Boolean(stored?.encryptedSecret),
    source: 'models',
    createdAt: stored?.createdAt ?? '',
    updatedAt: stored?.updatedAt ?? ''
  }
}

export async function modelsConfigStatus(): Promise<ModelsConfigStatus> {
  const config = await loadModelsConfig()
  return {
    files: config.files.map((file) => file.path),
    activeFile:
      config.files.find((file) => file.exists)?.path ??
      config.files[0]?.path ??
      null,
    errors: config.errors,
    providerCount: config.providers.length,
    modelCount: config.providers.reduce(
      (total, provider) => total + provider.models.length,
      0
    )
  }
}

export async function ensureModelsFile(): Promise<string> {
  const config = await loadModelsConfig()
  const existing = config.files.find((file) => file.exists)
  if (existing) return existing.path

  const target = modelsFileCandidates()[0]
  await fs.mkdir(dirname(target), { recursive: true })
  await fs.writeFile(
    target,
    JSON.stringify({ version: 1, providers: [] }, null, 2),
    'utf8'
  )
  return target
}
