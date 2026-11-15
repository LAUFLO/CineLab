import type { ModelFeature, ParamDef, ProviderType } from './provider-schema'
import type { ModelModeConfig, ModelModeId } from './model-modes'
import type { HttpTemplate } from './http-template'

/**
 * 协议模板：按 API 协议聚类的能力默认值。
 *
 * 模板只写「这类接口通常怎么用」，具体模型的差异由 MODEL_RULES 覆盖。
 * 同家族新模型不需要新增模板，只要指纹规则能匹配上。
 */
export interface ProtocolTemplate {
  id: string
  label: string
  adapter?: string
  providerType?: ProviderType
  modes: ModelModeConfig[]
  params: ParamDef[]
  features?: ModelFeature[]
  template?: HttpTemplate
  extraBody?: Record<string, unknown>
  omitBody?: string[]
  /** ready：已有执行器；draft：已有模板但未真机验证；requires-adapter：需要新增代码适配 */
  status?: 'ready' | 'draft' | 'requires-adapter'
}

export interface ModelRule {
  /** 用 remoteModel 匹配，不要带 g 标志 */
  match: RegExp
  template: string
  overrides?: {
    modes?: ModelModeConfig[]
    removeModes?: ModelModeId[]
    params?: Record<string, Partial<ParamDef>>
    features?: ModelFeature[]
  }
}

const IMAGE_SIZE = (): ParamDef => ({
  key: 'size',
  label: '尺寸',
  type: 'select',
  options: [
    { value: '1024x1024', label: '1:1' },
    { value: '1536x1024', label: '3:2' },
    { value: '1024x1536', label: '2:3' }
  ],
  defaultValue: '1024x1024',
  description: '生成图片的像素尺寸；不确定时用 1:1。'
})

const VIDEO_RATIO = (fallback = '16:9'): ParamDef => ({
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
  defaultValue: fallback,
  description: '画面宽高比；竖屏短剧选 9:16，横屏选 16:9。'
})

const VIDEO_DURATION = (
  min: number,
  max: number,
  fallback: number
): ParamDef => ({
  key: 'duration',
  label: '时长',
  type: 'number',
  defaultValue: fallback,
  min,
  max,
  description: `生成视频的秒数，范围 ${min}–${max} 秒。`
})

export const PROTOCOL_TEMPLATES: ProtocolTemplate[] = [
  {
    id: 'openai-image',
    label: 'OpenAI 图像',
    adapter: 'openai-compat',
    modes: [{ id: 't2i' }, { id: 'i2i' }],
    features: ['mask'],
    params: [
      IMAGE_SIZE(),
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
        defaultValue: 'auto',
        description: '画质越高越慢越贵；不确定时选自动。'
      },
      {
        key: 'background',
        label: '背景',
        type: 'select',
        options: [
          { value: 'opaque', label: '不透明' },
          { value: 'transparent', label: '透明' }
        ],
        defaultValue: 'opaque',
        description: '需要抠图或叠加时选透明。'
      },
      {
        key: 'output_format',
        label: '输出格式',
        type: 'select',
        options: [
          { value: 'png', label: 'PNG' },
          { value: 'jpeg', label: 'JPEG' },
          { value: 'webp', label: 'WebP' }
        ],
        defaultValue: 'png',
        description: 'PNG 支持透明；JPEG 体积更小。'
      },
      {
        key: 'n',
        label: '数量',
        type: 'number',
        defaultValue: 1,
        min: 1,
        max: 4,
        description: '一次生成几张图。'
      }
    ]
  },
  {
    id: 'ark-image',
    label: '火山方舟图像',
    adapter: 'openai-compat',
    modes: [
      { id: 't2i' },
      { id: 'i2i' },
      { id: 'layer' }
    ],
    features: ['layer', 'ocr', 'rgba'],
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
        defaultValue: '2K',
        description: '输出清晰度档位；2K 适合成片，1K 适合快速预览。'
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
        defaultValue: 'auto',
        appliesTo: ['t2i', 'i2i'],
        description: '透明背景会自动要求 PNG 输出。'
      },
      {
        key: 'output_format',
        label: '输出格式',
        type: 'select',
        options: [
          { value: 'png', label: 'PNG' },
          { value: 'jpeg', label: 'JPEG' }
        ],
        defaultValue: 'png',
        description: '需要透明通道时只能用 PNG。'
      },
      {
        key: 'watermark',
        label: '水印',
        type: 'boolean',
        defaultValue: false,
        description: '开启后生成图片带模型水印。'
      },
      {
        key: 'layer_decomposition',
        label: '图层拆分',
        type: 'boolean',
        defaultValue: false,
        appliesTo: ['layer'],
        description: '把单张图拆成底图和多个独立图层。'
      },
      {
        key: 'layer_max_images',
        label: '最多图层数',
        type: 'number',
        defaultValue: 30,
        min: 2,
        max: 100,
        appliesTo: ['layer'],
        description: '包含底图在内的最大图片数；数值越大拆得越细。'
      },
      {
        key: 'text_recognition',
        label: '识别文字',
        type: 'boolean',
        defaultValue: true,
        appliesTo: ['layer'],
        description: '为规整文字图层返回 OCR 文本和样式。'
      }
    ],
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
    omitBody: ['n']
  },
  {
    id: 'ark-video',
    label: '火山方舟视频',
    adapter: 'volcengine-video',
    modes: [
      { id: 't2v' },
      { id: 'first-frame' },
      { id: 'first-last' },
      { id: 'reference' },
      { id: 'video-edit' },
      { id: 'video-extend' }
    ],
    features: ['audio', 'last-frame'],
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
        defaultValue: '720p',
        description: '输出清晰度；预览阶段优先用 480P 或 720P。'
      },
      {
        key: 'ratio',
        label: '比例',
        type: 'select',
        options: [
          { value: 'adaptive', label: '自适应' },
          { value: '16:9', label: '16:9' },
          { value: '9:16', label: '9:16' },
          { value: '1:1', label: '1:1' },
          { value: '4:3', label: '4:3' },
          { value: '3:4', label: '3:4' },
          { value: '21:9', label: '21:9' }
        ],
        defaultValue: 'adaptive',
        description:
          '首帧、首尾帧和视频编辑只能跟着输入画面走，会自动锁定为自适应。',
        force: [
          { when: { mode: 'first-last' }, value: 'adaptive' },
          { when: { mode: 'video-edit' }, value: 'adaptive' },
          { when: { mode: 'video-extend' }, value: 'adaptive' }
        ]
      },
      {
        key: 'duration',
        label: '时长',
        type: 'number',
        defaultValue: 5,
        min: 4,
        max: 30,
        description: '生成视频的秒数；视频编辑会锁定为 -1，由模型决定。',
        force: { when: { mode: 'video-edit' }, value: -1 }
      },
      {
        key: 'generate_audio',
        label: '生成音频',
        type: 'boolean',
        defaultValue: true,
        description: '让模型同时生成对白、音效或背景音乐。'
      },
      {
        key: 'watermark',
        label: '水印',
        type: 'boolean',
        defaultValue: false,
        description: '开启后视频右下角带模型水印。'
      },
      {
        key: 'return_last_frame',
        label: '返回尾帧',
        type: 'boolean',
        defaultValue: false,
        description: '把生成视频的最后一帧作为图片返回，便于接续下一段。'
      },
      {
        key: 'output_format',
        label: '输出格式',
        type: 'select',
        options: [
          { value: 'mp4', label: 'MP4' },
          { value: 'mov', label: 'MOV' }
        ],
        defaultValue: 'mp4',
        description: 'MP4 兼容性最好；MOV 适合后期调色。'
      }
    ]
  },
  {
    id: 'kling-video',
    label: '可灵视频',
    adapter: 'kling-video',
    providerType: 'kling',
    modes: [
      { id: 't2v' },
      { id: 'first-frame' },
      { id: 'first-last' },
      { id: 'reference' },
      { id: 'video-edit' },
      { id: 'video-extend' }
    ],
    features: ['audio'],
    params: [
      VIDEO_DURATION(5, 30, 5),
      VIDEO_RATIO('16:9'),
      {
        key: 'mode',
        label: '模式',
        type: 'select',
        options: [
          { value: 'std', label: '标准' },
          { value: 'pro', label: '高品质' }
        ],
        defaultValue: 'pro',
        description: '高品质更慢更贵；草稿阶段用标准。'
      },
      {
        key: 'cfg_scale',
        label: '提示词强度',
        type: 'number',
        defaultValue: 0.5,
        min: 0,
        max: 1,
        description: '越高越贴近提示词，越低越自由。'
      }
    ]
  },
  {
    id: 'minimax-video',
    label: 'MiniMax 视频',
    adapter: 'minimax-video',
    modes: [
      { id: 't2v' },
      { id: 'first-frame' },
      { id: 'first-last' },
      { id: 'reference' }
    ],
    features: ['audio'],
    params: [
      {
        key: 'resolution',
        label: '分辨率',
        type: 'select',
        options: [
          { value: '768P', label: '768P' },
          { value: '2K', label: '2K' }
        ],
        defaultValue: '768P',
        description: 'H3 主模型支持 2K；Lite / Highspeed / Max 只到 768P。'
      },
      VIDEO_DURATION(4, 15, 5),
      {
        key: 'ratio',
        label: '比例',
        type: 'select',
        options: [
          { value: 'adaptive', label: '自适应' },
          { value: '21:9', label: '21:9' },
          { value: '16:9', label: '16:9' },
          { value: '4:3', label: '4:3' },
          { value: '1:1', label: '1:1' },
          { value: '3:4', label: '3:4' },
          { value: '9:16', label: '9:16' }
        ],
        defaultValue: 'adaptive',
        description:
          '文生视频必须指定具体比例；图生视频和参考生视频默认自适应。',
        deny: { when: { mode: 't2v' }, values: ['adaptive'] }
      }
    ]
  },
  {
    id: 'vidu-video',
    label: 'Vidu 视频',
    adapter: 'http-template',
    modes: [
      { id: 't2v' },
      { id: 'first-frame' },
      { id: 'first-last' },
      { id: 'reference' }
    ],
    params: [
      VIDEO_DURATION(4, 16, 5),
      {
        key: 'resolution',
        label: '分辨率',
        type: 'select',
        options: [
          { value: '540p', label: '540P' },
          { value: '720p', label: '720P' },
          { value: '1080p', label: '1080P' },
          { value: '2K', label: '2K' }
        ],
        defaultValue: '720p',
        description: 'Q4 支持 2K/4K；旧版 Q2 最高 1080P。'
      },
      VIDEO_RATIO('16:9')
    ]
  },
  {
    id: 'agnes-video',
    label: 'Agnes 视频',
    adapter: 'agnes-video',
    modes: [
      { id: 't2v' },
      { id: 'first-frame' },
      { id: 'first-last' },
      { id: 'reference' }
    ],
    features: ['audio'],
    params: [
      VIDEO_DURATION(4, 12, 5),
      VIDEO_RATIO('16:9')
    ]
  },
  {
    id: 'veo-video',
    label: 'Veo 3.1',
    status: 'requires-adapter',
    modes: [
      { id: 't2v' },
      { id: 'first-frame' },
      { id: 'first-last' },
      { id: 'reference' }
    ],
    features: ['audio'],
    params: [
      VIDEO_DURATION(4, 8, 8),
      {
        key: 'resolution',
        label: '分辨率',
        type: 'select',
        options: [
          { value: '720p', label: '720P' },
          { value: '1080p', label: '1080P' },
          { value: '4k', label: '4K' }
        ],
        defaultValue: '1080p'
      },
      VIDEO_RATIO('16:9'),
      {
        key: 'generate_audio',
        label: '生成音频',
        type: 'boolean',
        defaultValue: true
      }
    ]
  },
  {
    id: 'gemini-image',
    label: 'Gemini 图像',
    status: 'requires-adapter',
    modes: [
      { id: 't2i' },
      { id: 'i2i' }
    ],
    params: [
      {
        key: 'aspect_ratio',
        label: '比例',
        type: 'select',
        options: [
          { value: '1:1', label: '1:1' },
          { value: '2:3', label: '2:3' },
          { value: '3:2', label: '3:2' },
          { value: '3:4', label: '3:4' },
          { value: '4:3', label: '4:3' },
          { value: '4:5', label: '4:5' },
          { value: '5:4', label: '5:4' },
          { value: '9:16', label: '9:16' },
          { value: '16:9', label: '16:9' },
          { value: '21:9', label: '21:9' }
        ],
        defaultValue: '1:1'
      },
      {
        key: 'image_size',
        label: '分辨率',
        type: 'select',
        options: [
          { value: '1K', label: '1K' },
          { value: '2K', label: '2K' },
          { value: '4K', label: '4K' }
        ],
        defaultValue: '1K'
      }
    ]
  },
  {
    id: 'wan-video',
    label: '万相 3.0',
    adapter: 'http-template',
    status: 'draft',
    modes: [
      { id: 't2v' },
      { id: 'first-frame' },
      { id: 'first-last' },
      { id: 'reference' },
      { id: 'video-extend' }
    ],
    features: ['audio'],
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
        defaultValue: '1080p'
      },
      VIDEO_DURATION(2, 30, 5),
      VIDEO_RATIO('16:9'),
      {
        key: 'generate_audio',
        label: '生成音频',
        type: 'boolean',
        defaultValue: true
      }
    ],
    template: {
      auth: {
        header: 'Authorization',
        prefix: 'Bearer ',
        headers: { 'X-DashScope-Async': 'enable' }
      },
      submit: {
        path: '/api/v1/services/aigc/video-generation/video-synthesis',
        body: {
          model: '{{model}}',
          input: {
            prompt: '{{prompt}}',
            img_url: '{{refs.firstFrame}}'
          },
          parameters: {
            resolution: '{{params.resolution}}',
            duration: '{{params.duration}}',
            prompt_extend: true,
            watermark: false
          }
        }
      },
      poll: {
        path: '/api/v1/tasks/{{taskId}}',
        taskIdPath: 'output.task_id',
        statusPath: 'output.task_status',
        successValues: ['SUCCEEDED'],
        failValues: ['FAILED', 'CANCELED', 'UNKNOWN'],
        resultPath: 'output.video_url'
      }
    }
  },
  {
    id: 'dashscope-image',
    label: '通义图像',
    status: 'requires-adapter',
    modes: [
      { id: 't2i' },
      { id: 'i2i' }
    ],
    features: ['sequential'],
    params: [
      {
        key: 'size',
        label: '尺寸',
        type: 'select',
        options: [
          { value: '1024x1024', label: '1:1' },
          { value: '1280x720', label: '16:9' },
          { value: '720x1280', label: '9:16' }
        ],
        defaultValue: '1024x1024'
      },
      {
        key: 'n',
        label: '数量',
        type: 'number',
        defaultValue: 1,
        min: 1,
        max: 4
      },
      {
        key: 'prompt_extend',
        label: '提示词扩写',
        type: 'boolean',
        defaultValue: true
      },
      {
        key: 'watermark',
        label: '水印',
        type: 'boolean',
        defaultValue: false
      }
    ]
  },
  {
    id: 'runway-video',
    label: 'Runway Gen-4.5',
    adapter: 'http-template',
    status: 'draft',
    modes: [{ id: 't2v' }, { id: 'first-frame' }],
    params: [
      VIDEO_DURATION(5, 10, 10),
      VIDEO_RATIO('16:9'),
      {
        key: 'resolution',
        label: '分辨率',
        type: 'select',
        options: [
          { value: '720p', label: '720P' },
          { value: '1080p', label: '1080P' }
        ],
        defaultValue: '1080p'
      }
    ],
    template: {
      auth: {
        header: 'Authorization',
        prefix: 'Bearer ',
        headers: { 'X-Runway-Version': '2024-11-06' }
      },
      submit: {
        path: {
          text: '/v1/text_to_video',
          image: '/v1/image_to_video'
        },
        body: {
          model: '{{model}}',
          promptText: '{{prompt}}',
          promptImage: '{{refs.firstFrame}}',
          duration: '{{params.duration}}'
        },
        omitEmpty: true
      },
      poll: {
        path: '/v1/tasks/{{taskId}}',
        taskIdPath: 'id',
        statusPath: 'status',
        successValues: ['SUCCEEDED'],
        failValues: ['FAILED', 'CANCELLED'],
        resultPath: 'output[0]'
      }
    }
  },
  {
    id: 'luma-video',
    label: 'Luma Ray 3.2',
    adapter: 'http-template',
    status: 'draft',
    modes: [{ id: 't2v' }, { id: 'first-frame' }],
    features: ['audio'],
    params: [
      VIDEO_DURATION(5, 10, 5),
      VIDEO_RATIO('16:9'),
      {
        key: 'resolution',
        label: '分辨率',
        type: 'select',
        options: [
          { value: '540p', label: '540P' },
          { value: '720p', label: '720P' },
          { value: '1080p', label: '1080P' }
        ],
        defaultValue: '1080p'
      }
    ],
    template: {
      auth: { header: 'Authorization', prefix: 'Bearer ' },
      submit: {
        path: '/dream-machine/v1/generations',
        body: {
          prompt: '{{prompt}}',
          model: '{{model}}',
          duration: '{{params.duration}}',
          resolution: '{{params.resolution}}',
          keyframes: {
            frame0: { type: 'image', url: '{{refs.firstFrame}}' }
          }
        },
        omitEmpty: true
      },
      poll: {
        path: '/dream-machine/v1/generations/{{taskId}}',
        taskIdPath: 'id',
        statusPath: 'state',
        successValues: ['completed'],
        failValues: ['failed'],
        resultPath: 'assets.video'
      }
    }
  },
  {
    id: 'bfl-image',
    label: 'FLUX.2',
    adapter: 'http-template',
    status: 'draft',
    modes: [
      { id: 't2i' },
      { id: 'i2i' }
    ],
    params: [
      {
        key: 'width',
        label: '宽度',
        type: 'number',
        defaultValue: 1024,
        min: 256,
        max: 2048
      },
      {
        key: 'height',
        label: '高度',
        type: 'number',
        defaultValue: 1024,
        min: 256,
        max: 2048
      },
      {
        key: 'steps',
        label: '步数',
        type: 'number',
        defaultValue: 28,
        min: 1,
        max: 50
      },
      {
        key: 'guidance',
        label: '提示词强度',
        type: 'number',
        defaultValue: 3,
        min: 1,
        max: 10
      },
      {
        key: 'seed',
        label: '随机种子',
        type: 'number',
        defaultValue: 0,
        min: 0,
        max: 2147483647
      }
    ],
    template: {
      auth: { header: 'x-key', prefix: '' },
      submit: {
        path: '/v1/flux-2-pro',
        body: {
          prompt: '{{prompt}}',
          input_image: '{{refs.image}}',
          width: '{{params.width}}',
          height: '{{params.height}}'
        },
        omitEmpty: true
      },
      poll: {
        path: '/v1/get_result?id={{taskId}}',
        taskIdPath: 'id',
        statusPath: 'status',
        successValues: ['Ready'],
        failValues: [
          'Error',
          'Failed',
          'Request Moderated',
          'Content Moderated'
        ],
        resultPath: 'result.sample',
        download: true
      }
    }
  },
  {
    id: 'ideogram-image',
    label: 'Ideogram 4.5',
    adapter: 'http-template',
    status: 'draft',
    modes: [
      { id: 't2i' },
      { id: 'i2i' }
    ],
    params: [
      {
        key: 'aspect_ratio',
        label: '比例',
        type: 'select',
        options: [
          { value: '1:1', label: '1:1' },
          { value: '16:9', label: '16:9' },
          { value: '9:16', label: '9:16' },
          { value: '4:3', label: '4:3' },
          { value: '3:4', label: '3:4' },
          { value: '3:2', label: '3:2' },
          { value: '2:3', label: '2:3' }
        ],
        defaultValue: '1:1'
      },
      {
        key: 'rendering_speed',
        label: '速度',
        type: 'select',
        options: [
          { value: 'TURBO', label: '极速' },
          { value: 'DEFAULT', label: '标准' },
          { value: 'QUALITY', label: '高质量' }
        ],
        defaultValue: 'DEFAULT'
      },
      {
        key: 'style_type',
        label: '风格',
        type: 'select',
        options: [
          { value: 'AUTO', label: '自动' },
          { value: 'REALISTIC', label: '写实' },
          { value: 'DESIGN', label: '设计' }
        ],
        defaultValue: 'AUTO'
      },
      {
        key: 'n',
        label: '数量',
        type: 'number',
        defaultValue: 1,
        min: 1,
        max: 4
      }
    ],
    template: {
      sync: true,
      auth: { header: 'Api-Key', prefix: '' },
      submit: {
        path: '/v1/ideogram-v3/generate',
        body: {
          prompt: '{{prompt}}',
          aspect_ratio: '{{params.aspect_ratio}}',
          rendering_speed: '{{params.rendering_speed}}',
          style_type: '{{params.style_type}}'
        },
        omitEmpty: true
      },
      poll: {
        path: '',
        taskIdPath: 'id',
        resultPath: 'data[0].url',
        download: true
      }
    }
  },
  {
    id: 'recraft-image',
    label: 'Recraft V4.1',
    adapter: 'http-template',
    status: 'draft',
    modes: [{ id: 't2i' }, { id: 'i2i' }],
    params: [
      {
        key: 'size',
        label: '尺寸',
        type: 'select',
        options: [
          { value: '1024x1024', label: '1:1' },
          { value: '1365x1024', label: '4:3' },
          { value: '1024x1365', label: '3:4' }
        ],
        defaultValue: '1024x1024'
      },
      {
        key: 'style',
        label: '风格',
        type: 'select',
        options: [
          { value: 'any', label: '自动' },
          { value: 'realistic_image', label: '写实' },
          { value: 'digital_illustration', label: '插画' }
        ],
        defaultValue: 'any'
      },
      {
        key: 'n',
        label: '数量',
        type: 'number',
        defaultValue: 1,
        min: 1,
        max: 4
      }
    ],
    template: {
      sync: true,
      auth: { header: 'Authorization', prefix: 'Bearer ' },
      submit: {
        path: '/v1/images/generations',
        body: {
          prompt: '{{prompt}}',
          size: '{{params.size}}',
          style: '{{params.style}}',
          n: '{{params.n}}'
        },
        omitEmpty: true
      },
      poll: {
        path: '',
        taskIdPath: 'id',
        resultPath: 'data[0].url',
        download: true
      }
    }
  },
  {
    id: 'zhipu-video',
    label: '智谱 CogVideoX',
    adapter: 'http-template',
    status: 'draft',
    modes: [{ id: 't2v' }, { id: 'first-frame' }, { id: 'first-last' }],
    params: [
      VIDEO_DURATION(5, 10, 5),
      {
        key: 'size',
        label: '尺寸',
        type: 'select',
        options: [
          { value: '1920x1080', label: '16:9' },
          { value: '1080x1920', label: '9:16' },
          { value: '1024x1024', label: '1:1' }
        ],
        defaultValue: '1920x1080'
      },
      {
        key: 'fps',
        label: '帧率',
        type: 'select',
        options: [
          { value: '30', label: '30 fps' },
          { value: '60', label: '60 fps' }
        ],
        defaultValue: '30'
      }
    ],
    template: {
      auth: { header: 'Authorization', prefix: 'Bearer ' },
      submit: {
        path: '/api/paas/v4/videos/generations',
        body: {
          model: '{{model}}',
          prompt: '{{prompt}}',
          image_url: '{{refs.firstFrame}}',
          duration: '{{params.duration}}',
          size: '{{params.size}}',
          fps: '{{params.fps}}'
        },
        omitEmpty: true
      },
      poll: {
        path: '/api/paas/v4/async-result/{{taskId}}',
        taskIdPath: 'id',
        statusPath: 'task_status',
        successValues: ['SUCCESS'],
        failValues: ['FAIL'],
        resultPath: 'video_result[0].url'
      }
    }
  },
  {
    id: 'zhipu-image',
    label: '智谱图像',
    adapter: 'http-template',
    status: 'draft',
    modes: [{ id: 't2i' }],
    params: [
      {
        key: 'size',
        label: '尺寸',
        type: 'select',
        options: [
          { value: '1024x1024', label: '1:1' },
          { value: '1344x768', label: '16:9' },
          { value: '768x1344', label: '9:16' }
        ],
        defaultValue: '1024x1024'
      },
      {
        key: 'quality',
        label: '质量',
        type: 'select',
        options: [
          { value: 'standard', label: '标准' },
          { value: 'hd', label: '高清' }
        ],
        defaultValue: 'standard'
      }
    ],
    template: {
      sync: true,
      auth: { header: 'Authorization', prefix: 'Bearer ' },
      submit: {
        path: '/api/paas/v4/images/generations',
        body: {
          model: '{{model}}',
          prompt: '{{prompt}}',
          size: '{{params.size}}'
        },
        omitEmpty: true
      },
      poll: {
        path: '',
        taskIdPath: 'id',
        resultPath: 'data[0].url',
        download: true
      }
    }
  },
  {
    id: 'hunyuan-video',
    label: '混元生视频',
    status: 'requires-adapter',
    modes: [{ id: 't2v' }, { id: 'first-frame' }],
    params: [
      VIDEO_DURATION(5, 10, 5),
      VIDEO_RATIO('16:9'),
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
      }
    ]
  },
  {
    id: 'hunyuan-image',
    label: '混元图像',
    status: 'requires-adapter',
    modes: [{ id: 't2i' }, { id: 'i2i' }],
    params: [
      {
        key: 'size',
        label: '尺寸',
        type: 'select',
        options: [
          { value: '1024x1024', label: '1:1' },
          { value: '1280x720', label: '16:9' },
          { value: '720x1280', label: '9:16' }
        ],
        defaultValue: '1024x1024'
      },
      {
        key: 'n',
        label: '数量',
        type: 'number',
        defaultValue: 1,
        min: 1,
        max: 4
      }
    ]
  },
  {
    id: 'baidu-video',
    label: '百度蒸汽机',
    adapter: 'http-template',
    status: 'draft',
    modes: [{ id: 't2v' }, { id: 'first-frame' }],
    params: [
      VIDEO_DURATION(5, 10, 5),
      VIDEO_RATIO('16:9'),
      {
        key: 'resolution',
        label: '分辨率',
        type: 'select',
        options: [
          { value: '720p', label: '720P' },
          { value: '1080p', label: '1080P' }
        ],
        defaultValue: '1080p'
      }
    ],
    template: {
      auth: { header: 'Authorization', prefix: 'Bearer ' },
      submit: {
        path: '/v2/video/generations',
        body: {
          model: '{{model}}',
          prompt: '{{prompt}}',
          image_url: '{{refs.firstFrame}}',
          duration: '{{params.duration}}',
          resolution: '{{params.resolution}}',
          ratio: '{{params.ratio}}'
        },
        omitEmpty: true
      },
      poll: {
        path: '/v2/video/generations/{{taskId}}',
        taskIdPath: 'id',
        statusPath: 'status',
        successValues: ['succeeded'],
        failValues: ['failed'],
        resultPath: 'video_url'
      }
    }
  }
]

export const MODEL_RULES: ModelRule[] = [
  {
    match: /^doubao-seedance-2-5/i,
    template: 'ark-video',
    overrides: {
      modes: [{ id: 'reference' }],
      params: {
        duration: { min: 4, max: 30, defaultValue: 5 }
      }
    }
  },
  {
    match: /^doubao-seedance-2-0/i,
    template: 'ark-video',
    overrides: {
      modes: [{ id: 'reference' }],
      params: {
        duration: { min: 4, max: 15, defaultValue: 5 }
      }
    }
  },
  {
    match: /^doubao-seedream-5-5/i,
    template: 'ark-image',
    overrides: {
      features: ['layer', 'ocr', 'rgba'],
      modes: [{ id: 'layer' }],
      params: {
        layer_max_images: { max: 100, defaultValue: 30 },
        text_recognition: { defaultValue: true }
      }
    }
  },
  {
    match: /^doubao-seedream-5-0/i,
    template: 'ark-image',
    overrides: {
      features: ['layer', 'rgba'],
      params: {
        layer_max_images: { max: 16, defaultValue: 16 },
        text_recognition: { defaultValue: false }
      }
    }
  },
  {
    match: /^minimax-h3/i,
    template: 'minimax-video'
  },
  {
    match: /^viduq4/i,
    template: 'vidu-video',
    overrides: {
      params: {
        duration: { max: 16 },
        resolution: {
          options: [
            { value: '540p', label: '540P' },
            { value: '720p', label: '720P' },
            { value: '1080p', label: '1080P' },
            { value: '2K', label: '2K' },
            { value: '4K', label: '4K' }
          ]
        }
      }
    }
  },
  {
    match: /^kling-4/i,
    template: 'kling-video',
    overrides: {
      params: {
        duration: { min: 3, max: 30, defaultValue: 5 }
      }
    }
  },
  {
    match: /veo-3\.1-fast/i,
    template: 'veo-video',
    overrides: {
      removeModes: ['reference']
    }
  },
  {
    match: /veo-3\.1/i,
    template: 'veo-video'
  },
  {
    match: /nano-banana-2/i,
    template: 'gemini-image'
  },
  {
    match: /wan-?3/i,
    template: 'wan-video'
  },
  {
    match: /qwen-image-3/i,
    template: 'dashscope-image'
  },
  {
    match: /runway-gen-4/i,
    template: 'runway-video'
  },
  {
    match: /ray-?3/i,
    template: 'luma-video'
  },
  {
    match: /flux-?2/i,
    template: 'bfl-image'
  },
  {
    match: /ideogram-4/i,
    template: 'ideogram-image'
  },
  {
    match: /recraft-v4/i,
    template: 'recraft-image'
  },
  {
    match: /cogvideox-3/i,
    template: 'zhipu-video'
  },
  {
    match: /glm-image/i,
    template: 'zhipu-image'
  },
  {
    match: /hunyuan-video/i,
    template: 'hunyuan-video'
  },
  {
    match: /hunyuan-image/i,
    template: 'hunyuan-image'
  },
  {
    match: /steam-engine|baidu/i,
    template: 'baidu-video'
  }
]

export function findProtocolTemplate(
  id: string | undefined
): ProtocolTemplate | undefined {
  if (!id) return undefined
  return PROTOCOL_TEMPLATES.find((template) => template.id === id)
}

export function matchModelRule(remoteModel: string): ModelRule | undefined {
  return MODEL_RULES.find((rule) => rule.match.test(remoteModel))
}

export function mergeModeConfigs(
  base: ModelModeConfig[],
  override: ModelModeConfig[]
): ModelModeConfig[] {
  const merged = new Map<ModelModeId, ModelModeConfig>()

  for (const mode of base) {
    merged.set(mode.id, { ...mode })
  }

  for (const mode of override) {
    const existing = merged.get(mode.id)
    merged.set(mode.id, {
      ...existing,
      ...mode,
      ...(existing?.operations || mode.operations
        ? {
            operations: {
              ...(existing?.operations ?? {}),
              ...(mode.operations ?? {})
            }
          }
        : {})
    })
  }

  return [...merged.values()]
}

export function mergeParamDefs(
  base: ParamDef[],
  override: Record<string, Partial<ParamDef>> | undefined
): ParamDef[] {
  if (!override) return base
  return base.map((param) => {
    const patch = override[param.key]
    return patch ? { ...param, ...patch } : param
  })
}

export function applyProtocolTemplate(
  template: ProtocolTemplate,
  rule?: ModelRule
): {
  modes: ModelModeConfig[]
  params: ParamDef[]
  features: ModelFeature[]
  template?: HttpTemplate
  extraBody?: Record<string, unknown>
  omitBody?: string[]
} {
  const overrides = rule?.template === template.id ? rule.overrides : undefined

  return {
    modes: mergeModeConfigs(
      template.modes.filter(
        (mode) => !overrides?.removeModes?.includes(mode.id)
      ),
      overrides?.modes ?? []
    ),
    params: mergeParamDefs(template.params, overrides?.params),
    features: [
      ...new Set([
        ...(template.features ?? []),
        ...(overrides?.features ?? [])
      ])
    ],
    ...(template.template ? { template: template.template } : {}),
    ...(template.extraBody ? { extraBody: template.extraBody } : {}),
    ...(template.omitBody ? { omitBody: template.omitBody } : {})
  }
}
