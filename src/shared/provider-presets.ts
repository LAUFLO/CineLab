import {
  MODEL_PRESETS,
  type ModelDef,
  type ProviderType
} from './provider-schema'
import { normalizeModelModes } from './model-modes'
import {
  findProtocolTemplate,
  mergeModeConfigs
} from './protocol-templates'

export interface ProviderPreset {
  id: string
  name: string
  description: string
  type: ProviderType
  baseUrl: string
  /** 默认协议模板 ID；模型可以覆盖 */
  protocol?: string
  /** 申请 Key 的官方页面 */
  keyHelpUrl?: string
  /** 推荐模型 ID，只在用户点击时添加，不自动填入 */
  recommendedModelIds: string[]
}

const RECOMMENDED_MODELS: Record<string, string[]> = {
  'openai-compat': ['gpt-image-1', 'gpt-4o-mini', 'tts-1'],
  volcengine: [
    'doubao-seedream-5-5',
    'doubao-seedream-5',
    'doubao-seedance'
  ],
  dashscope: [],
  kling: ['kling-v2-5-turbo'],
  minimax: ['minimax-h3'],
  vidu: ['vidu-q2'],
  openai: ['gpt-image-1', 'gpt-4o-mini', 'tts-1'],
  gemini: [],
  moss: [],
  agnes: ['agnes-image-2.5-flash', 'agnes-video-2.5-flash'],
  runway: [],
  luma: [],
  zhipu: [],
  qianfan: [],
  bfl: [],
  ideogram: [],
  recraft: [],
  stability: [],
  fal: [],
  replicate: [],
  hunyuan: []
}

/** 首屏热门供应商；其余收进「更多」 */
export const HOT_PROVIDER_IDS = new Set([
  'openai-compat',
  'volcengine',
  'dashscope',
  'kling',
  'minimax',
  'vidu',
  'openai',
  'gemini'
])

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'openai-compat',
    name: 'OpenAI 兼容',
    description: 'OpenAI 官方或任意兼容 /v1 的中转站',
    type: 'openai-compat',
    baseUrl: 'https://api.openai.com/v1',
    keyHelpUrl: 'https://platform.openai.com/api-keys',
    recommendedModelIds: RECOMMENDED_MODELS['openai-compat']
  },
  {
    id: 'volcengine',
    name: '火山方舟',
    description: 'Seedance 视频 · Seedream 图片（即梦同源）',
    type: 'openai-compat',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    protocol: 'ark-video',
    keyHelpUrl: 'https://console.volcengine.com/ark',
    recommendedModelIds: RECOMMENDED_MODELS.volcengine
  },
  {
    id: 'dashscope',
    name: '阿里百炼',
    description: '万相 Wan 3.0 视频 · Qwen-Image 图像（通义万相）',
    type: 'openai-compat',
    baseUrl: 'https://dashscope.aliyuncs.com',
    protocol: 'wan-video',
    keyHelpUrl: 'https://bailian.console.aliyun.com/',
    recommendedModelIds: RECOMMENDED_MODELS.dashscope
  },
  {
    id: 'kling',
    name: '可灵',
    description: '可灵 4.0 视频（API Key 或 AK/SK）',
    type: 'kling',
    baseUrl: 'https://api-beijing.klingai.com',
    protocol: 'kling-video',
    keyHelpUrl: 'https://klingai.com/dev',
    recommendedModelIds: RECOMMENDED_MODELS.kling
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    description: 'H3 视频 / H3-Image 图像（海螺）',
    type: 'openai-compat',
    baseUrl: 'https://api.minimax.io',
    protocol: 'minimax-video',
    keyHelpUrl: 'https://platform.minimax.io/user-center/basic-information/interface-key',
    recommendedModelIds: RECOMMENDED_MODELS.minimax
  },
  {
    id: 'vidu',
    name: 'Vidu',
    description: 'Vidu Q4 视频',
    type: 'openai-compat',
    baseUrl: 'https://api.vidu.cn',
    protocol: 'vidu-video',
    keyHelpUrl: 'https://platform.vidu.cn/',
    recommendedModelIds: RECOMMENDED_MODELS.vidu
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT Image 2.6 / GPT-4o / TTS',
    type: 'openai-compat',
    baseUrl: 'https://api.openai.com/v1',
    protocol: 'openai-image',
    keyHelpUrl: 'https://platform.openai.com/api-keys',
    recommendedModelIds: RECOMMENDED_MODELS.openai
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'Nano Banana 2.1 图像 · Veo 3.1 视频（需要自定义协议）',
    type: 'openai-compat',
    baseUrl: 'https://generativelanguage.googleapis.com',
    keyHelpUrl: 'https://aistudio.google.com/apikey',
    recommendedModelIds: RECOMMENDED_MODELS.gemini
  },
  {
    id: 'moss',
    name: 'MOSS',
    description: 'MOSS 文生图',
    type: 'openai-compat',
    baseUrl: 'https://api.mosi.cn/v1',
    recommendedModelIds: RECOMMENDED_MODELS.moss
  },
  {
    id: 'agnes',
    name: 'Agnes AI',
    description: '图片与视频',
    type: 'openai-compat',
    baseUrl: 'https://api.agnes-ai.cn/v1',
    recommendedModelIds: RECOMMENDED_MODELS.agnes
  },
  {
    id: 'runway',
    name: 'Runway',
    description: 'Gen-4.5 视频',
    type: 'openai-compat',
    baseUrl: 'https://api.dev.runwayml.com',
    protocol: 'runway-video',
    keyHelpUrl: 'https://dev.runwayml.com/',
    recommendedModelIds: RECOMMENDED_MODELS.runway
  },
  {
    id: 'luma',
    name: 'Luma',
    description: 'Ray 3.2 视频',
    type: 'openai-compat',
    baseUrl: 'https://api.lumalabs.ai',
    protocol: 'luma-video',
    keyHelpUrl: 'https://lumalabs.ai/api',
    recommendedModelIds: RECOMMENDED_MODELS.luma
  },
  {
    id: 'zhipu',
    name: '智谱',
    description: 'CogVideoX 视频 · GLM-Image 图像',
    type: 'openai-compat',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    protocol: 'zhipu-video',
    keyHelpUrl: 'https://open.bigmodel.cn/',
    recommendedModelIds: RECOMMENDED_MODELS.zhipu
  },
  {
    id: 'qianfan',
    name: '百度千帆',
    description: '蒸汽机视频 · 文心图像',
    type: 'openai-compat',
    baseUrl: 'https://qianfan.baidubce.com',
    protocol: 'baidu-video',
    keyHelpUrl: 'https://console.bce.baidu.com/qianfan/',
    recommendedModelIds: RECOMMENDED_MODELS.qianfan
  },
  {
    id: 'bfl',
    name: 'Black Forest Labs',
    description: 'FLUX.2 图像',
    type: 'openai-compat',
    baseUrl: 'https://api.bfl.ai',
    protocol: 'bfl-image',
    keyHelpUrl: 'https://bfl.ai/',
    recommendedModelIds: RECOMMENDED_MODELS.bfl
  },
  {
    id: 'ideogram',
    name: 'Ideogram',
    description: 'Ideogram 4.5 图像',
    type: 'openai-compat',
    baseUrl: 'https://api.ideogram.ai',
    protocol: 'ideogram-image',
    keyHelpUrl: 'https://developer.ideogram.ai/',
    recommendedModelIds: RECOMMENDED_MODELS.ideogram
  },
  {
    id: 'recraft',
    name: 'Recraft',
    description: 'Recraft V4.1 图像',
    type: 'openai-compat',
    baseUrl: 'https://external.api.recraft.ai',
    protocol: 'recraft-image',
    keyHelpUrl: 'https://www.recraft.ai/',
    recommendedModelIds: RECOMMENDED_MODELS.recraft
  },
  {
    id: 'stability',
    name: 'Stability AI',
    description: 'Stable Image / SD',
    type: 'openai-compat',
    baseUrl: 'https://api.stability.ai',
    keyHelpUrl: 'https://platform.stability.ai/',
    recommendedModelIds: RECOMMENDED_MODELS.stability
  },
  {
    id: 'fal',
    name: 'Fal.ai',
    description: '聚合图像/视频模型',
    type: 'openai-compat',
    baseUrl: 'https://fal.run',
    keyHelpUrl: 'https://fal.ai/dashboard/keys',
    recommendedModelIds: RECOMMENDED_MODELS.fal
  },
  {
    id: 'replicate',
    name: 'Replicate',
    description: '聚合图像/视频模型',
    type: 'openai-compat',
    baseUrl: 'https://api.replicate.com/v1',
    keyHelpUrl: 'https://replicate.com/account/api-tokens',
    recommendedModelIds: RECOMMENDED_MODELS.replicate
  },
  {
    id: 'hunyuan',
    name: '腾讯混元',
    description: '混元生视频 · 混元图像（TC3 签名）',
    type: 'openai-compat',
    baseUrl: 'https://hunyuan.tencentcloudapi.com',
    protocol: 'hunyuan-video',
    keyHelpUrl: 'https://console.cloud.tencent.com/hunyuan',
    recommendedModelIds: RECOMMENDED_MODELS.hunyuan
  }
]

export function findProviderPresetById(
  id: string | undefined
): ProviderPreset | undefined {
  if (!id) return undefined
  return PROVIDER_PRESETS.find((preset) => preset.id === id)
}

export function findProviderPresetByBaseUrl(
  baseUrl: string
): ProviderPreset | undefined {
  const normalized = baseUrl.trim().replace(/\/+$/, '')
  return PROVIDER_PRESETS.find(
    (preset) => preset.baseUrl.replace(/\/+$/, '') === normalized
  )
}

/**
 * 推荐模型只在用户点击时生成，不自动填入供应商草稿。
 * 能力仍由协议模板和模型配置决定，不是「模型预设」。
 */
export function recommendedModelsForPreset(presetId: string): ModelDef[] {
  const ids = RECOMMENDED_MODELS[presetId] ?? []
  return ids.flatMap((id) => {
    const model = MODEL_PRESETS.find((item) => item.id === id)
    if (!model) return []
    const clone = structuredClone(model)
    const template = findProtocolTemplate(clone.protocol)
    const modes =
      template && clone.modes
        ? mergeModeConfigs(template.modes, normalizeModelModes(clone.modes))
        : clone.modes
    return [
      {
        ...clone,
        ...(modes ? { modes } : {}),
        ...(template?.features ? { features: template.features } : {}),
        preset: id
      }
    ]
  })
}
