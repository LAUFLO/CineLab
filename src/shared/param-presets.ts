import type { Capability, ParamDef } from './provider-schema'

export interface ParamTemplate {
  id: string
  def: ParamDef
  /** 给首次配置用户看的说明 */
  description?: string
}

const IMAGE_SIZE: ParamDef = {
  key: 'size',
  label: '尺寸',
  group: '尺寸',
  type: 'select',
  options: [
    { value: '1024x1024', label: '1024×1024' },
    { value: '1536x1024', label: '1536×1024' },
    { value: '1024x1536', label: '1024×1536' },
    { value: '512x512', label: '512×512' }
  ],
  defaultValue: '1024x1024'
}

const IMAGE_RATIO: ParamDef = {
  key: 'ratio',
  label: '画幅比例',
  group: '比例',
  type: 'select',
  options: [
    { value: '1:1', label: '1:1' },
    { value: '16:9', label: '16:9' },
    { value: '9:16', label: '9:16' },
    { value: '4:3', label: '4:3' },
    { value: '3:4', label: '3:4' },
    { value: '21:9', label: '21:9' }
  ],
  defaultValue: '1:1'
}

const IMAGE_COUNT: ParamDef = {
  key: 'n',
  label: '数量',
  group: '生成数量',
  type: 'select',
  options: [
    { value: '1', label: '1 张' },
    { value: '2', label: '2 张' },
    { value: '3', label: '3 张' },
    { value: '4', label: '4 张' }
  ],
  defaultValue: '1'
}

const IMAGE_QUALITY: ParamDef = {
  key: 'quality',
  label: '质量',
  group: '画质',
  type: 'select',
  options: [
    { value: 'auto', label: '自动' },
    { value: 'high', label: '高' },
    { value: 'medium', label: '中' },
    { value: 'low', label: '低' }
  ],
  defaultValue: 'auto'
}

const IMAGE_SEED: ParamDef = {
  key: 'seed',
  label: '随机种子',
  group: '随机种子',
  type: 'number',
  defaultValue: 0,
  min: 0,
  max: 2147483647
}

const VIDEO_RATIO: ParamDef = {
  key: 'ratio',
  label: '画幅比例',
  group: '比例',
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

const VIDEO_DURATION: ParamDef = {
  key: 'duration',
  label: '时长',
  group: '视频时长',
  type: 'number',
  defaultValue: 5,
  min: 1,
  max: 30
}

const VIDEO_RESOLUTION: ParamDef = {
  key: 'resolution',
  label: '分辨率',
  group: '清晰度',
  type: 'select',
  options: [
    { value: '480p', label: '480p' },
    { value: '720p', label: '720p' },
    { value: '1080p', label: '1080p' }
  ],
  defaultValue: '720p'
}

const VIDEO_AUDIO: ParamDef = {
  key: 'generate_audio',
  label: '生成音频',
  group: '生成音频',
  type: 'boolean',
  defaultValue: false
}

const VIDEO_FPS: ParamDef = {
  key: 'fps',
  label: '帧率',
  group: '帧率',
  type: 'select',
  options: [
    { value: '24', label: '24 fps' },
    { value: '30', label: '30 fps' },
    { value: '60', label: '60 fps' }
  ],
  defaultValue: '24'
}

const AUDIO_VOICE: ParamDef = {
  key: 'voice',
  label: '声音',
  group: '声音',
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
}

const AUDIO_SPEED: ParamDef = {
  key: 'speed',
  label: '语速',
  group: '语速',
  type: 'select',
  options: [
    { value: '0.5', label: '0.5×' },
    { value: '0.75', label: '0.75×' },
    { value: '1', label: '1×' },
    { value: '1.25', label: '1.25×' },
    { value: '1.5', label: '1.5×' }
  ],
  defaultValue: '1'
}

const AUDIO_FORMAT: ParamDef = {
  key: 'format',
  label: '格式',
  group: '格式',
  type: 'select',
  options: [
    { value: 'mp3', label: 'MP3' },
    { value: 'wav', label: 'WAV' },
    { value: 'opus', label: 'OPUS' }
  ],
  defaultValue: 'mp3'
}

const TEXT_TEMPERATURE: ParamDef = {
  key: 'temperature',
  label: '温度',
  group: '生成',
  type: 'number',
  defaultValue: 0.7,
  min: 0,
  max: 2
}

const TEXT_MAX_TOKENS: ParamDef = {
  key: 'max_tokens',
  label: '最大 token',
  group: '生成',
  type: 'number',
  defaultValue: 2048,
  min: 1,
  max: 8192
}

const IMAGE_TEMPLATES: ParamTemplate[] = [
  {
    id: 'size',
    def: IMAGE_SIZE,
    description: '生成图片的实际像素尺寸，常用 1024×1024、1536×1024'
  },
  {
    id: 'ratio',
    def: IMAGE_RATIO,
    description: '画面宽高比，Prompt Bar 会显示为比例网格'
  },
  {
    id: 'n',
    def: IMAGE_COUNT,
    description: '一次生成几张图，通常 1–4 张'
  },
  {
    id: 'quality',
    def: IMAGE_QUALITY,
    description: '模型支持的画质档位，不确定时选「自动」'
  },
  {
    id: 'seed',
    def: IMAGE_SEED,
    description: '固定种子可复现同一张图；0 表示随机'
  }
]

const VIDEO_TEMPLATES: ParamTemplate[] = [
  {
    id: 'ratio',
    def: VIDEO_RATIO,
    description: '视频画幅，竖屏短剧选 9:16，横屏选 16:9'
  },
  {
    id: 'duration',
    def: VIDEO_DURATION,
    description: '单段视频时长，按模型支持范围填写'
  },
  {
    id: 'resolution',
    def: VIDEO_RESOLUTION,
    description: '输出清晰度，CPU/额度有限时先用 720p'
  },
  {
    id: 'generate_audio',
    def: VIDEO_AUDIO,
    description: '是否让模型同时生成声音，不需要就关闭'
  },
  {
    id: 'fps',
    def: VIDEO_FPS,
    description: '视频帧率，常用 24 或 30 fps'
  }
]

const AUDIO_TEMPLATES: ParamTemplate[] = [
  {
    id: 'voice',
    def: AUDIO_VOICE,
    description: 'TTS 音色，按模型支持的音色名选择'
  },
  {
    id: 'speed',
    def: AUDIO_SPEED,
    description: '语速倍率，1× 为正常速度'
  },
  {
    id: 'format',
    def: AUDIO_FORMAT,
    description: '输出音频格式，MP3 兼容性最好'
  }
]

export const PARAM_TEMPLATES: Record<Capability, ParamTemplate[]> = {
  'image.t2i': IMAGE_TEMPLATES,
  'image.i2i': IMAGE_TEMPLATES,
  'video.t2v': VIDEO_TEMPLATES,
  'audio.tts': AUDIO_TEMPLATES,
  'audio.music': AUDIO_TEMPLATES,
  'text.chat': [
    {
      id: 'temperature',
      def: TEXT_TEMPERATURE,
      description: '越低越稳定，越高越发散；常用 0.7'
    },
    {
      id: 'max_tokens',
      def: TEXT_MAX_TOKENS,
      description: '单次回复的最大长度，常用 2048'
    }
  ]
}

export function paramTemplatesFor(capability: Capability): ParamTemplate[] {
  return PARAM_TEMPLATES[capability] ?? []
}
