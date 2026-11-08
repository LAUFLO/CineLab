import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import {
  MODEL_PRESETS,
  inferModelInputs,
  type Capability,
  type MediaInput,
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

const MEDIA_INPUTS: MediaInput[] = ['text', 'image', 'video', 'audio']

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
  warnings: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function validateInputs(
  inputs: unknown,
  path: string,
  errors: string[]
): MediaInput[] | undefined {
  if (inputs === undefined) return undefined
  if (!Array.isArray(inputs)) {
    errors.push(`${path}.inputs 必须是数组`)
    return undefined
  }

  const result: MediaInput[] = []
  for (const item of inputs) {
    if (typeof item !== 'string' || !MEDIA_INPUTS.includes(item as MediaInput)) {
      errors.push(`${path}.inputs 只能是 ${MEDIA_INPUTS.join(' / ')}`)
      continue
    }
    if (!result.includes(item as MediaInput)) {
      result.push(item as MediaInput)
    }
  }

  if (result.length === 0) {
    errors.push(`${path}.inputs 至少需要一项`)
    return undefined
  }

  return result
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
    if (readString(item.group)) param.group = readString(item.group)
    if (item.min !== undefined) param.min = Number(item.min)
    if (item.max !== undefined) param.max = Number(item.max)
    if (item.allowCustom === true) param.allowCustom = true

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

  const providerType = readString(item.providerType) as ProviderType | undefined
  if (providerType && !PROVIDER_TYPES.includes(providerType)) {
    errors.push(`${path}.providerType 必须是 ${PROVIDER_TYPES.join(' / ')}`)
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
  const inputs = validateInputs(item.inputs, path, errors)

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
    ...(inputs ? { inputs } : {}),
    ...(adapter ? { adapter } : {}),
    ...(providerType ? { providerType } : {}),
    ...(isRecord(template) ? { template: template as unknown as HttpTemplate } : {}),
    ...(params ? { params } : {})
  }
}

function validateHeaders(
  value: unknown,
  path: string,
  errors: string[]
): Record<string, string> | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) {
    errors.push(`${path} 必须是对象`)
    return undefined
  }

  const headers: Record<string, string> = {}
  for (const [rawKey, entry] of Object.entries(value)) {
    const key = rawKey.trim()
    if (!key) {
      errors.push(`${path} 存在空 header 名称`)
      continue
    }
    if (typeof entry !== 'string') {
      errors.push(`${path}.${key} 必须是字符串`)
      continue
    }
    headers[key] = entry
  }

  return headers
}

export function parseModelsFile(input: unknown, file: string): ParsedModels {
  const errors: string[] = []
  const warnings: string[] = []
  const providers: ModelsFileProvider[] = []

  if (!isRecord(input)) {
    return { providers, errors: [`${file}: 根节点必须是对象`], warnings }
  }

  const version = Number(input.version ?? 1)
  if (version !== 1) {
    errors.push(`${file}: version 只支持 1`)
  }

  if (!Array.isArray(input.providers)) {
    errors.push(`${file}: providers 必须是数组`)
    return { providers, errors, warnings }
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

    const headers = validateHeaders(item.headers, `${path}.headers`, errors)

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
    if (apiKey) {
      warnings.push(
        `${path}.apiKey 是明文 Key，已忽略；请在设置页填写 Key，或改用 apiKeyEnv`
      )
    }

    providers.push({
      id,
      name,
      ...(type ? { type } : {}),
      ...(adapter ? { adapter } : {}),
      baseUrl,
      ...(headers && Object.keys(headers).length > 0 ? { headers } : {}),
      ...(apiKeyEnv ? { apiKeyEnv } : {}),
      models
    })
  })

  return { providers, errors, warnings }
}

/** 唯一的模型配置文件：用户数据目录下的 models.json */
export function modelsFilePath(): string {
  return join(app.getPath('userData'), 'models.json')
}

export interface LoadedModelsConfig {
  file: string
  exists: boolean
  providers: ModelsFileProvider[]
  errors: string[]
  warnings: string[]
}

export async function loadModelsConfig(): Promise<LoadedModelsConfig> {
  const file = modelsFilePath()

  let raw: string
  try {
    raw = await fs.readFile(file, 'utf8')
  } catch {
    return { file, exists: false, providers: [], errors: [], warnings: [] }
  }

  let json: unknown
  try {
    json = JSON.parse(raw) as ModelsFile
  } catch (error) {
    return {
      file,
      exists: true,
      providers: [],
      errors: [`${file}: JSON 解析失败：${String(error)}`],
      warnings: []
    }
  }

  const parsed = parseModelsFile(json, file)
  return {
    file,
    exists: true,
    providers: parsed.providers,
    errors: parsed.errors,
    warnings: parsed.warnings
  }
}

/** 把 provider 列表原子写入 models.json；永远不会写入 apiKey 明文字段 */
export async function saveModelsConfig(
  providers: ModelsFileProvider[]
): Promise<void> {
  const file = modelsFilePath()
  await fs.mkdir(dirname(file), { recursive: true })

  const safeProviders = providers.map((provider) => {
    const copy = { ...provider }
    delete copy.apiKey
    return copy
  })
  const payload: ModelsFile = { version: 1, providers: safeProviders }

  const tmp = `${file}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`
  await fs.writeFile(tmp, JSON.stringify(payload, null, 2), 'utf8')

  try {
    await fs.rename(tmp, file)
  } catch {
    await fs.rm(file, { force: true })
    await fs.rename(tmp, file)
  }
}

let writeChain: Promise<unknown> = Promise.resolve()

/** 串行执行 models.json 写操作，避免并发保存互相覆盖 */
export function enqueueModelsWrite<T>(task: () => Promise<T>): Promise<T> {
  const next = writeChain.then(task, task)
  writeChain = next.catch(() => undefined)
  return next
}

export function upsertModelsProvider(
  providers: ModelsFileProvider[],
  provider: ModelsFileProvider
): ModelsFileProvider[] {
  const index = providers.findIndex((item) => item.id === provider.id)
  if (index < 0) return [...providers, provider]
  return providers.map((item, itemIndex) => (itemIndex === index ? provider : item))
}

export function removeModelsProvider(
  providers: ModelsFileProvider[],
  id: string
): ModelsFileProvider[] {
  return providers.filter((provider) => provider.id !== id)
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
    const capability = item.capability ?? preset?.capability ?? 'image.t2i'
    const adapter =
      item.adapter ??
      provider.adapter ??
      preset?.adapter ??
      inferAdapter(remoteModel)
    const template = item.template ?? preset?.template
    const inputs =
      item.inputs ??
      preset?.inputs ??
      inferModelInputs({ capability, remoteModel, adapter, template })

    return {
      id: item.id,
      name: item.name ?? preset?.name ?? item.id,
      capability,
      remoteModel,
      inputs,
      params: item.params ?? preset?.params ?? [],
      adapter,
      ...(item.providerType ?? preset?.providerType
        ? { providerType: item.providerType ?? preset?.providerType }
        : {}),
      ...(template ? { template } : {})
    }
  })
}

export function toModelsProvider(
  provider: ModelsFileProvider,
  stored?: { encryptedKey?: string; encryptedSecret?: string }
): ProviderConfig {
  const envKey = provider.apiKeyEnv
    ? process.env[provider.apiKeyEnv]
    : undefined

  return {
    id: provider.id,
    name: provider.name,
    type: provider.type ?? 'openai-compat',
    baseUrl: provider.baseUrl,
    ...(provider.headers ? { headers: provider.headers } : {}),
    models: resolveModels(provider),
    hasKey: Boolean(stored?.encryptedKey) || Boolean(envKey),
    hasSecret: Boolean(stored?.encryptedSecret),
    createdAt: '',
    updatedAt: ''
  }
}

export async function modelsConfigStatus(): Promise<ModelsConfigStatus> {
  const config = await loadModelsConfig()
  return {
    files: [config.file],
    activeFile: config.file,
    errors: config.errors,
    warnings: config.warnings,
    providerCount: config.providers.length,
    modelCount: config.providers.reduce(
      (total, provider) => total + provider.models.length,
      0
    )
  }
}

export async function ensureModelsFile(): Promise<string> {
  const file = modelsFilePath()
  try {
    await fs.access(file)
    return file
  } catch {
    await fs.mkdir(dirname(file), { recursive: true })
    await fs.writeFile(
      file,
      JSON.stringify({ version: 1, providers: [] }, null, 2),
      'utf8'
    )
    return file
  }
}
