import {
  MODEL_PRESETS,
  type ModelDef,
  type ProviderType
} from './provider-schema'

export interface ProviderPreset {
  id: string
  name: string
  description: string
  type: ProviderType
  baseUrl: string
  models: ModelDef[]
}

function presetModel(id: string): ModelDef | null {
  const model = MODEL_PRESETS.find((item) => item.id === id)
  return model ? structuredClone(model) : null
}

const MOSS_IMAGE: ModelDef = {
  id: 'moss-image-sft-1.0',
  name: 'MOSS 图像',
  capability: 'image.t2i',
  remoteModel: 'moss-image-sft-1.0',
  params: []
}

const PRESET_MODELS: Record<string, ModelDef[]> = {
  openai: ['gpt-image-1', 'gpt-4o-mini', 'tts-1']
    .map(presetModel)
    .filter((model): model is ModelDef => model !== null),
  moss: [MOSS_IMAGE],
  zhipu: ['zhipu-cogvideox-flash']
    .map(presetModel)
    .filter((model): model is ModelDef => model !== null),
  vidu: ['vidu-q2']
    .map(presetModel)
    .filter((model): model is ModelDef => model !== null),
  minimax: ['minimax-h3']
    .map(presetModel)
    .filter((model): model is ModelDef => model !== null),
  kling: ['kling-v2-5-turbo']
    .map(presetModel)
    .filter((model): model is ModelDef => model !== null),
  volcengine: ['doubao-seedance']
    .map(presetModel)
    .filter((model): model is ModelDef => model !== null),
  agnes: ['agnes-image-2.5-flash', 'agnes-video-2.5-flash']
    .map(presetModel)
    .filter((model): model is ModelDef => model !== null)
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'openai',
    name: 'OpenAI 兼容',
    description: 'OpenAI 官方或任意兼容 /v1 的中转站',
    type: 'openai-compat',
    baseUrl: 'https://api.openai.com/v1',
    models: PRESET_MODELS.openai
  },
  {
    id: 'moss',
    name: 'MOSS',
    description: 'MOSS 文生图',
    type: 'openai-compat',
    baseUrl: 'https://api.mosi.cn/v1',
    models: PRESET_MODELS.moss
  },
  {
    id: 'zhipu',
    name: '智谱',
    description: 'CogVideoX 视频',
    type: 'openai-compat',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: PRESET_MODELS.zhipu
  },
  {
    id: 'vidu',
    name: 'Vidu',
    description: 'Vidu Q2 视频',
    type: 'openai-compat',
    baseUrl: 'https://api.vidu.cn',
    models: PRESET_MODELS.vidu
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    description: 'H3 视频',
    type: 'openai-compat',
    baseUrl: 'https://api.minimax.chat/v1',
    models: PRESET_MODELS.minimax
  },
  {
    id: 'kling',
    name: '可灵',
    description: '可灵视频（API Key 或 AK/SK）',
    type: 'kling',
    baseUrl: 'https://api-beijing.klingai.com',
    models: PRESET_MODELS.kling
  },
  {
    id: 'volcengine',
    name: '火山方舟',
    description: 'Seedance 视频',
    type: 'openai-compat',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    models: PRESET_MODELS.volcengine
  },
  {
    id: 'agnes',
    name: 'Agnes AI',
    description: '图片与视频',
    type: 'openai-compat',
    baseUrl: 'https://api.agnes-ai.cn/v1',
    models: PRESET_MODELS.agnes
  }
]

export function providerPresetModels(preset: ProviderPreset): ModelDef[] {
  return preset.models.map((model) => structuredClone(model))
}
