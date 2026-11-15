import type { VideoOperationId } from './operation-schema'

/**
 * CineLab 的归一化生成模式。
 *
 * 各家 API 的字段名和任务类型差异很大，但输入契约可以归到这 9 种模式里。
 * 模式只描述「收什么、出什么」，不描述具体字段；字段映射由适配器或
 * http-template 负责。
 */
export type ModelModeId =
  | 't2i'
  | 'i2i'
  | 't2v'
  | 'first-frame'
  | 'first-last'
  | 'reference'
  | 'video-edit'
  | 'video-extend'
  | 'layer'

export type MediaKind = 'text' | 'image' | 'video' | 'audio'

export type SlotRole =
  | 'prompt'
  | 'reference'
  | 'firstFrame'
  | 'lastFrame'
  | 'mask'
  | 'source'
  | 'subject'

export interface InputSlot {
  id: string
  media: MediaKind
  role: SlotRole
  label: string
  min: number
  max: number
  required: boolean
  /** 同组槽位互斥，例如首帧模式与参考模式 */
  exclusiveGroup?: string
}

export type OperationSupport = 'native' | 'prompted' | 'none'

/**
 * 模型对某个模式的配置。字符串简写（`"t2i"`）会在归一化时转成
 * `{ id: 't2i' }`，需要覆盖槽位上限时再写对象形式。
 */
export interface ModelModeConfig {
  id: ModelModeId
  /** 覆盖默认槽位上限，key 是槽位 id */
  slots?: Record<string, Partial<Pick<InputSlot, 'min' | 'max' | 'required'>>>
  /** 覆盖操作支持级别；缺省按模式定义 */
  operations?: Partial<Record<VideoOperationId, OperationSupport>>
}

export interface ModelModeDefinition {
  id: ModelModeId
  label: string
  description: string
  output: 'image' | 'video'
  slots: InputSlot[]
  /** 该模式默认支持的操作 */
  operations?: VideoOperationId[]
}

function slot(
  id: string,
  media: MediaKind,
  role: SlotRole,
  label: string,
  min: number,
  max: number,
  required: boolean
): InputSlot {
  return { id, media, role, label, min, max, required }
}

const PROMPT = slot('prompt', 'text', 'prompt', '提示词', 1, 1, true)

export const MODEL_MODE_DEFINITIONS: ModelModeDefinition[] = [
  {
    id: 't2i',
    label: '文生图',
    description: '只给提示词，生成图片。',
    output: 'image',
    slots: [PROMPT]
  },
  {
    id: 'i2i',
    label: '图生图',
    description: '给参考图和提示词，生成新图或编辑现有图片。',
    output: 'image',
    slots: [
      PROMPT,
      slot('reference', 'image', 'reference', '参考图', 1, 1, true),
      slot('mask', 'image', 'mask', '蒙版', 0, 1, false)
    ]
  },
  {
    id: 't2v',
    label: '文生视频',
    description: '只给提示词，生成视频。',
    output: 'video',
    slots: [PROMPT]
  },
  {
    id: 'first-frame',
    label: '首帧生视频',
    description: '给一张首帧图和提示词，生成后续画面。',
    output: 'video',
    slots: [
      PROMPT,
      slot('firstFrame', 'image', 'firstFrame', '首帧', 1, 1, true)
    ]
  },
  {
    id: 'first-last',
    label: '首尾帧生视频',
    description: '给首帧和尾帧，生成中间的过渡画面。',
    output: 'video',
    slots: [
      PROMPT,
      slot('firstFrame', 'image', 'firstFrame', '首帧', 1, 1, true),
      slot('lastFrame', 'image', 'lastFrame', '尾帧', 1, 1, true)
    ]
  },
  {
    id: 'reference',
    label: '参考生视频',
    description: '用参考图、参考视频或参考音频引导生成新视频。',
    output: 'video',
    slots: [
      PROMPT,
      slot('reference-image', 'image', 'reference', '参考图', 0, 4, false),
      slot('reference-video', 'video', 'reference', '参考视频', 0, 1, false),
      slot('reference-audio', 'audio', 'reference', '参考音频', 0, 1, false)
    ]
  },
  {
    id: 'video-edit',
    label: '视频编辑',
    description: '以源视频为基础，重拍片段或替换元素。',
    output: 'video',
    slots: [
      PROMPT,
      slot('source', 'video', 'source', '源视频', 1, 1, true),
      slot('reference-image', 'image', 'reference', '替换素材', 0, 1, false)
    ],
    operations: ['shot-retake', 'element-replace']
  },
  {
    id: 'video-extend',
    label: '视频延长',
    description: '以源视频为基础，向前或向后延长一段。',
    output: 'video',
    slots: [PROMPT, slot('source', 'video', 'source', '源视频', 1, 1, true)],
    operations: ['extend']
  },
  {
    id: 'layer',
    label: '图层拆分',
    description: '把单张图片拆成一张底图和多个独立图层。',
    output: 'image',
    slots: [slot('source', 'image', 'source', '源图', 1, 1, true)]
  }
]

export const MODEL_MODE_LABEL: Record<ModelModeId, string> =
  Object.fromEntries(
    MODEL_MODE_DEFINITIONS.map((mode) => [mode.id, mode.label])
  ) as Record<ModelModeId, string>

export const OPERATION_SUPPORT_LABEL: Record<OperationSupport, string> = {
  native: '原生',
  prompted: '提示词模拟',
  none: '不支持'
}

export function isModelModeId(value: unknown): value is ModelModeId {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(MODEL_MODE_LABEL, value)
  )
}

export function getModelModeDefinition(
  id: ModelModeId
): ModelModeDefinition | undefined {
  return MODEL_MODE_DEFINITIONS.find((mode) => mode.id === id)
}

export function normalizeModeConfig(value: unknown): ModelModeConfig | null {
  if (typeof value === 'string') {
    return isModelModeId(value) ? { id: value } : null
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }

  const record = value as Record<string, unknown>
  if (!isModelModeId(record.id)) return null

  const mode: ModelModeConfig = { id: record.id }
  if (
    typeof record.slots === 'object' &&
    record.slots !== null &&
    !Array.isArray(record.slots)
  ) {
    mode.slots = record.slots as ModelModeConfig['slots']
  }
  if (
    typeof record.operations === 'object' &&
    record.operations !== null &&
    !Array.isArray(record.operations)
  ) {
    mode.operations = record.operations as ModelModeConfig['operations']
  }
  return mode
}

export function normalizeModelModes(value: unknown): ModelModeConfig[] {
  if (!Array.isArray(value)) return []

  const result: ModelModeConfig[] = []
  const seen = new Set<ModelModeId>()

  for (const item of value) {
    const mode = normalizeModeConfig(item)
    if (!mode || seen.has(mode.id)) continue
    seen.add(mode.id)
    result.push(mode)
  }

  return result
}

/** 把模型对槽位的覆盖合并到模式默认定义上 */
export function resolveModeSlots(mode: ModelModeConfig): InputSlot[] {
  const definition = getModelModeDefinition(mode.id)
  if (!definition) return []

  return definition.slots.map((defaultSlot) => {
    const override = mode.slots?.[defaultSlot.id]
    return override ? { ...defaultSlot, ...override } : { ...defaultSlot }
  })
}

export function modeMediaKinds(mode: ModelModeConfig): MediaKind[] {
  const kinds = new Set<MediaKind>()
  for (const item of resolveModeSlots(mode)) kinds.add(item.media)
  return [...kinds]
}

export function modeSupportsOperation(
  mode: ModelModeConfig,
  operation: VideoOperationId
): OperationSupport {
  const explicit = mode.operations?.[operation]
  if (explicit) return explicit

  const definition = getModelModeDefinition(mode.id)
  return definition?.operations?.includes(operation) ? 'native' : 'none'
}

export function modeOperationIds(mode: ModelModeConfig): VideoOperationId[] {
  const definition = getModelModeDefinition(mode.id)
  const ids = new Set<VideoOperationId>(definition?.operations ?? [])

  for (const [operation, support] of Object.entries(mode.operations ?? {})) {
    if (support === 'none') {
      ids.delete(operation as VideoOperationId)
    } else if (support) {
      ids.add(operation as VideoOperationId)
    }
  }

  return [...ids]
}

export function highestOperationSupport(
  values: OperationSupport[]
): OperationSupport {
  if (values.includes('native')) return 'native'
  if (values.includes('prompted')) return 'prompted'
  return 'none'
}
