import type { HttpTemplate } from './http-template'
import type { VideoOperationId } from './operation-schema'
import type {
  ModelModeConfig,
  ModelModeId,
  OperationSupport
} from './model-modes'
import {
  highestOperationSupport,
  modeMediaKinds,
  modeOperationIds,
  modeSupportsOperation,
  normalizeModelModes
} from './model-modes'

export type Capability =
  | 'image.t2i'
  | 'image.i2i'
  | 'text.chat'
  | 'video.t2v'
  | 'audio.tts'
  | 'audio.music'

/** 模型实际可接收的输入媒体类型 */
export type MediaInput = 'text' | 'image' | 'video' | 'audio'

export const MEDIA_INPUTS: MediaInput[] = ['text', 'image', 'video', 'audio']

export const MEDIA_INPUT_LABEL: Record<MediaInput, string> = {
  text: '文本',
  image: '图片',
  video: '视频',
  audio: '音频'
}

export type ProviderType = 'openai-compat' | 'kling'

export interface ParamOption {
  value: string
  label: string
}

export interface ParamCondition {
  mode?: ModelModeId
  params?: Record<string, unknown>
}

export interface ParamForce {
  when: ParamCondition
  value: unknown
}

export interface ParamDeny {
  when: ParamCondition
  values: unknown[]
}

export interface ParamDef {
  key: string
  label: string
  type: 'select' | 'number' | 'text' | 'boolean'
  /** 参数面板中的分组名称，例如「比例」「清晰度」「生成数量」 */
  group?: string
  options?: ParamOption[]
  defaultValue?: string | number | boolean
  min?: number
  max?: number
  /** 允许在 Prompt Bar 中不选预设、直接输入自定义值 */
  allowCustom?: boolean
  /** 给用户看的一句说明 */
  description?: string
  /** v2：只在这些模式出现 */
  appliesTo?: ModelModeId[]
  /** v2：满足条件才显示 */
  when?: ParamCondition
  /** v2：满足条件时锁定值，可以写多条 */
  force?: ParamForce | ParamForce[]
  /** v2：这些字段存在时不发送当前字段 */
  forbid?: string[]
  /** v2：满足条件时禁用这些值，可以写多条 */
  deny?: ParamDeny | ParamDeny[]
}

export type ModelFeature =
  | 'sequential'
  | 'layer'
  | 'ocr'
  | 'rgba'
  | 'audio'
  | 'last-frame'
  | 'multi-shot'
  | 'mask'

export interface ConfigSource {
  kind: 'preset' | 'template' | 'manual' | 'agent'
  url?: string
  retrievedAt?: string
  confidence?: 'high' | 'medium' | 'low'
  notes?: string
}

export interface ModelDef {
  id: string
  name: string
  capability: Capability
  remoteModel: string
  params: ParamDef[]
  /** 实际可接收的输入媒体；缺省按能力、适配器和模板推断 */
  inputs?: MediaInput[]
  /** 该模型支持的视频专用操作；缺省按 http-template 模板推断 */
  operations?: VideoOperationId[]
  /** v2 能力模式；缺省从 capability / inputs / operations 推断 */
  modes?: Array<ModelModeId | ModelModeConfig>
  /** 输出特性，例如组图、图层、OCR、原生音频 */
  features?: ModelFeature[]
  /** 同系列变体分组，仅用于 UI，不参与能力判断 */
  family?: string
  /** 协议模板 ID，仅用于展示和默认值 */
  protocol?: string
  /** 能力信息来源，Agent 生成时写入 */
  source?: ConfigSource
  /** 该模型只出现在指定类型的供应商下；缺省为 openai-compat */
  providerType?: ProviderType
  /** 生成执行器，缺省按 remoteModel 推断 */
  adapter?: string
  /** 本地适配器 ID；adapter 为 local:<id> 时由本地宿主执行 */
  localAdapter?: string
  /** http-template 执行器的请求/轮询模板 */
  template?: HttpTemplate
  /** 引用自哪个内置预设，用于恢复预设默认值 */
  preset?: string
  /**
   * 追加到适配器默认请求体的字段，支持 {{params.*}} / {{refs.*}} /
   * {{prompt}} / {{model}} 变量。适配器先构造默认 body，再合并这里的内容。
   */
  extraBody?: Record<string, unknown>
  /** 从默认请求体中删除的顶层字段，例如 Seedream 不支持 n */
  omitBody?: string[]
}

export interface ModelInferenceInput {
  capability: Capability
  remoteModel?: string
  adapter?: string
  template?: HttpTemplate
  inputs?: MediaInput[]
  operations?: VideoOperationId[]
  modes?: Array<ModelModeId | ModelModeConfig>
}

function templateHasMode(
  template: HttpTemplate | undefined,
  mode: 'text' | 'image' | 'keyframe' | 'reference' | 'video'
): boolean {
  if (!template) return false
  if (template.mode === mode) return true
  if (typeof template.submit.path === 'object' && mode in template.submit.path) {
    return true
  }
  return Boolean(template.submit.bodyByMode && mode in template.submit.bodyByMode)
}

/**
 * 根据能力、模型名和模板推断输入能力。
 * 这里的默认值只用于旧配置和预设；用户可以在设置中覆盖。
 */
export function inferModelInputs(model: ModelInferenceInput): MediaInput[] {
  const remote = model.remoteModel ?? ''
  const explicitModes = normalizeModelModes(model.modes)
  if (explicitModes.length > 0) {
    const kinds = new Set<MediaInput>()
    for (const mode of explicitModes) {
      for (const kind of modeMediaKinds(mode)) kinds.add(kind as MediaInput)
    }
    // 可选参考媒体不参与通用推导，已知模型需要补回
    if (/^agnes-video-2\.5-flash/i.test(remote)) {
      kinds.add('audio')
    } else if (/^agnes-video-2\.5/i.test(remote)) {
      kinds.add('audio')
      kinds.add('video')
    }
    return [...kinds]
  }

  if (model.capability === 'image.i2i') return ['text', 'image']
  if (model.capability === 'image.t2i') {
    // Agnes 图像接口在请求体里支持参考图，但预设能力仍是 t2i
    if (/^agnes-image/i.test(remote)) return ['text', 'image']
    return ['text']
  }

  if (model.capability === 'video.t2v') {
    if (/^agnes-video-2\.5-flash/i.test(remote)) {
      return ['text', 'image', 'audio']
    }
    if (/^agnes-video-2\.5/i.test(remote)) {
      return ['text', 'image', 'video', 'audio']
    }

    if (model.adapter === 'http-template' && model.template) {
      const inputs: MediaInput[] = ['text']
      if (
        templateHasMode(model.template, 'image') ||
        templateHasMode(model.template, 'keyframe') ||
        templateHasMode(model.template, 'reference')
      ) {
        inputs.push('image')
      }
      if (templateHasMode(model.template, 'video')) inputs.push('video')
      return inputs
    }

    return ['text', 'image']
  }

  return ['text']
}

/**
 * 推断旧配置的模式。
 *
 * 旧字段只有媒体类型，无法精确区分首帧、参考、编辑。这里只推断
 * 「最小可用模式」：宁可少列，也不要错误地声称支持某个模式。
 */
export function inferModelModes(model: ModelInferenceInput): ModelModeConfig[] {
  const explicit = normalizeModelModes(model.modes)
  if (explicit.length > 0) return explicit

  const inputs = model.inputs ?? inferModelInputs(model)
  const operations = model.operations ?? inferModelOperations(model)
  const modes: ModelModeConfig[] = []

  if (model.capability === 'image.i2i') {
    return [{ id: 'i2i' }]
  }

  if (model.capability === 'image.t2i') {
    modes.push({ id: 't2i' })
    if (inputs.includes('image')) modes.push({ id: 'i2i' })
    return modes
  }

  if (model.capability === 'video.t2v') {
    if (inputs.includes('text')) modes.push({ id: 't2v' })
    if (inputs.includes('image')) modes.push({ id: 'first-frame' })
    if (operations.includes('extend')) modes.push({ id: 'video-extend' })
    if (
      operations.includes('shot-retake') ||
      operations.includes('element-replace')
    ) {
      modes.push({ id: 'video-edit' })
    }
    if (inputs.includes('video') && operations.length === 0) {
      modes.push({ id: 'reference' })
    }
    return modes
  }

  return modes
}

export function modelModeConfigs(model: ModelDef): ModelModeConfig[] {
  return inferModelModes(model)
}

export function modelModeIds(model: ModelDef): ModelModeId[] {
  return modelModeConfigs(model).map((mode) => mode.id)
}

export function modelSupportsMode(
  model: ModelDef,
  mode: ModelModeId
): boolean {
  return modelModeIds(model).includes(mode)
}

/** 从模式推导媒体类型；只在没有显式 inputs 时使用 */
export function modelModeMediaKinds(model: ModelDef): MediaInput[] {
  const kinds = new Set<MediaInput>()
  for (const mode of modelModeConfigs(model)) {
    for (const kind of modeMediaKinds(mode)) kinds.add(kind as MediaInput)
  }
  return [...kinds]
}

/** 汇总每个操作在模型所有模式里的最高支持级别 */
export function modelOperationSupport(
  model: ModelDef
): Record<VideoOperationId, OperationSupport> {
  const result: Record<VideoOperationId, OperationSupport> = {
    'shot-retake': 'none',
    'element-replace': 'none',
    extend: 'none'
  }

  for (const mode of modelModeConfigs(model)) {
    for (const operation of modeOperationIds(mode)) {
      result[operation] = highestOperationSupport([
        result[operation],
        modeSupportsOperation(mode, operation)
      ])
    }
  }

  return result
}

export interface ModeContext {
  kind: 'image' | 'video' | null
  imageCount: number
  videoCount: number
  hasFirstFrame: boolean
  hasLastFrame: boolean
}

/**
 * 判断模型是否支持当前节点的输入组合。
 *
 * 只做保守判断：只要模型支持任意一种能接住当前素材的模式，就放行。
 * 这样可以避免误伤「一张图既可能是首帧，也可能是参考图」的情况。
 */
export function modelModeCompatibility(
  model: ModelDef,
  context: ModeContext
): { ok: boolean; reason?: string } {
  if (!context.kind) return { ok: true }

  const modes = modelModeIds(model)

  if (context.kind === 'image') {
    if (context.imageCount === 0) {
      return modes.includes('t2i')
        ? { ok: true }
        : { ok: false, reason: '该模型不支持纯文生图' }
    }
    return modes.includes('i2i')
      ? { ok: true }
      : { ok: false, reason: '该模型不支持图片输入' }
  }

  if (context.videoCount > 0) {
    return ['video-edit', 'video-extend', 'reference'].some((mode) =>
      modes.includes(mode as ModelModeId)
    )
      ? { ok: true }
      : { ok: false, reason: '该模型不支持视频输入' }
  }

  if (context.imageCount >= 2 && context.hasFirstFrame && context.hasLastFrame) {
    return modes.includes('first-last') || modes.includes('reference')
      ? { ok: true }
      : { ok: false, reason: '该模型不支持首尾帧' }
  }

  if (context.imageCount > 0) {
    return ['first-frame', 'first-last', 'reference'].some((mode) =>
      modes.includes(mode as ModelModeId)
    )
      ? { ok: true }
      : { ok: false, reason: '该模型不支持图片输入' }
  }

  return modes.includes('t2v') || modes.includes('reference')
    ? { ok: true }
    : { ok: false, reason: '该模型不支持文生视频' }
}

/** 根据当前素材推断默认模式：无素材走文生，有素材走全能参考 */
export function inferActiveMode(
  model: ModelDef,
  context: ModeContext
): ModelModeId | undefined {
  if (!context.kind) return undefined

  const modes = modelModeIds(model)

  if (context.kind === 'image') {
    if (context.imageCount === 0) {
      return modes.includes('t2i') ? 't2i' : undefined
    }
    if (modes.includes('i2i')) return 'i2i'
    return undefined
  }

  if (context.videoCount > 0) {
    if (modes.includes('video-edit')) return 'video-edit'
    if (modes.includes('video-extend')) return 'video-extend'
    return modes.includes('reference') ? 'reference' : undefined
  }

  if (context.imageCount > 0) {
    return modes.includes('reference') ? 'reference' : undefined
  }

  return modes.includes('t2v') ? 't2v' : undefined
}

/** 显式 inputs 优先；否则按模式、适配器和模型名推断 */
export function modelInputs(model: ModelDef): MediaInput[] {
  if (model.inputs && model.inputs.length > 0) return model.inputs
  return inferModelInputs(model)
}

/** 返回模型缺少的必需输入 */
export function missingInputsFor(
  model: ModelDef,
  required: MediaInput[]
): MediaInput[] {
  const available = new Set(modelInputs(model))
  return required.filter((input) => !available.has(input))
}

/**
 * 是否支持视频参考音频。
 *
 * `features` 的语义是输出特性（例如原生音频），不能拿来判断输入能力；
 * 这里优先看显式 `inputs`，未声明时只对已知适配器兜底。
 */
export function supportsReferenceAudio(model: ModelDef): boolean {
  if (model.inputs && model.inputs.length > 0) {
    return model.inputs.includes('audio')
  }
  return (
    model.adapter === 'agnes-video' || /^agnes-video/i.test(model.remoteModel)
  )
}

function templateContains(
  template: HttpTemplate | undefined,
  token: string
): boolean {
  if (!template) return false
  return JSON.stringify(template).includes(token)
}

/** 用户显式声明优先；否则按 http-template 中使用的变量推断 */
export function inferModelOperations(
  model: ModelInferenceInput
): VideoOperationId[] {
  const explicitModes = normalizeModelModes(model.modes)
  if (explicitModes.length > 0) {
    const result: VideoOperationId[] = []
    for (const mode of explicitModes) {
      for (const operation of modeOperationIds(mode)) {
        if (
          modeSupportsOperation(mode, operation) !== 'none' &&
          !result.includes(operation)
        ) {
          result.push(operation)
        }
      }
    }
    return result
  }

  if (model.operations !== undefined) return model.operations
  if (model.capability !== 'video.t2v') return []
  if (model.adapter !== 'http-template' || !model.template) return []

  const result: VideoOperationId[] = []
  const hasRange =
    templateContains(model.template, 'video.start') ||
    templateContains(model.template, 'video.end')
  const hasExtend =
    templateContains(model.template, 'video.duration') ||
    templateContains(model.template, 'video.direction')

  if (hasRange) result.push('shot-retake')
  if (
    hasRange &&
    (templateContains(model.template, 'refs.images') ||
      templateContains(model.template, 'refs.image'))
  ) {
    result.push('element-replace')
  }
  if (hasExtend) result.push('extend')
  return result
}

export function modelOperations(model: ModelDef): VideoOperationId[] {
  if (model.modes && model.modes.length > 0) {
    return (
      Object.entries(modelOperationSupport(model)) as Array<
        [VideoOperationId, OperationSupport]
      >
    )
      .filter(([, support]) => support !== 'none')
      .map(([operation]) => operation)
  }

  return model.operations !== undefined
    ? model.operations
    : inferModelOperations(model)
}

export function modelSupportsOperation(
  model: ModelDef,
  operation: VideoOperationId
): boolean {
  return modelOperations(model).includes(operation)
}

export interface ProviderConfig {
  id: string
  name: string
  type: ProviderType
  baseUrl: string
  headers?: Record<string, string>
  models: ModelDef[]
  hasKey: boolean
  hasSecret: boolean
  createdAt: string
  updatedAt: string
}

export interface ProviderInput {
  id?: string
  type?: ProviderType
  name: string
  baseUrl: string
  /** 附加到该供应商所有请求的自定义请求头；值支持 ${ENV_NAME} */
  headers?: Record<string, string>
  apiKey?: string
  secretKey?: string
  models: ModelDef[]
}

export interface ConnectionTestInput {
  id?: string
  type?: ProviderType
  baseUrl: string
  headers?: Record<string, string>
  apiKey?: string
  secretKey?: string
}

export interface ConnectionTestResult {
  ok: boolean
  message: string
}

export interface FetchModelsResult {
  ok: boolean
  message: string
  models: string[]
}

export const CAPABILITY_LABEL: Record<Capability, string> = {
  'image.t2i': '文生图',
  'image.i2i': '图生图',
  'text.chat': '文本对话',
  'video.t2v': '文生视频',
  'audio.tts': '语音合成',
  'audio.music': '音乐生成'
}

const RAW_MODEL_PRESETS: ModelDef[] = [
  {
    id: 'gpt-image-1',
    name: 'GPT Image 2.5',
    capability: 'image.t2i',
    remoteModel: 'gpt-image-2.5',
    inputs: ['text', 'image'],
    params: [
      {
        key: 'size',
        label: '尺寸',
        type: 'select',
        options: [
          { value: '1024x1024', label: '1:1' },
          { value: '1536x1024', label: '3:2' },
          { value: '1024x1536', label: '2:3' }
        ],
        defaultValue: '1024x1024'
      },
      {
        key: 'quality',
        label: '画质',
        type: 'select',
        options: [
          { value: 'auto', label: '自动' },
          { value: 'low', label: '低' },
          { value: 'medium', label: '中' },
          { value: 'high', label: '高' }
        ],
        defaultValue: 'auto'
      },
      { key: 'n', label: '数量', type: 'number', defaultValue: 1, min: 1, max: 4 }
    ]
  },
  {
    id: 'dall-e-3',
    name: 'DALL·E 3',
    capability: 'image.t2i',
    remoteModel: 'dall-e-3',
    inputs: ['text'],
    params: [
      {
        key: 'size',
        label: '尺寸',
        type: 'select',
        options: [
          { value: '1024x1024', label: '1:1' },
          { value: '1792x1024', label: '16:9' },
          { value: '1024x1792', label: '9:16' }
        ],
        defaultValue: '1024x1024'
      },
      {
        key: 'quality',
        label: '画质',
        type: 'select',
        options: [
          { value: 'standard', label: '标准' },
          { value: 'hd', label: '高清' }
        ],
        defaultValue: 'standard'
      }
    ]
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o mini',
    capability: 'text.chat',
    remoteModel: 'gpt-4o-mini',
    inputs: ['text'],
    params: [
      { key: 'temperature', label: '温度', type: 'number', defaultValue: 0.7, min: 0, max: 2 },
      { key: 'max_tokens', label: '最大输出 token', type: 'number', defaultValue: 2048, min: 64, max: 32768 }
    ]
  },
  {
    id: 'doubao-seedance',
    name: 'Seedance 2.5 视频',
    capability: 'video.t2v',
    remoteModel: 'doubao-seedance-2-5-260628',
    inputs: ['text', 'image'],
    params: [
      {
        key: 'resolution',
        label: '分辨率',
        type: 'select',
        options: [
          { value: '480p', label: '480P' },
          { value: '720p', label: '720P' },
          { value: '1080p', label: '1080P' }
        ],
        defaultValue: '720p'
      },
      {
        key: 'ratio',
        label: '比例',
        type: 'select',
        options: [
          { value: '16:9', label: '16:9' },
          { value: '9:16', label: '9:16' },
          { value: '1:1', label: '1:1' }
        ],
        defaultValue: '16:9'
      },
      {
        key: 'duration',
        label: '时长',
        type: 'number',
        defaultValue: 5,
        min: 5,
        max: 10
      }
    ]
  },
  {
    id: 'doubao-seedream-5',
    name: 'Seedream 5.0',
    capability: 'image.t2i',
    remoteModel: 'doubao-seedream-5-0-260128',
    inputs: ['text', 'image'],
    // 5.0 pro / flash 不支持组图，不能发送 n
    omitBody: ['n'],
    extraBody: {
      background: '{{params.background}}',
      output_format: '{{params.output_format}}',
      watermark: '{{params.watermark}}',
      layer_decomposition: '{{params.layer_decomposition}}'
    },
    params: [
      {
        key: 'size',
        label: '尺寸',
        type: 'select',
        options: [
          { value: '1K', label: '1K' },
          { value: '1.5K', label: '1.5K' },
          { value: '2K', label: '2K' }
        ],
        defaultValue: '2K'
      },
      {
        key: 'background',
        label: '背景',
        type: 'select',
        options: [
          { value: 'opaque', label: '不透明' },
          { value: 'transparent', label: '透明' }
        ],
        defaultValue: 'opaque'
      },
      {
        key: 'output_format',
        label: '输出格式',
        type: 'select',
        options: [
          { value: 'jpeg', label: 'JPEG' },
          { value: 'png', label: 'PNG' }
        ],
        defaultValue: 'jpeg'
      },
      {
        key: 'watermark',
        label: '水印',
        type: 'boolean',
        defaultValue: false
      },
      {
        key: 'layer_decomposition',
        label: '图层拆分',
        type: 'boolean',
        group: '图层',
        appliesTo: ['layer'],
        defaultValue: false
      }
    ]
  },
  {
    id: 'doubao-seedream-5-5',
    name: 'Seedream 5.5',
    capability: 'image.t2i',
    remoteModel: 'doubao-seedream-5-5-261028',
    inputs: ['text', 'image'],
    // 5.5 不支持组图；图层拆分另行处理
    omitBody: ['n'],
    extraBody: {
      background: '{{params.background}}',
      output_format: '{{params.output_format}}',
      watermark: '{{params.watermark}}',
      layer_decomposition: '{{params.layer_decomposition}}',
      layer_decomposition_options: {
        max_images: '{{params.layer_max_images}}',
        text_recognition: '{{params.text_recognition}}'
      }
    },
    params: [
      {
        key: 'size',
        label: '尺寸',
        type: 'select',
        options: [
          { value: '1K', label: '1K' },
          { value: '1.5K', label: '1.5K' },
          { value: '2K', label: '2K' }
        ],
        defaultValue: '2K'
      },
      {
        key: 'background',
        label: '背景',
        type: 'select',
        options: [
          { value: 'auto', label: '自动' },
          { value: 'opaque', label: '不透明' },
          { value: 'transparent', label: '透明' }
        ],
        defaultValue: 'auto'
      },
      {
        key: 'output_format',
        label: '输出格式',
        type: 'select',
        options: [
          { value: 'png', label: 'PNG' },
          { value: 'jpeg', label: 'JPEG' }
        ],
        defaultValue: 'png'
      },
      {
        key: 'watermark',
        label: '水印',
        type: 'boolean',
        defaultValue: false
      },
      {
        key: 'layer_decomposition',
        label: '图层拆分',
        type: 'boolean',
        group: '图层',
        appliesTo: ['layer'],
        defaultValue: false
      },
      {
        key: 'layer_max_images',
        label: '最多图层数',
        type: 'number',
        group: '图层',
        appliesTo: ['layer'],
        defaultValue: 30,
        min: 2,
        max: 100
      },
      {
        key: 'text_recognition',
        label: '识别文字',
        type: 'boolean',
        group: '图层',
        appliesTo: ['layer'],
        defaultValue: true
      }
    ]
  },
  {
    id: 'tts-1',
    name: 'OpenAI TTS',
    capability: 'audio.tts',
    remoteModel: 'tts-1',
    inputs: ['text'],
    params: [
      {
        key: 'voice',
        label: '音色',
        type: 'select',
        options: [
          { value: 'alloy', label: 'Alloy' },
          { value: 'echo', label: 'Echo' },
          { value: 'fable', label: 'Fable' },
          { value: 'onyx', label: 'Onyx' },
          { value: 'nova', label: 'Nova' },
          { value: 'shimmer', label: 'Shimmer' }
        ],
        defaultValue: 'alloy'
      },
      {
        key: 'speed',
        label: '语速',
        type: 'select',
        options: [
          { value: '0.75', label: '0.75x' },
          { value: '1', label: '1.0x' },
          { value: '1.25', label: '1.25x' },
          { value: '1.5', label: '1.5x' }
        ],
        defaultValue: '1'
      },
      {
        key: 'format',
        label: '格式',
        type: 'select',
        options: [
          { value: 'mp3', label: 'MP3' },
          { value: 'opus', label: 'Opus' },
          { value: 'aac', label: 'AAC' },
          { value: 'wav', label: 'WAV' }
        ],
        defaultValue: 'mp3'
      }
    ]
  },
  {
    id: 'suno-music',
    name: 'Suno Music',
    capability: 'audio.music',
    remoteModel: 'suno-music',
    inputs: ['text'],
    params: [
      {
        key: 'mode',
        label: '版本',
        type: 'select',
        options: [
          { value: 'v5_5', label: 'v5.5' },
          { value: 'v4_5', label: 'v4.5' },
          { value: 'v4', label: 'v4' }
        ],
        defaultValue: 'v5_5'
      },
      {
        key: 'instrumental',
        label: '类型',
        type: 'select',
        options: [
          { value: 'false', label: '歌曲' },
          { value: 'true', label: '纯音乐' }
        ],
        defaultValue: 'false'
      }
    ]
  },
  {
    id: 'vidu-q2',
    name: 'Vidu Q2',
    capability: 'video.t2v',
    remoteModel: 'viduq2',
    adapter: 'http-template',
    inputs: ['text', 'image'],
    params: [
      {
        key: 'duration',
        label: '时长',
        type: 'number',
        defaultValue: 5,
        min: 4,
        max: 10
      },
      {
        key: 'resolution',
        label: '分辨率',
        type: 'select',
        options: [
          { value: '360p', label: '360P' },
          { value: '720p', label: '720P' },
          { value: '1080p', label: '1080P' }
        ],
        defaultValue: '720p'
      },
      {
        key: 'ratio',
        label: '比例',
        type: 'select',
        options: [
          { value: '16:9', label: '16:9' },
          { value: '9:16', label: '9:16' },
          { value: '1:1', label: '1:1' },
          { value: '4:3', label: '4:3' },
          { value: '3:4', label: '3:4' }
        ],
        defaultValue: '16:9'
      }
    ],
    template: {
      auth: { header: 'Authorization', prefix: 'Token ' },
      submit: {
        path: {
          text: '/ent/v2/text2video',
          image: '/ent/v2/img2video',
          keyframe: '/ent/v2/img2video',
          reference: '/ent/v2/character2video'
        },
        bodyByMode: {
          text: {
            model: '{{model}}',
            prompt: '{{prompt}}',
            duration: '{{params.duration}}',
            resolution: '{{params.resolution}}',
            aspect_ratio: '{{params.ratio}}',
            watermark: false
          },
          image: {
            model: '{{model}}',
            prompt: '{{prompt}}',
            images: ['{{refs.firstFrame}}'],
            duration: '{{params.duration}}',
            resolution: '{{params.resolution}}',
            aspect_ratio: '{{params.ratio}}',
            watermark: false
          },
          keyframe: {
            model: '{{model}}',
            prompt: '{{prompt}}',
            images: ['{{refs.firstFrame}}', '{{refs.lastFrame}}'],
            duration: '{{params.duration}}',
            resolution: '{{params.resolution}}',
            aspect_ratio: '{{params.ratio}}',
            watermark: false
          },
          reference: {
            model: '{{model}}',
            prompt: '{{prompt}}',
            images: '{{refs.images}}',
            duration: '{{params.duration}}',
            resolution: '{{params.resolution}}',
            aspect_ratio: '{{params.ratio}}',
            watermark: false
          }
        },
        omitEmpty: true
      },
      poll: {
        path: '/ent/v2/tasks/{{taskId}}/creations',
        taskIdPath: 'task_id',
        statusPath: 'state',
        successValues: ['success'],
        failValues: ['failed'],
        resultPath: 'creations[0].url'
      }
    }
  },
  {
    id: 'minimax-h3',
    name: 'MiniMax H3',
    capability: 'video.t2v',
    remoteModel: 'MiniMax-H3',
    adapter: 'minimax-video',
    inputs: ['text', 'image'],
    params: [
      {
        key: 'duration',
        label: '时长',
        type: 'number',
        defaultValue: 6,
        min: 4,
        max: 10
      },
      {
        key: 'resolution',
        label: '分辨率',
        type: 'select',
        options: [
          { value: '768P', label: '768P' },
          { value: '2K', label: '2K' }
        ],
        defaultValue: '768P'
      },
      {
        key: 'ratio',
        label: '比例',
        type: 'select',
        options: [
          { value: '16:9', label: '16:9' },
          { value: '9:16', label: '9:16' },
          { value: '1:1', label: '1:1' }
        ],
        defaultValue: '16:9'
      }
    ]
  },
  {
    id: 'minimax-hailuo-23',
    name: 'MiniMax Hailuo 2.3',
    capability: 'video.t2v',
    remoteModel: 'MiniMax-Hailuo-2.3',
    adapter: 'minimax-legacy',
    inputs: ['text', 'image'],
    params: [
      {
        key: 'duration',
        label: '时长',
        type: 'number',
        defaultValue: 6,
        min: 6,
        max: 10
      },
      {
        key: 'resolution',
        label: '分辨率',
        type: 'select',
        options: [
          { value: '768P', label: '768P' },
          { value: '1080P', label: '1080P' }
        ],
        defaultValue: '768P'
      }
    ]
  },
  {
    id: 'kling-v2-5-turbo',
    name: '可灵 2.5 Turbo',
    capability: 'video.t2v',
    remoteModel: 'kling-v2-5-turbo',
    adapter: 'kling-video',
    providerType: 'kling',
    inputs: ['text', 'image'],
    params: [
      {
        key: 'mode',
        label: '模式',
        type: 'select',
        options: [
          { value: 'std', label: '标准' },
          { value: 'pro', label: '高品质' }
        ],
        defaultValue: 'std'
      },
      {
        key: 'duration',
        label: '时长',
        type: 'number',
        defaultValue: 5,
        min: 5,
        max: 10
      },
      {
        key: 'ratio',
        label: '比例',
        type: 'select',
        options: [
          { value: '16:9', label: '16:9' },
          { value: '9:16', label: '9:16' },
          { value: '1:1', label: '1:1' }
        ],
        defaultValue: '16:9'
      },
      {
        key: 'cfg_scale',
        label: '相关性',
        type: 'number',
        defaultValue: 0.5,
        min: 0,
        max: 1
      },
      {
        key: 'negative_prompt',
        label: '负向提示词',
        type: 'text',
        defaultValue: ''
      }
    ]
  },
  {
    id: 'kling-v1-6',
    name: '可灵 1.6',
    capability: 'video.t2v',
    remoteModel: 'kling-v1-6',
    adapter: 'kling-video',
    providerType: 'kling',
    inputs: ['text', 'image'],
    params: [
      {
        key: 'mode',
        label: '模式',
        type: 'select',
        options: [
          { value: 'std', label: '标准' },
          { value: 'pro', label: '高品质' }
        ],
        defaultValue: 'std'
      },
      {
        key: 'duration',
        label: '时长',
        type: 'number',
        defaultValue: 5,
        min: 5,
        max: 10
      },
      {
        key: 'ratio',
        label: '比例',
        type: 'select',
        options: [
          { value: '16:9', label: '16:9' },
          { value: '9:16', label: '9:16' },
          { value: '1:1', label: '1:1' }
        ],
        defaultValue: '16:9'
      }
    ]
  },
  {
    id: 'agnes-image-2.5-flash',
    name: 'Agnes 2.5 Flash 图像',
    capability: 'image.t2i',
    remoteModel: 'agnes-image-2.5-flash',
    inputs: ['text', 'image'],
    params: [
      {
        key: 'size',
        label: '尺寸',
        type: 'select',
        options: [
          { value: '1K', label: '1K' },
          { value: '2K', label: '2K' },
          { value: '3K', label: '3K' },
          { value: '4K', label: '4K' }
        ],
        defaultValue: '1K'
      },
      {
        key: 'ratio',
        label: '比例',
        type: 'select',
        options: [
          { value: '1:1', label: '1:1' },
          { value: '16:9', label: '16:9' },
          { value: '9:16', label: '9:16' },
          { value: '4:3', label: '4:3' },
          { value: '3:4', label: '3:4' },
          { value: '2:3', label: '2:3' },
          { value: '3:2', label: '3:2' },
          { value: '21:9', label: '21:9' }
        ],
        defaultValue: '1:1'
      }
    ]
  },
  {
    id: 'agnes-video-2.5-flash',
    name: 'Agnes 2.5 Flash 视频',
    capability: 'video.t2v',
    remoteModel: 'agnes-video-2.5-flash',
    inputs: ['text', 'image', 'audio'],
    params: [
      {
        key: 'duration',
        label: '时长',
        type: 'number',
        defaultValue: 5,
        min: 4,
        max: 12
      },
      {
        key: 'ratio',
        label: '比例',
        type: 'select',
        options: [
          { value: '16:9', label: '16:9' },
          { value: '9:16', label: '9:16' },
          { value: '1:1', label: '1:1' },
          { value: '4:3', label: '4:3' },
          { value: '3:4', label: '3:4' },
          { value: '21:9', label: '21:9' }
        ],
        defaultValue: '16:9'
      }
    ]
  }
]

/**
 * 预设的 v2 能力元数据。只写差异，避免在每个预设对象里重复。
 * 未列出的预设继续按 capability / inputs 推断。
 */
const PRESET_MODE_OVERRIDES: Record<
  string,
  Partial<Pick<ModelDef, 'modes' | 'features' | 'family' | 'protocol'>>
> = {
  'gpt-image-1': {
    modes: ['t2i', 'i2i'],
    features: ['mask'],
    family: 'gpt-image',
    protocol: 'openai-image'
  },
  'dall-e-3': {
    modes: ['t2i'],
    family: 'dall-e',
    protocol: 'openai-image'
  },
  'doubao-seedance': {
    modes: [
      't2v',
      'first-frame',
      'first-last',
      'reference',
      'video-edit',
      'video-extend'
    ],
    features: ['audio', 'last-frame'],
    family: 'seedance',
    protocol: 'ark-video'
  },
  'doubao-seedream-5': {
    modes: ['t2i', 'i2i', 'layer'],
    features: ['layer', 'rgba'],
    family: 'seedream',
    protocol: 'ark-image'
  },
  'doubao-seedream-5-5': {
    modes: ['t2i', 'i2i', 'layer'],
    features: ['layer', 'ocr', 'rgba'],
    family: 'seedream',
    protocol: 'ark-image'
  },
  'vidu-q2': {
    modes: ['t2v', 'first-frame', 'first-last', 'reference'],
    family: 'vidu',
    protocol: 'vidu-video'
  },
  'minimax-h3': {
    modes: ['t2v', 'first-frame', 'first-last', 'reference'],
    features: ['audio'],
    family: 'minimax-h3',
    protocol: 'minimax-video'
  },
  'minimax-hailuo-23': {
    modes: ['t2v', 'first-frame', 'first-last'],
    family: 'hailuo',
    protocol: 'minimax-video'
  },
  'kling-v2-5-turbo': {
    modes: ['t2v', 'first-frame', 'first-last'],
    family: 'kling',
    protocol: 'kling-video'
  },
  'kling-v1-6': {
    modes: ['t2v', 'first-frame', 'first-last'],
    family: 'kling',
    protocol: 'kling-video'
  },
  'agnes-image-2.5-flash': {
    modes: ['t2i', 'i2i'],
    family: 'agnes-image',
    protocol: 'openai-image'
  },
  'agnes-video-2.5-flash': {
    modes: ['t2v', 'first-frame', 'first-last', 'reference'],
    features: ['audio'],
    family: 'agnes-video',
    protocol: 'agnes-video'
  },
  'agnes-video-2.5': {
    modes: ['t2v', 'first-frame', 'first-last', 'reference'],
    features: ['audio'],
    family: 'agnes-video',
    protocol: 'agnes-video'
  }
}

export const MODEL_PRESETS: ModelDef[] = RAW_MODEL_PRESETS.map((model) => ({
  ...model,
  ...(PRESET_MODE_OVERRIDES[model.id] ?? {})
}))
