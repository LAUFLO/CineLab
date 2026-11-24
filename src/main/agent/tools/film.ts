import type { AgentScope, AgentToolCall } from '@shared/agent'
import { AgentToolError } from './errors'
import { assertSelectedNode } from './scope'

import type { AgentToolDefinition } from '@shared/agent-tools'

export const FILM_TOOLS: AgentToolDefinition[] = [
  {
    id: 'film.studyGet',
    name: 'film_study_get',
    description:
      '读取一个拉片节点的拉片数据，包括源视频、帧数、分镜段落、AI 描述和结构/情绪摘要。nodeId 可以是拉片节点，也可以是它上游的视频节点。',
    profiles: ['canvas'],
    readOnly: true,
    scope: 'film',
    modes: ['read-only', 'current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: '拉片节点 ID，或作为拉片来源的视频节点 ID'
        },
        studyId: {
          type: 'string',
          description: '拉片数据 ID，已知时可直接读取'
        }
      },
      additionalProperties: false
    },
    replay: 'safe',
    mcp: {
      title: '读取拉片',
      category: '拉片',
    },
  },
  {
    id: 'film.studyGetShot',
    name: 'film_study_get_shot',
    description:
      '读取拉片里某一镜的完整信息：时间、景别、机位、运镜、画面、台词、制作方式与证据、提示词。',
    profiles: ['canvas'],
    readOnly: true,
    scope: 'film',
    modes: ['read-only', 'current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: '拉片节点 ID，或作为拉片来源的视频节点 ID'
        },
        studyId: {
          type: 'string',
          description: '拉片数据 ID，已知时可直接读取'
        },
        index: {
          type: 'number',
          description: '镜号，从 1 开始'
        }
      },
      required: ['index'],
      additionalProperties: false
    },
    replay: 'safe',
    mcp: {
      title: '读取镜头',
      category: '拉片',
    },
  },
  {
    id: 'film.studyUpdateShot',
    name: 'film_study_update_shot',
    description:
      '修改拉片里某一镜的字段：景别、机位、运镜、光线、画面、动作、情绪、提示词和状态。只传需要修改的字段。',
    profiles: ['canvas'],
    readOnly: false,
    scope: 'film',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: '拉片节点 ID，或作为拉片来源的视频节点 ID'
        },
        studyId: {
          type: 'string',
          description: '拉片数据 ID，已知时可直接修改'
        },
        index: { type: 'number', description: '镜号，从 1 开始' },
        patch: {
          type: 'object',
          description: '要修改的镜头字段，至少提供一个',
          properties: {
            shotSize: { type: 'string' },
            cameraAngle: { type: 'string' },
            cameraMove: { type: 'string' },
            lighting: { type: 'string' },
            visualDescription: { type: 'string' },
            actionSummary: { type: 'string' },
            emotion: { type: 'string' },
            imagePrompt: { type: 'string' },
            videoPrompt: { type: 'string' },
            status: {
              type: 'string',
              enum: ['pending', 'generated', 'edited']
            }
          },
          additionalProperties: false
        }
      },
      required: ['index', 'patch'],
      additionalProperties: false
    },
    replay: 'safe',
    mcp: {
      title: '修改镜头',
      category: '拉片',
    },
  },
  {
    id: 'film.studyRemake',
    name: 'film_study_remake',
    description:
      '按拉片镜头在画布上创建复刻生成节点：每镜建一个普通视频节点，预填提示词并连好首帧、尾帧和镜头文本。只建图，不提交生成。indices 为空时复刻全部镜头。',
    profiles: ['canvas'],
    readOnly: false,
    scope: 'film',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: '拉片节点 ID，或作为拉片来源的视频节点 ID'
        },
        studyId: {
          type: 'string',
          description: '拉片数据 ID，已知时可直接复刻'
        },
        indices: {
          type: 'array',
          description: '要复刻的镜号；省略表示全部',
          items: { type: 'number' }
        },
        choices: {
          type: 'object',
          description:
            '选角/选景映射：键为 cast:<id> 或 scene:<id>，值为 original、new 或 asset:<资产路径>',
          additionalProperties: { type: 'string' }
        }
      },
      additionalProperties: false
    },
    replay: 'unsafe',
    mcp: {
      title: '复刻镜头',
      category: '拉片',
    },
    requiresConfirm: true
  },
  {
    id: 'film.studySplitScenes',
    name: 'film_study_split_scenes',
    description:
      '用视觉模型重新分场，只改场次范围，不动镜头和其他数据。会调用一次模型，执行前需要用户确认。',
    profiles: ['canvas'],
    readOnly: false,
    scope: 'film',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: '拉片节点 ID，或作为拉片来源的视频节点 ID'
        },
        studyId: {
          type: 'string',
          description: '拉片数据 ID，已知时可直接分场'
        },
        modelKey: {
          type: 'string',
          description: '视觉文本模型，格式 providerId/modelId；省略时沿用拉片时的模型'
        }
      },
      additionalProperties: false
    },
    replay: 'safe',
    mcp: {
      title: '自动分场',
      category: '拉片',
    },
    requiresConfirm: true
  },
  {
    id: 'film.studyMapCast',
    name: 'film_study_map_cast',
    description:
      '写入选角/选景映射：原片角色或场景替换为资产路径、占位节点，或保持原片。',
    profiles: ['canvas'],
    readOnly: false,
    scope: 'film',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: '拉片节点 ID，或作为拉片来源的视频节点 ID'
        },
        studyId: {
          type: 'string',
          description: '拉片数据 ID，已知时可直接修改'
        },
        cast: {
          type: 'object',
          description: '角色映射，键为角色 id',
          additionalProperties: { type: 'object' }
        },
        scenes: {
          type: 'object',
          description: '场景映射，键为场景 id',
          additionalProperties: { type: 'object' }
        }
      },
      additionalProperties: false
    },
    replay: 'safe',
    mcp: {
      title: '选角选景',
      category: '拉片',
    },
  },
  {
    id: 'film.studyBuildTimeline',
    name: 'film_study_build_timeline',
    description:
      '把复刻生成的视频节点按镜号建一条剪辑室时间线并打开剪辑室。indices 为空时使用全部已生成镜头。执行前需要用户确认。',
    profiles: ['canvas'],
    readOnly: false,
    scope: 'film',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: '拉片节点 ID，或作为拉片来源的视频节点 ID'
        },
        studyId: {
          type: 'string',
          description: '拉片数据 ID，已知时可直接建时间线'
        },
        indices: {
          type: 'array',
          description: '要放进时间线的镜号；省略表示全部',
          items: { type: 'number' }
        }
      },
      additionalProperties: false
    },
    replay: 'unsafe',
    mcp: {
      title: '建时间线',
      category: '拉片',
    },
    requiresConfirm: true
  },
  {
    id: 'film.studyAuto',
    name: 'film_study_auto',
    description:
      '对一个选中视频节点执行逐帧拉片：自动检测镜头、抽取代表帧、生成分镜组和分镜表并连到画布；传入拉片节点时重新拉片。会创建或替换分镜输出，耗时较长，执行前需要用户确认。',
    profiles: ['canvas'],
    readOnly: false,
    scope: 'film',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: '要拉片的视频节点或拉片节点 ID'
        },
        interval: {
          type: 'number',
          description: '分镜间隔秒数；0 表示自动镜头检测，默认 0'
        },
        modelKey: {
          type: 'string',
          description: '描述画面的视觉文本模型，格式 providerId/modelId；none 表示只用基础分镜'
        },
        outputs: {
          type: 'object',
          description: '拉片输出选项；默认生成分镜组和分镜表',
          properties: {
            storyboard: { type: 'boolean' },
            sheet: { type: 'boolean' },
            motion: { type: 'boolean' },
            music: { type: 'boolean' }
          },
          additionalProperties: false
        }
      },
      required: ['nodeId'],
      additionalProperties: false
    },
    replay: 'unsafe',
    mcp: {
      title: '自动拉片',
      category: '拉片',
    },
    requiresConfirm: true
  },
  {
    id: 'film.studyExport',
    name: 'film_study_export',
    description:
      '导出拉片结果：markdown 导出拉片笔记，analysis 导出 AI 分析包，bundle 导出完整拉片包。会弹出保存对话框，用户可取消。',
    profiles: ['canvas'],
    readOnly: false,
    scope: 'film',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: '拉片节点 ID，或作为拉片来源的视频节点 ID'
        },
        studyId: {
          type: 'string',
          description: '拉片数据 ID，已知时可直接导出'
        },
        format: {
          type: 'string',
          enum: ['markdown', 'analysis', 'bundle'],
          description: '导出格式，默认 markdown'
        }
      },
      additionalProperties: false
    },
    replay: 'unsafe',
    mcp: {
      title: '导出拉片',
      category: '拉片',
    },
  },
  {
    id: 'film.studyUpdateSegment',
    name: 'film_study_update_segment',
    description:
      '修改一个拉片段落的字段：标题、时间、类型、结构角色、景别、机位、运镜、光线、画面描述、生成提示词、人声、音乐和备注。只传需要修改的字段。',
    profiles: ['canvas'],
    readOnly: false,
    scope: 'film',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: '拉片节点 ID，或作为拉片来源的视频节点 ID'
        },
        studyId: {
          type: 'string',
          description: '拉片数据 ID，已知时可直接修改'
        },
        segmentId: { type: 'string', description: '段落 ID，来自 film_study_get' },
        patch: {
          type: 'object',
          description: '要修改的段落字段，至少提供一个',
          properties: {
            title: { type: 'string' },
            type: { type: 'string' },
            startTime: { type: 'number' },
            endTime: { type: 'number' },
            segmentFunction: { type: 'string' },
            keyBeats: { type: 'string' },
            creativeIntent: { type: 'string' },
            techniques: { type: 'string' },
            audienceExperience: { type: 'string' },
            notes: { type: 'string' },
            primaryLine: { type: 'string' },
            structureRole: { type: 'string' },
            shotSize: { type: 'string' },
            cameraAngle: { type: 'string' },
            cameraMove: { type: 'string' },
            lighting: { type: 'string' },
            visualDescription: { type: 'string' },
            imagePrompt: { type: 'string' },
            voiceOver: { type: 'string' },
            musicCue: { type: 'string' }
          },
          additionalProperties: false
        }
      },
      required: ['segmentId', 'patch'],
      additionalProperties: false
    },
    replay: 'safe',
    mcp: {
      title: '修改段落',
      category: '拉片',
    },
  },
  {
    id: 'film.studyExtractSubtitles',
    name: 'film_study_extract_subtitles',
    description:
      '从拉片源视频中提取内嵌字幕并写入拉片数据。需要本地字幕运行时；执行前需要用户确认。',
    profiles: ['canvas'],
    readOnly: false,
    scope: 'film',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: '拉片节点 ID，或作为拉片来源的视频节点 ID'
        },
        studyId: {
          type: 'string',
          description: '拉片数据 ID，已知时可直接提取'
        }
      },
      additionalProperties: false
    },
    replay: 'unsafe',
    mcp: {
      title: '提取字幕',
      category: '拉片',
    },
    requiresConfirm: true
  }
]

export function validateFilmToolArgs(
  call: AgentToolCall,
  scope: AgentScope
): void {
  if (call.name.startsWith('film_')) {
    const nodeId = call.args.nodeId
    const studyId = call.args.studyId

    if (nodeId !== undefined) {
      if (typeof nodeId !== 'string' || !nodeId.trim()) {
        throw new AgentToolError('invalid_params', 'nodeId 必须是非空字符串')
      }
    }
    if (studyId !== undefined) {
      if (typeof studyId !== 'string' || !studyId.trim()) {
        throw new AgentToolError('invalid_params', 'studyId 必须是非空字符串')
      }
    }

    if (
      call.name === 'film_study_get' ||
      call.name === 'film_study_get_shot' ||
      call.name === 'film_study_update_shot' ||
      call.name === 'film_study_remake' ||
      call.name === 'film_study_split_scenes' ||
      call.name === 'film_study_map_cast' ||
      call.name === 'film_study_build_timeline' ||
      call.name === 'film_study_export' ||
      call.name === 'film_study_update_segment' ||
      call.name === 'film_study_extract_subtitles'
    ) {
      if (!nodeId && !studyId) {
        throw new AgentToolError(
          'invalid_params',
          '需要 nodeId 或 studyId'
        )
      }
    }

    if (call.name === 'film_study_get_shot') {
      const index = call.args.index
      if (
        typeof index !== 'number' ||
        !Number.isInteger(index) ||
        index < 1
      ) {
        throw new AgentToolError('invalid_params', 'index 必须是正整数')
      }
    }

    if (call.name === 'film_study_update_shot') {
      const index = call.args.index
      if (
        typeof index !== 'number' ||
        !Number.isInteger(index) ||
        index < 1
      ) {
        throw new AgentToolError('invalid_params', 'index 必须是正整数')
      }
      const patch = call.args.patch
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        throw new AgentToolError('invalid_params', 'patch 必须是对象')
      }
    }

    if (
      call.name === 'film_study_remake' ||
      call.name === 'film_study_build_timeline'
    ) {
      const indices = call.args.indices
      if (indices !== undefined) {
        if (
          !Array.isArray(indices) ||
          indices.some(
            (value) =>
              typeof value !== 'number' ||
              !Number.isInteger(value) ||
              value < 1
          )
        ) {
          throw new AgentToolError(
            'invalid_params',
            'indices 必须是正整数数组'
          )
        }
      }
    }

    if (call.name === 'film_study_remake') {
      const choices = call.args.choices
      if (
        choices !== undefined &&
        (!choices || typeof choices !== 'object' || Array.isArray(choices))
      ) {
        throw new AgentToolError('invalid_params', 'choices 必须是对象')
      }
    }

    if (
      call.name === 'film_study_split_scenes' &&
      call.args.modelKey !== undefined &&
      typeof call.args.modelKey !== 'string'
    ) {
      throw new AgentToolError('invalid_params', 'modelKey 必须是字符串')
    }

    if (call.name === 'film_study_map_cast') {
      for (const key of ['cast', 'scenes'] as const) {
        const value = call.args[key]
        if (
          value !== undefined &&
          (!value || typeof value !== 'object' || Array.isArray(value))
        ) {
          throw new AgentToolError('invalid_params', `${key} 必须是对象`)
        }
      }
    }

    if (call.name === 'film_study_auto') {
      if (typeof nodeId !== 'string' || !nodeId.trim()) {
        throw new AgentToolError('invalid_params', 'nodeId 必须是非空字符串')
      }
      assertSelectedNode(scope, nodeId)
      if (call.args.interval !== undefined) {
        const interval = call.args.interval
        if (
          typeof interval !== 'number' ||
          !Number.isFinite(interval) ||
          interval < 0 ||
          interval > 300
        ) {
          throw new AgentToolError(
            'invalid_params',
            'interval 必须是 0-300 的秒数'
          )
        }
      }
      if (
        call.args.modelKey !== undefined &&
        (typeof call.args.modelKey !== 'string' ||
          call.args.modelKey.length > 300)
      ) {
        throw new AgentToolError('invalid_params', 'modelKey 无效')
      }
      if (call.args.outputs !== undefined) {
        const outputs = call.args.outputs
        if (
          !outputs ||
          typeof outputs !== 'object' ||
          Array.isArray(outputs)
        ) {
          throw new AgentToolError('invalid_params', 'outputs 必须是对象')
        }
        for (const [key, value] of Object.entries(outputs)) {
          if (!['storyboard', 'sheet', 'motion', 'music'].includes(key)) {
            throw new AgentToolError(
              'invalid_params',
              `不支持的拉片输出 ${key}`
            )
          }
          if (typeof value !== 'boolean') {
            throw new AgentToolError(
              'invalid_params',
              `outputs.${key} 必须是布尔值`
            )
          }
        }
      }
    }

    if (call.name === 'film_study_update_segment') {
      const segmentId = call.args.segmentId
      if (typeof segmentId !== 'string' || !segmentId.trim()) {
        throw new AgentToolError('invalid_params', 'segmentId 必须是非空字符串')
      }
      const patch = call.args.patch
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        throw new AgentToolError('invalid_params', 'patch 必须是对象')
      }
      const allowed = new Set([
        'title',
        'type',
        'startTime',
        'endTime',
        'segmentFunction',
        'keyBeats',
        'creativeIntent',
        'techniques',
        'audienceExperience',
        'notes',
        'primaryLine',
        'structureRole',
        'shotSize',
        'cameraAngle',
        'cameraMove',
        'lighting',
        'visualDescription',
        'imagePrompt',
        'voiceOver',
        'musicCue'
      ])
      const entries = Object.entries(patch as Record<string, unknown>)
      if (entries.length === 0) {
        throw new AgentToolError('invalid_params', 'patch 不能为空')
      }
      for (const [key, value] of entries) {
        if (!allowed.has(key)) {
          throw new AgentToolError('invalid_params', `不支持修改 ${key}`)
        }
        if (key === 'startTime' || key === 'endTime') {
          if (
            typeof value !== 'number' ||
            !Number.isFinite(value) ||
            value < 0 ||
            value > 86_400
          ) {
            throw new AgentToolError(
              'invalid_params',
              `${key} 必须是 0-86400 的秒数`
            )
          }
        } else if (
          typeof value !== 'string' ||
          value.length > 8000
        ) {
          throw new AgentToolError(
            'invalid_params',
            `${key} 必须是不超过 8000 字符的字符串`
          )
        }
      }
      const start = (patch as Record<string, unknown>).startTime
      const end = (patch as Record<string, unknown>).endTime
      if (
        typeof start === 'number' &&
        typeof end === 'number' &&
        end <= start
      ) {
        throw new AgentToolError('invalid_params', 'endTime 必须大于 startTime')
      }
    }

    if (call.name === 'film_study_export') {
      if (
        call.args.format !== undefined &&
        !['markdown', 'analysis', 'bundle'].includes(
          String(call.args.format)
        )
      ) {
        throw new AgentToolError('invalid_params', 'format 无效')
      }
    }
  }
}
