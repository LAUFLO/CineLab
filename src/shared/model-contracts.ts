import type { ModelDef } from './provider-schema'
import { modelModeIds } from './provider-schema'
import type { ModelModeId } from './model-modes'

/** 媒体进入请求的方式；binary 表示 multipart 文件字段 */
export type ContractTransport = 'data-url' | 'base64' | 'url' | 'binary'

export interface ModelContractFields {
  firstFrame?: string
  lastFrame?: string
  referenceImage?: string
}

export interface ModelContractTransports {
  keyframe?: ContractTransport
  referenceImage?: ContractTransport
}

export interface ModelContractRoles {
  firstFrame?: string
  lastFrame?: string
  reference?: string
}

export interface ModelContractLimits {
  maxImageBytes?: number
  maxRequestBytes?: number
  minWidth?: number
  maxWidth?: number
  minHeight?: number
  maxHeight?: number
  minAspect?: number
  maxAspect?: number
}

export interface ModelContractSource {
  url: string
  retrievedAt: string
  confidence: 'high' | 'medium' | 'low'
  notes?: string
}

/**
 * 协议族契约：描述媒体字段、传输格式、角色名、限制和来源。
 *
 * 能力表（ADAPTER_CAPABILITIES）负责执行器支持的模式和媒体；
 * 契约负责同一模式下的字段与载荷细节。两者由审计测试锁死一致。
 */
export interface ModelContract {
  adapter: string
  provider: string
  apiVersion: string
  fields: ModelContractFields
  transports: ModelContractTransports
  roles: ModelContractRoles
  limits?: ModelContractLimits
  modes: ModelModeId[]
  source: ModelContractSource
}

export interface ContractGap {
  kind: 'contract'
  value: string
  message: string
}

const MB = 1024 * 1024

export const AGNES_VIDEO_CONTRACT: ModelContract = {
  adapter: 'agnes-video',
  provider: 'official',
  apiVersion: 'v1',
  fields: {
    firstFrame: 'first_frame',
    lastFrame: 'last_frame',
    referenceImage: 'images'
  },
  transports: {
    keyframe: 'base64',
    referenceImage: 'data-url'
  },
  roles: {
    firstFrame: 'first_frame',
    lastFrame: 'last_frame'
  },
  limits: {
    maxImageBytes: 15 * MB,
    maxRequestBytes: 50 * MB,
    minWidth: 256,
    maxWidth: 5760
  },
  modes: ['t2v', 'first-frame', 'first-last', 'reference'],
  source: {
    url: 'https://wiki.agnes-ai.cn/zh-Hans/docs/agnes-video-25-flash.md',
    retrievedAt: '2026-11-17',
    confidence: 'high',
    notes: 'keyframe 使用纯 base64；官方只保证公网 URL，纯 base64 为实测可用。'
  }
}

export const KLING_VIDEO_CONTRACT: ModelContract = {
  adapter: 'kling-video',
  provider: 'official',
  apiVersion: 'v1',
  fields: {
    firstFrame: 'image',
    lastFrame: 'image_tail'
  },
  transports: {
    keyframe: 'base64'
  },
  roles: {
    firstFrame: 'image',
    lastFrame: 'image_tail'
  },
  limits: {
    maxImageBytes: 30 * MB,
    maxRequestBytes: 64 * MB
  },
  modes: ['t2v', 'first-frame', 'first-last'],
  source: {
    url: 'https://app.klingai.com/cn/dev/document-api',
    retrievedAt: '2026-11-21',
    confidence: 'medium',
    notes: '项目现有实现为纯 base64；尺寸与体积限制为通用推断。'
  }
}

export const MINIMAX_VIDEO_CONTRACT: ModelContract = {
  adapter: 'minimax-video',
  provider: 'official',
  apiVersion: 'v2',
  fields: {
    firstFrame: 'content.image_url',
    lastFrame: 'content.image_url',
    referenceImage: 'content.image_url'
  },
  transports: {
    keyframe: 'data-url',
    referenceImage: 'data-url'
  },
  roles: {
    firstFrame: 'first_frame',
    lastFrame: 'last_frame',
    reference: 'reference_image'
  },
  limits: {
    maxImageBytes: 30 * MB,
    maxRequestBytes: 64 * MB,
    minWidth: 256,
    maxWidth: 5760,
    minAspect: 0.4,
    maxAspect: 2.5
  },
  modes: ['t2v', 'first-frame', 'first-last', 'reference'],
  source: {
    url: 'https://platform.minimax.io/docs/api-reference/video-generation-v2-create',
    retrievedAt: '2026-11-21',
    confidence: 'high',
    notes: 'content[] 中通过 role 区分 first_frame / last_frame / reference_image。'
  }
}

export const MINIMAX_LEGACY_CONTRACT: ModelContract = {
  adapter: 'minimax-legacy',
  provider: 'official',
  apiVersion: 'v1',
  fields: {
    firstFrame: 'first_frame_image',
    lastFrame: 'last_frame_image'
  },
  transports: {
    keyframe: 'data-url'
  },
  roles: {
    firstFrame: 'first_frame_image',
    lastFrame: 'last_frame_image'
  },
  limits: {
    maxImageBytes: 30 * MB,
    maxRequestBytes: 64 * MB
  },
  modes: ['t2v', 'first-frame', 'first-last'],
  source: {
    url: 'https://platform.minimax.io/docs/api-reference/video-generation',
    retrievedAt: '2026-11-21',
    confidence: 'medium',
    notes: '旧版接口，当前以项目实现为准。'
  }
}

export const VOLCENGINE_VIDEO_CONTRACT: ModelContract = {
  adapter: 'volcengine-video',
  provider: 'official',
  apiVersion: 'v3',
  fields: {
    firstFrame: 'content.image_url',
    lastFrame: 'content.image_url',
    referenceImage: 'content.image_url'
  },
  transports: {
    keyframe: 'data-url',
    referenceImage: 'data-url'
  },
  roles: {
    firstFrame: 'first_frame',
    lastFrame: 'last_frame',
    reference: 'reference_image'
  },
  limits: {
    maxImageBytes: 30 * MB,
    maxRequestBytes: 64 * MB,
    minWidth: 300,
    maxWidth: 6000,
    minAspect: 0.4,
    maxAspect: 2.5
  },
  modes: [
    't2v',
    'first-frame',
    'first-last',
    'reference',
    'video-edit',
    'video-extend'
  ],
  source: {
    url: 'https://www.volcengine.com/docs/82379/1520757',
    retrievedAt: '2026-11-21',
    confidence: 'medium',
    notes: 'content[] 中通过 role 区分首帧、尾帧和参考图。'
  }
}

export const SORA_VIDEO_CONTRACT: ModelContract = {
  adapter: 'sora-video',
  provider: 'official',
  apiVersion: 'v1',
  fields: {
    firstFrame: 'input_reference'
  },
  transports: {
    keyframe: 'binary'
  },
  roles: {
    firstFrame: 'input_reference'
  },
  modes: ['t2v', 'first-frame'],
  source: {
    url: 'https://platform.openai.com/docs/guides/video-generation',
    retrievedAt: '2026-11-21',
    confidence: 'high',
    notes: '参考图通过 multipart 的 input_reference 上传。'
  }
}

export const OPENAI_COMPAT_CONTRACT: ModelContract = {
  adapter: 'openai-compat',
  provider: 'official',
  apiVersion: 'v1',
  fields: {
    referenceImage: 'image_url'
  },
  transports: {
    referenceImage: 'data-url'
  },
  roles: {
    reference: 'reference'
  },
  modes: ['t2i', 'i2i', 'layer'],
  source: {
    url: 'https://platform.openai.com/docs/api-reference/images',
    retrievedAt: '2026-11-21',
    confidence: 'high'
  }
}

export const HTTP_TEMPLATE_CONTRACT: ModelContract = {
  adapter: 'http-template',
  provider: 'official',
  apiVersion: 'custom',
  fields: {
    firstFrame: '{{refs.firstFrame}}',
    lastFrame: '{{refs.lastFrame}}',
    referenceImage: '{{refs.images}}'
  },
  transports: {
    keyframe: 'base64',
    referenceImage: 'data-url'
  },
  roles: {
    firstFrame: 'firstFrame',
    lastFrame: 'lastFrame',
    reference: 'reference'
  },
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
  source: {
    url: 'docs/models.md',
    retrievedAt: '2026-11-21',
    confidence: 'high',
    notes: '字段和载荷由用户模板决定；契约只描述内置变量语义。'
  }
}

export const OFFICIAL_CONTRACTS: Record<string, ModelContract> = {
  'openai-compat': OPENAI_COMPAT_CONTRACT,
  'agnes-video': AGNES_VIDEO_CONTRACT,
  'sora-video': SORA_VIDEO_CONTRACT,
  'minimax-video': MINIMAX_VIDEO_CONTRACT,
  'minimax-legacy': MINIMAX_LEGACY_CONTRACT,
  'kling-video': KLING_VIDEO_CONTRACT,
  'volcengine-video': VOLCENGINE_VIDEO_CONTRACT,
  'http-template': HTTP_TEMPLATE_CONTRACT
}

export function contractForAdapter(adapter: string): ModelContract | null {
  return OFFICIAL_CONTRACTS[adapter] ?? null
}

/** 官方模型：来自内置预设或官方协议模板；用户自定义模型不算 */
export function isOfficialModel(model: ModelDef): boolean {
  return (
    Boolean(model.preset) ||
    model.source?.kind === 'preset' ||
    model.source?.kind === 'template'
  )
}

/**
 * 校验模型声明与协议族契约是否一致。
 *
 * 只检查官方契约；用户自定义适配器没有契约，不产生缺口。
 * http-template 的字段由模板定义，不做字段级校验。
 */
export function contractGapsForAdapter(
  adapter: string,
  model: ModelDef
): ContractGap[] {
  const contract = OFFICIAL_CONTRACTS[adapter]
  if (!contract || adapter === 'http-template') return []

  const modes = modelModeIds(model)
  const gaps: ContractGap[] = []
  const needsFirst = modes.includes('first-frame') || modes.includes('first-last')
  const needsLast = modes.includes('first-last')
  const needsReference = modes.includes('reference')

  if (needsFirst && !contract.fields.firstFrame) {
    gaps.push({
      kind: 'contract',
      value: 'firstFrame',
      message: `${adapter} 契约没有首帧字段，但模型声明了首帧模式`
    })
  }
  if (needsLast && !contract.fields.lastFrame) {
    gaps.push({
      kind: 'contract',
      value: 'lastFrame',
      message: `${adapter} 契约没有尾帧字段，但模型声明了首尾帧模式`
    })
  }
  if (needsReference && !contract.fields.referenceImage) {
    gaps.push({
      kind: 'contract',
      value: 'referenceImage',
      message: `${adapter} 契约没有参考图字段，但模型声明了参考模式`
    })
  }
  if ((needsFirst || needsLast) && !contract.transports.keyframe) {
    gaps.push({
      kind: 'contract',
      value: 'keyframeTransport',
      message: `${adapter} 契约没有首尾帧传输格式`
    })
  }
  if (needsReference && !contract.transports.referenceImage) {
    gaps.push({
      kind: 'contract',
      value: 'referenceTransport',
      message: `${adapter} 契约没有参考图传输格式`
    })
  }

  return gaps
}
