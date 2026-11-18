import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import {
  MODEL_PRESETS,
  inferModelInputs,
  inferModelOperations,
  type Capability,
  type ConfigSource,
  type MediaInput,
  type ModelDef,
  type ModelFeature,
  type ParamDef,
  type ProviderConfig,
  type ProviderType
} from '@shared/provider-schema'
import {
  isModelModeId,
  normalizeModelModes,
  type ModelModeConfig,
  type ModelModeId
} from '@shared/model-modes'
import {
  VIDEO_OPERATIONS,
  type VideoOperationId
} from '@shared/operation-schema'
import type {
  ModelsConfigStatus,
  ModelsFile,
  ModelsFileModel,
  ModelsFileProvider
} from '@shared/models-file'
import type { HttpTemplate } from '@shared/http-template'
import {
  applyProtocolTemplate,
  findProtocolTemplate,
  matchModelRule,
  mergeModeConfigs
} from '@shared/protocol-templates'

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
  'kling-video',
  'sora-video'
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

const VIDEO_OPERATION_IDS: VideoOperationId[] = VIDEO_OPERATIONS.map(
  (operation) => operation.id
)

function validateOperations(
  operations: unknown,
  path: string,
  errors: string[]
): VideoOperationId[] | undefined {
  if (operations === undefined) return undefined
  if (!Array.isArray(operations)) {
    errors.push(`${path}.operations 必须是数组`)
    return undefined
  }

  const result: VideoOperationId[] = []
  for (const item of operations) {
    if (
      typeof item !== 'string' ||
      !VIDEO_OPERATION_IDS.includes(item as VideoOperationId)
    ) {
      errors.push(
        `${path}.operations 只能是 ${VIDEO_OPERATION_IDS.join(' / ')}`
      )
      continue
    }
    if (!result.includes(item as VideoOperationId)) {
      result.push(item as VideoOperationId)
    }
  }

  return result
}

const MODEL_FEATURES: ModelFeature[] = [
  'sequential',
  'layer',
  'ocr',
  'rgba',
  'audio',
  'last-frame',
  'multi-shot',
  'mask'
]

function validateModes(
  value: unknown,
  path: string,
  errors: string[]
): Array<ModelModeId | ModelModeConfig> | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) {
    errors.push(`${path}.modes 必须是数组`)
    return undefined
  }

  const normalized = normalizeModelModes(value)
  if (normalized.length !== value.length) {
    errors.push(`${path}.modes 包含未知模式或重复项`)
  }
  return normalized.length > 0 ? normalized : undefined
}

function validateFeatures(
  value: unknown,
  path: string,
  errors: string[]
): ModelFeature[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) {
    errors.push(`${path}.features 必须是数组`)
    return undefined
  }

  const result: ModelFeature[] = []
  for (const item of value) {
    if (
      typeof item !== 'string' ||
      !MODEL_FEATURES.includes(item as ModelFeature)
    ) {
      errors.push(`${path}.features 包含未知特性：${String(item)}`)
      continue
    }
    if (!result.includes(item as ModelFeature)) {
      result.push(item as ModelFeature)
    }
  }
  return result.length > 0 ? result : undefined
}

function validateSource(
  value: unknown,
  path: string,
  errors: string[]
): ConfigSource | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) {
    errors.push(`${path}.source 必须是对象`)
    return undefined
  }

  const kind = readString(value.kind)
  if (
    !kind ||
    !['preset', 'template', 'manual', 'agent'].includes(kind)
  ) {
    errors.push(`${path}.source.kind 必须是 preset / template / manual / agent`)
    return undefined
  }

  const confidence = readString(value.confidence)
  if (confidence && !['high', 'medium', 'low'].includes(confidence)) {
    errors.push(`${path}.source.confidence 必须是 high / medium / low`)
  }

  return {
    kind: kind as ConfigSource['kind'],
    ...(readString(value.url) ? { url: readString(value.url) } : {}),
    ...(readString(value.retrievedAt)
      ? { retrievedAt: readString(value.retrievedAt) }
      : {}),
    ...(confidence && ['high', 'medium', 'low'].includes(confidence)
      ? { confidence: confidence as ConfigSource['confidence'] }
      : {}),
    ...(readString(value.notes) ? { notes: readString(value.notes) } : {})
  }
}

function validateExtraBody(
  value: unknown,
  path: string,
  errors: string[]
): Record<string, unknown> | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) {
    errors.push(`${path}.extraBody 必须是对象`)
    return undefined
  }
  return value
}

function validateOmitBody(
  value: unknown,
  path: string,
  errors: string[]
): string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) {
    errors.push(`${path}.omitBody 必须是字符串数组`)
    return undefined
  }

  const result: string[] = []
  for (const item of value) {
    const key = readString(item)
    if (!key) {
      errors.push(`${path}.omitBody 只能包含非空字符串`)
      continue
    }
    if (!result.includes(key)) result.push(key)
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
    if (readString(item.description)) {
      param.description = readString(item.description)
    }
    if (Array.isArray(item.appliesTo)) {
      const appliesTo = item.appliesTo.filter(isModelModeId)
      if (appliesTo.length !== item.appliesTo.length) {
        errors.push(`${itemPath}.appliesTo 包含未知模式`)
      }
      if (appliesTo.length > 0) param.appliesTo = appliesTo
    }
    if (isRecord(item.when)) {
      param.when = item.when as ParamDef['when']
    }
    if (Array.isArray(item.force) || isRecord(item.force)) {
      param.force = item.force as unknown as ParamDef['force']
    }
    if (Array.isArray(item.forbid)) {
      param.forbid = item.forbid
        .map((key) => readString(key))
        .filter((key): key is string => Boolean(key))
    }
    if (Array.isArray(item.deny) || isRecord(item.deny)) {
      param.deny = item.deny as unknown as ParamDef['deny']
    }

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
  const operations = validateOperations(item.operations, path, errors)
  const modes = validateModes(item.modes, path, errors)
  const features = validateFeatures(item.features, path, errors)
  const source = validateSource(item.source, path, errors)
  const extraBody = validateExtraBody(item.extraBody, path, errors)
  const omitBody = validateOmitBody(item.omitBody, path, errors)

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
    ...(operations ? { operations } : {}),
    ...(modes ? { modes } : {}),
    ...(features ? { features } : {}),
    ...(readString(item.family) ? { family: readString(item.family) } : {}),
    ...(readString(item.protocol) ? { protocol: readString(item.protocol) } : {}),
    ...(source ? { source } : {}),
    ...(adapter ? { adapter } : {}),
    ...(providerType ? { providerType } : {}),
    ...(isRecord(template) ? { template: template as unknown as HttpTemplate } : {}),
    ...(extraBody ? { extraBody } : {}),
    ...(omitBody ? { omitBody } : {}),
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
    const protocol = readString(item.protocol)
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
      ...(protocol ? { protocol } : {}),
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

export function pendingModelsFilePath(): string {
  return join(app.getPath('userData'), 'models.pending.json')
}

export interface PendingModelsConfig {
  file: string
  exists: boolean
  providers: ModelsFileProvider[]
  errors: string[]
  warnings: string[]
}

export async function loadPendingModels(): Promise<PendingModelsConfig> {
  const file = pendingModelsFilePath()

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

/** 备份现有 models.json，然后把 pending 文件应用为正式配置 */
export async function applyPendingModels(): Promise<{
  applied: boolean
  message?: string
  providers?: number
}> {
  const pending = pendingModelsFilePath()
  const target = modelsFilePath()

  let raw: string
  try {
    raw = await fs.readFile(pending, 'utf8')
  } catch {
    return { applied: false, message: '没有找到待应用的配置' }
  }

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch (error) {
    return { applied: false, message: `JSON 解析失败：${String(error)}` }
  }

  const parsed = parseModelsFile(json, pending)
  if (parsed.errors.length > 0) {
    return { applied: false, message: parsed.errors[0] }
  }

  try {
    await fs.access(target)
    await fs.copyFile(target, `${target}.bak`)
  } catch {
    // 没有旧文件时不备份
  }

  await fs.mkdir(dirname(target), { recursive: true })
  await fs.writeFile(target, raw, 'utf8')
  await fs.unlink(pending).catch(() => undefined)
  return { applied: true, providers: parsed.providers.length }
}

export async function discardPendingModels(): Promise<void> {
  await fs.unlink(pendingModelsFilePath()).catch(() => undefined)
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

/**
 * 参数合并：预设当底稿，用户同 key 覆盖，预设新增的 key 自动补上。
 * 用户完全删除某个预设参数时，升级后会被重新加回来（见 docs/model-config-merge-plan.md）。
 */
function mergeParams(
  base: ParamDef[] | undefined,
  override: ParamDef[] | undefined
): ParamDef[] {
  if (!base || base.length === 0) return override ?? []
  if (!override || override.length === 0) return base

  const merged = new Map<string, ParamDef>()
  for (const param of base) merged.set(param.key, param)
  for (const param of override) merged.set(param.key, param)
  return [...merged.values()]
}

export function resolveModels(provider: ModelsFileProvider): ModelDef[] {
  return provider.models.map((item) => {
    const preset = item.preset
      ? MODEL_PRESETS.find((model) => model.id === item.preset)
      : undefined

    const remoteModel = item.remoteModel ?? preset?.remoteModel ?? item.id
    const capability = item.capability ?? preset?.capability ?? 'image.t2i'
    const protocol = item.protocol ?? provider.protocol ?? preset?.protocol
    const protocolTemplate = findProtocolTemplate(protocol)
    const protocolRule = matchModelRule(remoteModel)
    const protocolDefaults = protocolTemplate
      ? applyProtocolTemplate(protocolTemplate, protocolRule)
      : undefined
    const adapter =
      item.adapter ??
      provider.adapter ??
      preset?.adapter ??
      protocolTemplate?.adapter ??
      inferAdapter(remoteModel)
    const template =
      item.template ?? preset?.template ?? protocolDefaults?.template
    const overrideModes = item.modes ?? preset?.modes
    const modes =
      overrideModes && protocolDefaults?.modes
        ? mergeModeConfigs(
            protocolDefaults.modes,
            normalizeModelModes(overrideModes)
          )
        : (overrideModes ?? protocolDefaults?.modes)
    const features =
      item.features ?? preset?.features ?? protocolDefaults?.features
    const family = item.family ?? preset?.family
    const source = item.source ?? preset?.source
    const inputs =
      item.inputs ??
      (modes
        ? inferModelInputs({ capability, remoteModel, adapter, template, modes })
        : (preset?.inputs ??
          inferModelInputs({ capability, remoteModel, adapter, template })))
    const operations =
      item.operations ??
      (modes
        ? inferModelOperations({
            capability,
            remoteModel,
            adapter,
            template,
            modes
          })
        : (preset?.operations ??
          inferModelOperations({ capability, remoteModel, adapter, template })))
    const mergedParams = mergeParams(preset?.params, item.params)
    const params =
      mergedParams.length > 0
        ? mergedParams
        : (protocolDefaults?.params ?? [])
    const extraBody =
      item.extraBody ?? preset?.extraBody ?? protocolDefaults?.extraBody
    const omitBody =
      item.omitBody ?? preset?.omitBody ?? protocolDefaults?.omitBody

    return {
      id: item.id,
      ...(item.preset ? { preset: item.preset } : {}),
      name: item.name ?? preset?.name ?? item.id,
      capability,
      remoteModel,
      inputs,
      operations,
      ...(modes ? { modes } : {}),
      ...(features ? { features } : {}),
      ...(family ? { family } : {}),
      ...(protocol ? { protocol } : {}),
      ...(source ? { source } : {}),
      params,
      adapter,
      ...(item.providerType ?? preset?.providerType
        ? { providerType: item.providerType ?? preset?.providerType }
        : {}),
      ...(template ? { template } : {}),
      ...(extraBody ? { extraBody } : {}),
      ...(omitBody ? { omitBody } : {})
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
