import type { Capability, ParamDef } from './provider-schema'

export interface ParamTemplate {
  id: string
  def: ParamDef
}

const IMAGE_SIZE: ParamDef = {
  key: 'size',
  label: '尺寸',
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
  type: 'select',
  options: [
    { value: 'auto', label: '自动' },
    { value: 'high', label: '高' },
    { value: 'medium', label: '中' },
    { value: 'low', label: '低' }
  ],
  defaultValue: 'auto'
}

const VIDEO_RATIO: ParamDef = {
  key: 'ratio',
  label: '画幅比例',
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
  type: 'select',
  options: [
    { value: '5', label: '5 秒' },
    { value: '10', label: '10 秒' },
    { value: '15', label: '15 秒' }
  ],
  defaultValue: '5'
}

const VIDEO_RESOLUTION: ParamDef = {
  key: 'resolution',
  label: '分辨率',
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
  type: 'boolean',
  defaultValue: false
}

const AUDIO_VOICE: ParamDef = {
  key: 'voice',
  label: '声音',
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
  type: 'number',
  defaultValue: 0.7,
  min: 0,
  max: 2
}

const TEXT_MAX_TOKENS: ParamDef = {
  key: 'max_tokens',
  label: '最大 token',
  type: 'number',
  defaultValue: 2048,
  min: 1,
  max: 8192
}

const IMAGE_TEMPLATES: ParamTemplate[] = [
  { id: 'size', def: IMAGE_SIZE },
  { id: 'ratio', def: IMAGE_RATIO },
  { id: 'n', def: IMAGE_COUNT },
  { id: 'quality', def: IMAGE_QUALITY }
]

const VIDEO_TEMPLATES: ParamTemplate[] = [
  { id: 'ratio', def: VIDEO_RATIO },
  { id: 'duration', def: VIDEO_DURATION },
  { id: 'resolution', def: VIDEO_RESOLUTION },
  { id: 'generate_audio', def: VIDEO_AUDIO }
]

const AUDIO_TEMPLATES: ParamTemplate[] = [
  { id: 'voice', def: AUDIO_VOICE },
  { id: 'speed', def: AUDIO_SPEED },
  { id: 'format', def: AUDIO_FORMAT }
]

export const PARAM_TEMPLATES: Record<Capability, ParamTemplate[]> = {
  'image.t2i': IMAGE_TEMPLATES,
  'image.i2i': IMAGE_TEMPLATES,
  'video.t2v': VIDEO_TEMPLATES,
  'audio.tts': AUDIO_TEMPLATES,
  'audio.music': AUDIO_TEMPLATES,
  'text.chat': [
    { id: 'temperature', def: TEXT_TEMPERATURE },
    { id: 'max_tokens', def: TEXT_MAX_TOKENS }
  ]
}

export function paramTemplatesFor(capability: Capability): ParamTemplate[] {
  return PARAM_TEMPLATES[capability] ?? []
}
