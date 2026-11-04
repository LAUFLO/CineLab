export type Capability =
  | 'image.t2i'
  | 'image.i2i'
  | 'text.chat'
  | 'video.t2v'
  | 'audio.tts'
  | 'audio.music'

export type ProviderType = 'openai-compat'

export interface ParamOption {
  value: string
  label: string
}

export interface ParamDef {
  key: string
  label: string
  type: 'select' | 'number' | 'text' | 'boolean'
  options?: ParamOption[]
  defaultValue?: string | number | boolean
  min?: number
  max?: number
}

export interface ModelDef {
  id: string
  name: string
  capability: Capability
  remoteModel: string
  params: ParamDef[]
}

export interface ProviderConfig {
  id: string
  name: string
  type: ProviderType
  baseUrl: string
  models: ModelDef[]
  hasKey: boolean
  createdAt: string
  updatedAt: string
}

export interface ProviderInput {
  id?: string
  name: string
  baseUrl: string
  apiKey?: string
  models: ModelDef[]
}

export interface ConnectionTestInput {
  id?: string
  baseUrl: string
  apiKey?: string
}

export interface ConnectionTestResult {
  ok: boolean
  message: string
}

export const CAPABILITY_LABEL: Record<Capability, string> = {
  'image.t2i': '文生图',
  'image.i2i': '图生图',
  'text.chat': '文本对话',
  'video.t2v': '文生视频',
  'audio.tts': '语音合成',
  'audio.music': '音乐生成'
}

export const MODEL_PRESETS: ModelDef[] = [
  {
    id: 'gpt-image-1',
    name: 'GPT Image 1',
    capability: 'image.t2i',
    remoteModel: 'gpt-image-1',
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
    params: [
      { key: 'temperature', label: '温度', type: 'number', defaultValue: 0.7, min: 0, max: 2 },
      { key: 'max_tokens', label: '最大输出', type: 'number', defaultValue: 2048, min: 64, max: 32768 }
    ]
  },
  {
    id: 'doubao-seedance',
    name: 'Seedance 2.5 视频',
    capability: 'video.t2v',
    remoteModel: 'doubao-seedance-2-5-260628',
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
        type: 'select',
        options: [
          { value: '5', label: '5s' },
          { value: '10', label: '10s' }
        ],
        defaultValue: '5'
      }
    ]
  },
  {
    id: 'tts-1',
    name: 'OpenAI TTS',
    capability: 'audio.tts',
    remoteModel: 'tts-1',
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
  }
]
