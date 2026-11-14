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
    replay: 'safe'
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
    replay: 'unsafe'
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
    replay: 'safe'
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
    requiresConfirm: true
  }
]

