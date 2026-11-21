import type { MediaInput, ModelDef } from './provider-schema'
import { inferModelInputs, modelModeIds } from './provider-schema'
import type { ModelModeId } from './model-modes'
import { MODEL_MODE_LABEL } from './model-modes'
import { findProtocolTemplate } from './protocol-templates'
import {
  contractForAdapter,
  contractGapsForAdapter,
  type ModelContract
} from './model-contracts'

/** 输入侧特性：影响能接收什么素材 */
export type ModelInputFeature = 'mask' | 'reference-audio' | 'last-frame'

/** 输出侧特性：影响生成结果本身 */
export type ModelOutputFeature =
  | 'sequential'
  | 'layer'
  | 'ocr'
  | 'rgba'
  | 'audio'
  | 'multi-shot'

export interface AdapterCapability {
  /** 适配器真正会发送的媒体类型 */
  media: MediaInput[]
  /** 适配器真正实现的模式 */
  modes: ModelModeId[]
  /** 适配器真正处理的输入特性 */
  inputFeatures: ModelInputFeature[]
  /** 适配器真正处理的输出特性 */
  outputFeatures: ModelOutputFeature[]
  /** 适配器会读取的参数键；省略表示由模板或 extraBody 决定，不做限制 */
  params?: string[]
}

export type CapabilityGapKind =
  | 'input'
  | 'mode'
  | 'input-feature'
  | 'output-feature'
  | 'param'
  | 'contract'

export interface CapabilityGap {
  kind: CapabilityGapKind
  value: string
  message: string
}

export interface EffectiveCapabilities {
  adapter: string
  media: MediaInput[]
  modes: ModelModeId[]
  inputFeatures: ModelInputFeature[]
  outputFeatures: ModelOutputFeature[]
  /** 适配器读取的参数白名单；undefined 表示不限制 */
  params?: string[]
  /** 协议族契约；用户自定义适配器为 null */
  contract: ModelContract | null
  gaps: CapabilityGap[]
}

const FALLBACK_ADAPTER: AdapterCapability = {
  media: ['text', 'image'],
  modes: ['t2i', 'i2i'],
  inputFeatures: [],
  outputFeatures: []
}

/**
 * 适配器能力表。
 *
 * 这里是「执行器真正能做到什么」的唯一来源，不从 modes 或 features 反推。
 * 模型显式声明的能力会与这张表取交集，差集写入 gaps。
 */
export const ADAPTER_CAPABILITIES: Record<string, AdapterCapability> = {
  'openai-compat': {
    media: ['text', 'image'],
    modes: ['t2i', 'i2i', 'layer'],
    inputFeatures: ['mask'],
    outputFeatures: ['layer', 'ocr', 'rgba', 'sequential']
  },
  'agnes-video': {
    media: ['text', 'image', 'audio', 'video'],
    modes: ['t2v', 'first-frame', 'first-last', 'reference'],
    inputFeatures: ['reference-audio'],
    outputFeatures: [],
    params: ['duration', 'seconds', 'ratio']
  },
  'sora-video': {
    media: ['text', 'image'],
    modes: ['t2v', 'first-frame'],
    inputFeatures: [],
    outputFeatures: ['audio'],
    params: ['duration']
  },
  'minimax-video': {
    media: ['text', 'image'],
    modes: ['t2v', 'first-frame', 'first-last', 'reference'],
    inputFeatures: [],
    outputFeatures: ['audio'],
    params: ['duration', 'resolution', 'ratio']
  },
  'minimax-legacy': {
    media: ['text', 'image'],
    modes: ['t2v', 'first-frame', 'first-last'],
    inputFeatures: [],
    outputFeatures: ['audio'],
    params: ['duration', 'resolution']
  },
  'kling-video': {
    media: ['text', 'image'],
    modes: ['t2v', 'first-frame', 'first-last'],
    inputFeatures: [],
    outputFeatures: ['audio'],
    params: ['mode', 'duration', 'ratio', 'cfg_scale', 'negative_prompt']
  },
  'volcengine-video': {
    media: ['text', 'image', 'video'],
    modes: [
      't2v',
      'first-frame',
      'first-last',
      'reference',
      'video-edit',
      'video-extend'
    ],
    inputFeatures: ['last-frame'],
    outputFeatures: ['audio'],
    params: [
      'resolution',
      'ratio',
      'duration',
      'watermark',
      'generate_audio'
    ]
  },
  'http-template': {
    media: ['text', 'image', 'video'],
    modes: [
      't2i',
      'i2i',
      'layer',
      't2v',
      'first-frame',
      'first-last',
      'reference',
      'video-edit',
      'video-extend'
    ],
    inputFeatures: ['last-frame'],
    outputFeatures: ['audio']
  }
}

export function resolveAdapter(model: ModelDef): string {
  if (model.adapter) return model.adapter
  const template = model.protocol
    ? findProtocolTemplate(model.protocol)
    : undefined
  if (template?.adapter) return template.adapter
  if (/^agnes-video/i.test(model.remoteModel)) return 'agnes-video'
  if (model.capability === 'video.t2v') return 'volcengine-video'
  return 'openai-compat'
}

/** 取模型对应协议族的契约；用户自定义适配器返回 null */
export function contractFor(model: ModelDef): ModelContract | null {
  return contractForAdapter(resolveAdapter(model))
}

/**
 * 把历史 `features` 拆成输入侧和输出侧。
 *
 * `audio` 在 Agnes 上表示参考音频输入，在其他视频模型上表示输出原生音频；
 * 这个差异由适配器决定。配置格式暂时保持不变，能力层完成拆分。
 */
export function normalizeFeatureSets(model: ModelDef): {
  input: ModelInputFeature[]
  output: ModelOutputFeature[]
} {
  const adapter = resolveAdapter(model)
  const input: ModelInputFeature[] = []
  const output: ModelOutputFeature[] = []

  for (const feature of model.features ?? []) {
    if (feature === 'mask' || feature === 'last-frame') {
      input.push(feature)
    } else if (feature === 'audio') {
      if (adapter === 'agnes-video') {
        input.push('reference-audio')
      } else {
        output.push('audio')
      }
    } else {
      output.push(feature)
    }
  }

  return { input, output }
}

function adapterCapabilityFor(model: ModelDef): AdapterCapability {
  const adapter = resolveAdapter(model)
  const base = ADAPTER_CAPABILITIES[adapter] ?? FALLBACK_ADAPTER

  // 同一个适配器下可能有模型级差异：Flash 不支持参考视频。
  if (
    adapter === 'agnes-video' &&
    /^agnes-video-2\.5-flash/i.test(model.remoteModel)
  ) {
    return {
      ...base,
      media: base.media.filter((item) => item !== 'video')
    }
  }

  return base
}

/**
 * 计算模型的有效能力。
 *
 * 声明的媒体与适配器能力取交集；差集作为缺口返回，供设置页、启动日志
 * 和审计脚本消费。没有显式 inputs 时使用推断结果，而不是 modes 推导。
 */
export function effectiveCapabilities(model: ModelDef): EffectiveCapabilities {
  const adapter = resolveAdapter(model)
  const base = adapterCapabilityFor(model)

  const declaredMedia =
    model.inputs && model.inputs.length > 0
      ? model.inputs
      : inferModelInputs(model)
  const declaredModes = modelModeIds(model)
  const declaredFeatures = normalizeFeatureSets(model)
  const contract = contractForAdapter(adapter)

  const gaps: CapabilityGap[] = [
    ...contractGapsForAdapter(adapter, model)
  ]

  const media = declaredMedia.filter((item) => {
    if (base.media.includes(item)) return true
    gaps.push({
      kind: 'input',
      value: item,
      message: `模型声明了 ${item} 输入，但 ${adapter} 适配器未实现`
    })
    return false
  })

  const modes = declaredModes.filter((item) => {
    if (base.modes.includes(item)) return true
    gaps.push({
      kind: 'mode',
      value: item,
      message: `模型声明了「${MODEL_MODE_LABEL[item] ?? item}」模式，但 ${adapter} 适配器未实现`
    })
    return false
  })

  const inputFeatures = declaredFeatures.input.filter((item) => {
    if (base.inputFeatures.includes(item)) return true
    gaps.push({
      kind: 'input-feature',
      value: item,
      message: `模型声明了 ${item} 输入特性，但 ${adapter} 适配器未实现`
    })
    return false
  })

  const outputFeatures = declaredFeatures.output.filter((item) => {
    if (base.outputFeatures.includes(item)) return true
    gaps.push({
      kind: 'output-feature',
      value: item,
      message: `模型声明了 ${item} 输出特性，但 ${adapter} 适配器未实现`
    })
    return false
  })

  if (base.params) {
    const allowed = base.params
    for (const param of model.params) {
      if (allowed.includes(param.key)) continue
      gaps.push({
        kind: 'param',
        value: param.key,
        message: `模型声明了参数 ${param.key}，但 ${adapter} 适配器未读取`
      })
    }
  }

  return {
    adapter,
    media,
    modes,
    inputFeatures,
    outputFeatures,
    ...(base.params ? { params: base.params } : {}),
    contract,
    gaps
  }
}
