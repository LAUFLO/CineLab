import type { HttpTemplate } from './http-template'

export type Capability =
  | 'image.t2i'
  | 'image.i2i'
  | 'text.chat'
  | 'video.t2v'
  | 'audio.tts'
  | 'audio.music'

export type ProviderType = 'openai-compat' | 'kling'

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
  /** 该模型只出现在指定类型的供应商下；缺省为 openai-compat */
  providerType?: ProviderType
  /** 生成执行器，缺省按 remoteModel 推断 */
  adapter?: string
  /** http-template 执行器的请求/轮询模板 */
  template?: HttpTemplate
}

export interface ProviderConfig {
  id: string
  name: string
  type: ProviderType
  baseUrl: string
  models: ModelDef[]
  hasKey: boolean
  hasSecret: boolean
  /** settings = 应用内配置，models = models.json */
  source?: 'settings' | 'models'
  createdAt: string
  updatedAt: string
}

export interface ProviderInput {
  id?: string
  type?: ProviderType
  name: string
  baseUrl: string
  apiKey?: string
  secretKey?: string
  models: ModelDef[]
}

export interface ConnectionTestInput {
  id?: string
  type?: ProviderType
  baseUrl: string
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
  },
  {
    id: 'suno-music',
    name: 'Suno Music',
    capability: 'audio.music',
    remoteModel: 'suno-music',
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
    id: 'zhipu-cogvideox-flash',
    name: '智谱 CogVideoX Flash',
    capability: 'video.t2v',
    remoteModel: 'cogvideox-flash',
    adapter: 'http-template',
    params: [
      {
        key: 'duration',
        label: '时长',
        type: 'select',
        options: [
          { value: '5', label: '5s' },
          { value: '10', label: '10s' }
        ],
        defaultValue: '5'
      },
      {
        key: 'size',
        label: '分辨率',
        type: 'select',
        options: [
          { value: '1920x1080', label: '1920×1080' },
          { value: '1080x1920', label: '1080×1920' },
          { value: '1024x1024', label: '1024×1024' }
        ],
        defaultValue: '1920x1080'
      },
      {
        key: 'fps',
        label: '帧率',
        type: 'select',
        options: [
          { value: '30', label: '30fps' },
          { value: '60', label: '60fps' }
        ],
        defaultValue: '30'
      },
      {
        key: 'quality',
        label: '模式',
        type: 'select',
        options: [
          { value: 'quality', label: '质量优先' },
          { value: 'speed', label: '速度优先' }
        ],
        defaultValue: 'quality'
      }
    ],
    template: {
      auth: { header: 'Authorization', prefix: 'Bearer ' },
      submit: {
        path: '/videos/generations',
        bodyByMode: {
          text: {
            model: '{{model}}',
            prompt: '{{prompt}}',
            quality: '{{params.quality}}',
            size: '{{params.size}}',
            fps: '{{params.fps}}',
            duration: '{{params.duration}}'
          },
          image: {
            model: '{{model}}',
            prompt: '{{prompt}}',
            image_url: '{{refs.firstFrame}}',
            quality: '{{params.quality}}',
            size: '{{params.size}}',
            fps: '{{params.fps}}',
            duration: '{{params.duration}}'
          },
          keyframe: {
            model: '{{model}}',
            prompt: '{{prompt}}',
            image_url: ['{{refs.firstFrame}}', '{{refs.lastFrame}}'],
            quality: '{{params.quality}}',
            size: '{{params.size}}',
            fps: '{{params.fps}}',
            duration: '{{params.duration}}'
          }
        },
        omitEmpty: true
      },
      poll: {
        path: '/async-result/{{taskId}}',
        taskIdPath: 'id',
        statusPath: 'task_status',
        successValues: ['SUCCESS'],
        failValues: ['FAIL'],
        resultPath: 'video_result[0].url'
      }
    }
  },
  {
    id: 'vidu-q2',
    name: 'Vidu Q2',
    capability: 'video.t2v',
    remoteModel: 'viduq2',
    adapter: 'http-template',
    params: [
      {
        key: 'duration',
        label: '时长',
        type: 'select',
        options: [
          { value: '4', label: '4s' },
          { value: '5', label: '5s' },
          { value: '8', label: '8s' },
          { value: '10', label: '10s' }
        ],
        defaultValue: '5'
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
    params: [
      {
        key: 'duration',
        label: '时长',
        type: 'select',
        options: [
          { value: '4', label: '4s' },
          { value: '5', label: '5s' },
          { value: '6', label: '6s' },
          { value: '8', label: '8s' },
          { value: '10', label: '10s' }
        ],
        defaultValue: '6'
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
    params: [
      {
        key: 'duration',
        label: '时长',
        type: 'select',
        options: [
          { value: '6', label: '6s' },
          { value: '10', label: '10s' }
        ],
        defaultValue: '6'
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
        type: 'select',
        options: [
          { value: '5', label: '5s' },
          { value: '10', label: '10s' }
        ],
        defaultValue: '5'
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
        type: 'select',
        options: [
          { value: '5', label: '5s' },
          { value: '10', label: '10s' }
        ],
        defaultValue: '5'
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
    params: [
      {
        key: 'duration',
        label: '时长',
        type: 'select',
        options: [
          { value: '4', label: '4s' },
          { value: '5', label: '5s' },
          { value: '6', label: '6s' },
          { value: '8', label: '8s' },
          { value: '10', label: '10s' },
          { value: '12', label: '12s' }
        ],
        defaultValue: '5'
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
