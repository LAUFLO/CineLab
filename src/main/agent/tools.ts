import type {
  AgentPermissionMode,
  AgentProfileId,
  AgentScope,
  AgentToolCall
} from '@shared/agent'
import {
  filterAgentTools,
  toModelTools,
  type AgentToolDefinition
} from '@shared/agent-tools'
import {
  STAGE_LIMITS,
  STAGE_OBJECT_TYPES
} from '@shared/stage-schema'
import { TIMELINE_TRANSITION_TYPES } from '@shared/timeline-schema'

export class AgentToolError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'AgentToolError'
    this.code = code
  }
}

/**
 * 画布工具的注册表。工具执行仍在渲染进程，
 * 主进程只负责定义、过滤、参数校验和权限校验。
 */
export const CANVAS_TOOLS: AgentToolDefinition[] = [
  {
    id: 'canvas.get',
    name: 'canvas_get',
    description:
      '读取当前画布的节点摘要、所有节点 ID/标题/类型/坐标和当前选中节点。修改节点或选择生成目标前先调用它确认节点 ID。',
    profiles: ['canvas'],
    readOnly: true,
    scope: 'canvas',
    modes: ['read-only', 'current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'canvas.updateTitle',
    name: 'canvas_update_title',
    description:
      '修改当前画布中一个选中节点的标题。nodeId 必须来自 canvas_get 返回的 selectedNodes；只允许修改选中节点。',
    profiles: ['canvas'],
    readOnly: false,
    scope: 'canvas',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: '要修改的节点 ID，必须来自 canvas_get 的 selectedNodes'
        },
        title: {
          type: 'string',
          description: '新标题，1-200 个字符'
        }
      },
      required: ['nodeId', 'title'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'canvas.moveNode',
    name: 'canvas_move_node',
    description:
      '移动当前画布中一个选中节点到指定画布坐标。只允许移动选中节点。',
    profiles: ['canvas'],
    readOnly: false,
    scope: 'canvas',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: '要移动的节点 ID，必须来自 canvas_get 的 selectedNodes'
        },
        x: { type: 'number', description: '画布 X 坐标' },
        y: { type: 'number', description: '画布 Y 坐标' }
      },
      required: ['nodeId', 'x', 'y'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'canvas.addNode',
    name: 'canvas_add_node',
    description:
      '在当前画布创建文本、图片、视频或音频节点。创建后返回 nodeId，可在同一轮继续连接或修改。传 nearNodeId 时把新节点放在该节点右侧，适合在参考素材后面创建生成节点。',
    profiles: ['canvas'],
    readOnly: false,
    scope: 'canvas',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['text', 'image', 'video', 'audio'],
          description: '节点类型'
        },
        title: {
          type: 'string',
          description: '节点标题，1-200 个字符；省略时自动命名'
        },
        x: { type: 'number', description: '画布 X 坐标；与 y 一起使用' },
        y: { type: 'number', description: '画布 Y 坐标；与 x 一起使用' },
        nearNodeId: {
          type: 'string',
          description: '可选，放在该节点右侧；提供后忽略 x/y'
        }
      },
      required: ['kind'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'canvas.connect',
    name: 'canvas_connect',
    description:
      '把两个选中或本轮新建的节点连接起来。sourceNodeId 是上游，targetNodeId 是下游。',
    profiles: ['canvas'],
    readOnly: false,
    scope: 'canvas',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        sourceNodeId: { type: 'string', description: '上游节点 ID' },
        targetNodeId: { type: 'string', description: '下游节点 ID' }
      },
      required: ['sourceNodeId', 'targetNodeId'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'canvas.deleteNode',
    name: 'canvas_delete_node',
    description:
      '删除一个选中或本轮新建的节点，以及它的所有连线。',
    profiles: ['canvas'],
    readOnly: false,
    scope: 'canvas',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: '要删除的节点 ID' }
      },
      required: ['nodeId'],
      additionalProperties: false
    },
    replay: 'unsafe',
    requiresConfirm: true
  },
  {
    id: 'canvas.group',
    name: 'canvas_group',
    description:
      '把两个或更多选中或本轮新建的顶层节点分到同一个组里。',
    profiles: ['canvas'],
    readOnly: false,
    scope: 'canvas',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeIds: {
          type: 'array',
          items: { type: 'string' },
          minItems: 2,
          maxItems: 20,
          description: '要分组的节点 ID'
        }
      },
      required: ['nodeIds'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'canvas.ungroup',
    name: 'canvas_ungroup',
    description: '解散一个分组，子节点恢复为顶层节点。',
    profiles: ['canvas'],
    readOnly: false,
    scope: 'canvas',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        groupId: { type: 'string', description: '要解散的分组节点 ID' }
      },
      required: ['groupId'],
      additionalProperties: false
    },
    replay: 'safe'
  }
]

export const GENERATION_TOOLS: AgentToolDefinition[] = [
  {
    id: 'generation.catalog',
    name: 'generation_catalog',
    description:
      '列出当前已配置、可用的生成模型，包括能力、输入和参数。生成前先用它确认 modelKey 和参数。',
    profiles: ['canvas'],
    readOnly: true,
    scope: 'generation',
    modes: ['read-only', 'current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        capability: {
          type: 'string',
          enum: ['image', 'video', 'audio', 'text'],
          description: '只看某一类生成模型；省略时返回全部'
        }
      },
      additionalProperties: false
    },
    replay: 'safe',
    executor: 'main'
  },
  {
    id: 'library.search',
    name: 'library_search',
    description:
      '搜索全局资产库中的图片、视频和音频。返回相对路径、名称和类型；把图片/视频 path 放进 generation_propose 的 libraryRefs，即可在生成时自动创建素材节点并连线。',
    profiles: ['canvas'],
    readOnly: true,
    scope: 'library',
    modes: ['read-only', 'current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '按名称或路径搜索，最多 100 字；省略时返回最近素材'
        },
        kind: {
          type: 'string',
          enum: ['image', 'video', 'audio'],
          description: '只看某一类素材'
        },
        limit: {
          type: 'number',
          description: '返回数量，默认 20，最大 30'
        }
      },
      additionalProperties: false
    },
    replay: 'safe',
    executor: 'main'
  },
  {
    id: 'generation.propose',
    name: 'generation_propose',
    description:
      '登记一个生成提案，不会立即生成或扣费。用户确认提案后才会提交。目标节点必须是选中节点或本轮新建节点。可用 refNodeIds 引用画布节点，或用 libraryRefs 引用资产库素材；引用素材会自动补建素材节点并连接到目标节点，同时把提示词写回目标节点。未指定参考时自动使用直接上游节点的最新输出。',
    profiles: ['canvas'],
    readOnly: false,
    scope: 'generation',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: '目标生成节点 ID，必须来自 canvas_get 的 selectedNodes'
        },
        modelKey: {
          type: 'string',
          description: '模型标识，格式 providerId/modelId，必须来自 generation_catalog'
        },
        prompt: {
          type: 'string',
          description: '生成提示词，最多 8000 个字符'
        },
        params: {
          type: 'object',
          description: '模型参数覆盖，键必须来自 generation_catalog'
        },
        count: {
          type: 'number',
          description: '生成数量 1-8；仅模型声明了数量参数时生效'
        },
        refNodeIds: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 4,
          description: '画布参考节点 ID，可选；引用附件时直接使用附件 nodeId'
        },
        libraryRefs: {
          type: 'array',
          maxItems: 4,
          description: '资产库参考素材，可选；路径必须来自 library_search',
          items: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: '资产库相对路径，例如 场景/街景.png'
              },
              kind: {
                type: 'string',
                enum: ['image', 'video'],
                description: '素材类型'
              },
              role: {
                type: 'string',
                enum: ['firstFrame', 'lastFrame', 'reference'],
                description: '图片角色，默认 reference'
              }
            },
            required: ['path', 'kind'],
            additionalProperties: false
          }
        },
        negativePrompt: {
          type: 'string',
          description: '负向提示词，可选'
        }
      },
      required: ['nodeId', 'modelKey', 'prompt'],
      additionalProperties: false
    },
    replay: 'safe'
  }
]

const stageNodeIdParameter = {
  type: 'string',
  description: '导演台画布节点 ID，必须来自 canvas_get 的 selectedNodes'
}

const stageVec3Parameter = {
  type: 'array',
  items: { type: 'number' },
  minItems: 3,
  maxItems: 3,
  description: '3 个有限数字：[x, y, z]'
}

export const STAGE_TOOLS: AgentToolDefinition[] = [
  {
    id: 'stage.get',
    name: 'stage_get',
    description:
      '读取导演台场景的对象、机位、镜头和当前激活机位。所有 stage 工具都需要先确认 nodeId。',
    profiles: ['canvas', 'stage'],
    readOnly: true,
    scope: 'stage',
    modes: ['read-only', 'current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: stageNodeIdParameter
      },
      required: ['nodeId'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'stage.capabilities',
    name: 'stage_capabilities',
    description:
      '返回导演台支持的对象类型、姿势预设、关键帧缓动、数量限制和预览参数。',
    profiles: ['canvas', 'stage'],
    readOnly: true,
    scope: 'stage',
    modes: ['read-only', 'current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false
    },
    replay: 'safe',
    executor: 'main'
  },
  {
    id: 'stage.addObject',
    name: 'stage_add_object',
    description:
      '向导演台场景添加人物、立方体、球体、平面或群众。坐标单位为米，y 轴向上；不传坐标时放在原点。',
    profiles: ['canvas', 'stage'],
    readOnly: false,
    scope: 'stage',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: stageNodeIdParameter,
        type: { type: 'string', enum: STAGE_OBJECT_TYPES },
        name: { type: 'string', description: '对象名称；省略时自动命名' },
        position: stageVec3Parameter,
        rotation: stageVec3Parameter,
        scale: stageVec3Parameter,
        pose: { type: 'string', description: '姿势预设名称，可选' },
        color: { type: 'string', description: '十六进制颜色，例如 #60a5fa' },
        count: {
          type: 'number',
          description: '群众数量 1-100；仅 type=crowd 时使用'
        }
      },
      required: ['nodeId', 'type'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'stage.transformObject',
    name: 'stage_transform_object',
    description:
      '修改导演台对象的位置、旋转或缩放，支持只传其中一部分。旋转使用弧度。',
    profiles: ['canvas', 'stage'],
    readOnly: false,
    scope: 'stage',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: stageNodeIdParameter,
        objectId: { type: 'string', description: '对象 ID，来自 stage_get' },
        position: stageVec3Parameter,
        rotation: stageVec3Parameter,
        scale: stageVec3Parameter
      },
      required: ['nodeId', 'objectId'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'stage.addCamera',
    name: 'stage_add_camera',
    description:
      '向导演台场景添加机位。坐标单位为米；不传时使用默认正面机位。',
    profiles: ['canvas', 'stage'],
    readOnly: false,
    scope: 'stage',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: stageNodeIdParameter,
        name: { type: 'string', description: '机位名称；省略时自动命名' },
        position: stageVec3Parameter,
        target: stageVec3Parameter,
        fov: { type: 'number', description: '视场角 10-120，默认 50' },
        aspect: { type: 'string', enum: ['16:9', '9:16', '1:1'] }
      },
      required: ['nodeId'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'stage.setActiveCamera',
    name: 'stage_set_active_camera',
    description: '切换导演台当前机位。cameraId 必须来自 stage_get。',
    profiles: ['canvas', 'stage'],
    readOnly: false,
    scope: 'stage',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: stageNodeIdParameter,
        cameraId: { type: 'string', description: '机位 ID' }
      },
      required: ['nodeId', 'cameraId'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'stage.removeObject',
    name: 'stage_remove_object',
    description: '删除导演台场景中的一个对象及其动作轨。',
    profiles: ['canvas', 'stage'],
    readOnly: false,
    scope: 'stage',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: stageNodeIdParameter,
        objectId: { type: 'string', description: '对象 ID' }
      },
      required: ['nodeId', 'objectId'],
      additionalProperties: false
    },
    replay: 'unsafe',
    requiresConfirm: true
  }
]

const timelineClipIdsParameter = {
  type: 'array',
  items: { type: 'string' },
  minItems: 1,
  maxItems: 100,
  description: '片段 ID 列表，必须来自 timeline_get'
}

export const TIMELINE_TOOLS: AgentToolDefinition[] = [
  {
    id: 'timeline.get',
    name: 'timeline_get',
    description:
      '读取当前剪辑室时间线：视频设置、轨道、片段、标记、选中片段和播放头。修改前先调用。',
    profiles: ['clip'],
    readOnly: true,
    scope: 'timeline',
    modes: ['read-only', 'current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'timeline.selectClips',
    name: 'timeline_select_clips',
    description: '设置时间线当前选中的片段；传空数组清空选择。',
    profiles: ['clip'],
    readOnly: true,
    scope: 'timeline',
    modes: ['read-only', 'current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        clipIds: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 200,
          description: '要选中的片段 ID；空数组表示清空'
        }
      },
      required: ['clipIds'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'timeline.moveClips',
    name: 'timeline_move_clips',
    description:
      '移动一个或多个片段。deltaMs 表示相对移动；startMs 表示把最靠前的片段移到该时间，其他片段保持相对间距。',
    profiles: ['clip'],
    readOnly: false,
    scope: 'timeline',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        clipIds: timelineClipIdsParameter,
        deltaMs: { type: 'number', description: '相对移动毫秒，可为负数' },
        startMs: { type: 'number', description: '目标起始时间（毫秒）' },
        mode: {
          type: 'string',
          enum: ['insert', 'overwrite'],
          description: '插入或覆盖模式，默认 insert'
        }
      },
      required: ['clipIds'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'timeline.trimClip',
    name: 'timeline_trim_clip',
    description:
      '从片段头或尾裁剪/延长指定毫秒。deltaMs 为正表示延长，为负表示缩短。',
    profiles: ['clip'],
    readOnly: false,
    scope: 'timeline',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        clipId: { type: 'string', description: '片段 ID' },
        edge: { type: 'string', enum: ['start', 'end'] },
        deltaMs: { type: 'number', description: '裁剪毫秒，可为负数' },
        ripple: { type: 'boolean', description: '是否闭合空隙，默认 false' }
      },
      required: ['clipId', 'edge', 'deltaMs'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'timeline.splitClips',
    name: 'timeline_split_clips',
    description: '在时间线的指定绝对时间切分一个或多个片段。',
    profiles: ['clip'],
    readOnly: false,
    scope: 'timeline',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        clipIds: timelineClipIdsParameter,
        atMs: { type: 'number', description: '时间线绝对时间（毫秒）' }
      },
      required: ['clipIds', 'atMs'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'timeline.removeClips',
    name: 'timeline_remove_clips',
    description: '删除一个或多个片段，可选择是否闭合空隙。',
    profiles: ['clip'],
    readOnly: false,
    scope: 'timeline',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        clipIds: timelineClipIdsParameter,
        ripple: { type: 'boolean', description: '是否闭合空隙，默认 false' }
      },
      required: ['clipIds'],
      additionalProperties: false
    },
    replay: 'unsafe',
    requiresConfirm: true
  },
  {
    id: 'timeline.updateClip',
    name: 'timeline_update_clip',
    description:
      '修改片段属性：名称、音量、静音、透明度、淡入淡出、速度。',
    profiles: ['clip'],
    readOnly: false,
    scope: 'timeline',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        clipId: { type: 'string', description: '片段 ID' },
        patch: {
          type: 'object',
          description:
            '可修改 name / volume(0-4) / muted / opacity(0-1) / fadeInMs / fadeOutMs / speed(0.1-10)'
        }
      },
      required: ['clipId', 'patch'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'timeline.setTrack',
    name: 'timeline_set_track',
    description: '设置轨道可见、静音或锁定状态。',
    profiles: ['clip'],
    readOnly: false,
    scope: 'timeline',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        trackId: { type: 'string', description: '轨道 ID' },
        flag: { type: 'string', enum: ['visible', 'muted', 'locked'] },
        value: { type: 'boolean' }
      },
      required: ['trackId', 'flag', 'value'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'timeline.addMarker',
    name: 'timeline_add_marker',
    description: '在时间线指定时间添加标记。',
    profiles: ['clip'],
    readOnly: false,
    scope: 'timeline',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        atMs: { type: 'number', description: '时间线绝对时间（毫秒）' },
        label: { type: 'string', description: '标记名称，最多 200 字' },
        color: { type: 'string', description: '标记颜色，例如 #7bd88f' }
      },
      required: ['atMs'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'timeline.autoSubtitles',
    name: 'timeline_auto_subtitles',
    description:
      '对指定片段或整条时间线做语音转写，自动生成字幕片段。省略 clipId 时优先使用当前选中片段；没有选中则转写整条时间线。需要先安装本地字幕运行时和 Whisper Base 模型。',
    profiles: ['clip'],
    readOnly: false,
    scope: 'timeline',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        clipId: {
          type: 'string',
          description: '可选，视频或音频片段 ID；省略时使用当前选中片段或整条时间线'
        }
      },
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'timeline.removeSilence',
    name: 'timeline_remove_silence',
    description:
      '检测并删除静音区间。省略 clipIds 时优先处理当前选中片段，没有选中则处理全部未锁定轨道上的视频和音频片段。会缩短成片时长，执行前需要用户确认。',
    profiles: ['clip'],
    readOnly: false,
    scope: 'timeline',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        clipIds: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 100,
          description: '可选，要检测的片段 ID 列表；省略时按选中或全部片段处理'
        },
        paddingMs: {
          type: 'number',
          description: '静音两端保留的缓冲毫秒，默认 120'
        },
        minDurationMs: {
          type: 'number',
          description: '短于该值的静音不处理，默认 400'
        },
        ripple: {
          type: 'boolean',
          description: '删除后是否闭合空隙，默认 true'
        }
      },
      additionalProperties: false
    },
    replay: 'unsafe',
    requiresConfirm: true
  },
  {
    id: 'timeline.setTransition',
    name: 'timeline_set_transition',
    description:
      '给单个视觉片段设置片头转场，或传 type=none 移除转场。音频片段不支持转场。',
    profiles: ['clip'],
    readOnly: false,
    scope: 'timeline',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        clipId: { type: 'string', description: '片段 ID' },
        type: {
          type: 'string',
          enum: ['none', ...TIMELINE_TRANSITION_TYPES],
          description: '转场类型；none 表示移除'
        },
        durationMs: {
          type: 'number',
          description: '转场时长毫秒，默认 500，范围 100-10000'
        }
      },
      required: ['clipId', 'type'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'timeline.export',
    name: 'timeline_export',
    description:
      '把当前时间线渲染导出为视频文件。任务可能耗时较长，执行前需要用户确认；导出完成后会尽量写回画布上的成片节点。',
    profiles: ['clip'],
    readOnly: false,
    scope: 'timeline',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        codec: {
          type: 'string',
          enum: ['h264', 'hevc', 'av1'],
          description: '视频编码，默认 h264'
        }
      },
      additionalProperties: false
    },
    replay: 'unsafe',
    requiresConfirm: true
  }
]

/** 真正修改时间线文档的工具；只读、选择和导出不计入回合撤销 */
const TIMELINE_WRITE_TOOL_NAMES = new Set([
  'timeline_move_clips',
  'timeline_trim_clip',
  'timeline_split_clips',
  'timeline_remove_clips',
  'timeline_update_clip',
  'timeline_set_track',
  'timeline_add_marker',
  'timeline_auto_subtitles',
  'timeline_remove_silence',
  'timeline_set_transition'
])

export function isTimelineWriteTool(name: string): boolean {
  return TIMELINE_WRITE_TOOL_NAMES.has(name)
}

export const SKILL_TOOLS: AgentToolDefinition[] = [
  {
    id: 'skill.list',
    name: 'skill_list',
    description:
      '列出当前项目可用的技能。返回技能名称、作用域和描述；需要正文时再用 skill_read。',
    profiles: ['canvas'],
    readOnly: true,
    scope: 'skill',
    modes: ['read-only', 'current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false
    },
    replay: 'safe',
    executor: 'main'
  },
  {
    id: 'skill.read',
    name: 'skill_read',
    description:
      '读取技能正文或 references 文件。先用 skill_list 确认技能名称；path 省略时读取 SKILL.md。',
    profiles: ['canvas'],
    readOnly: true,
    scope: 'skill',
    modes: ['read-only', 'current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: '技能名称，必须来自 skill_list'
        },
        path: {
          type: 'string',
          description: '技能内相对路径，默认 SKILL.md；可读 references/ 和 assets/'
        },
        offset: {
          type: 'number',
          description: '正文起始字符位置，默认 0'
        },
        limit: {
          type: 'number',
          description: '本次读取字符数，默认 8000，最大 20000'
        }
      },
      required: ['name'],
      additionalProperties: false
    },
    replay: 'safe',
    executor: 'main'
  }
]

export const AGENT_TOOLS = [
  ...CANVAS_TOOLS,
  ...GENERATION_TOOLS,
  ...STAGE_TOOLS,
  ...TIMELINE_TOOLS,
  ...SKILL_TOOLS
]

export function toolDefinitionsForModel(
  profile: AgentProfileId,
  mode: AgentPermissionMode
): ReturnType<typeof toModelTools> {
  return toModelTools(filterAgentTools(AGENT_TOOLS, profile, mode))
}

export function getTool(name: string): AgentToolDefinition | undefined {
  return AGENT_TOOLS.find((tool) => tool.name === name)
}

/** 返回需要用户确认的原因；null 表示可以直接执行 */
export function toolConfirmationReason(
  call: AgentToolCall
): string | null {
  const tool = getTool(call.name)
  if (!tool) return null

  const clipIds = Array.isArray(call.args.clipIds)
    ? call.args.clipIds
    : []

  if (call.name === 'timeline_remove_clips') {
    return `将删除 ${clipIds.length} 个时间线片段，成片时长会改变。`
  }
  if (call.name === 'timeline_remove_silence') {
    return clipIds.length > 0
      ? `将检测并删除 ${clipIds.length} 个片段所在轨道的静音，成片时长会缩短。`
      : '将检测并删除时间线中的静音区间，成片时长会缩短。'
  }
  if (call.name === 'timeline_export') {
    return '将渲染并导出成片，时间取决于时间线长度。'
  }
  if (call.name === 'canvas_delete_node') {
    return '将删除画布节点及其所有连线。'
  }
  if (call.name === 'stage_remove_object') {
    return '将删除导演台对象及其动作轨。'
  }
  if (
    clipIds.length > 10 &&
    (call.name === 'timeline_move_clips' ||
      call.name === 'timeline_split_clips')
  ) {
    return `将一次修改 ${clipIds.length} 个时间线片段。`
  }
  if (tool.requiresConfirm) {
    return '该操作会删除或覆盖已有内容。'
  }
  return null
}

function assertSelectedNode(scope: AgentScope, nodeId: string): void {
  if (!scope.selectedNodeIds.includes(nodeId)) {
    throw new AgentToolError('scope_denied', '只能修改当前选中的节点')
  }
}

function isStageVec3(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every(
      (item) => typeof item === 'number' && Number.isFinite(item)
    )
  )
}

function assertStageVec3(value: unknown, label: string): void {
  if (value !== undefined && !isStageVec3(value)) {
    throw new AgentToolError(
      'invalid_params',
      `${label} 必须是 3 个有限数字`
    )
  }
}

export function assertToolAllowed(
  call: AgentToolCall,
  scope: AgentScope,
  permissionMode: AgentPermissionMode
): void {
  const tool = getTool(call.name)
  if (!tool) {
    throw new AgentToolError('not_found', `未知工具：${call.name}`)
  }

  if (!tool.modes.includes(permissionMode)) {
    throw new AgentToolError('scope_denied', '当前权限模式不能调用该工具')
  }

  if (!tool.readOnly && permissionMode === 'read-only') {
    throw new AgentToolError('scope_denied', '当前是只读模式，不能修改画布')
  }

  if (call.name === 'canvas_update_title') {
    const nodeId = call.args.nodeId
    const title = call.args.title
    if (typeof nodeId !== 'string' || !nodeId.trim()) {
      throw new AgentToolError('invalid_params', 'nodeId 必须是非空字符串')
    }
    if (typeof title !== 'string' || !title.trim()) {
      throw new AgentToolError('invalid_params', 'title 必须是非空字符串')
    }
    if (title.length > 200) {
      throw new AgentToolError('invalid_params', 'title 不能超过 200 个字符')
    }
    assertSelectedNode(scope, nodeId)
  }

  if (call.name === 'canvas_move_node') {
    const nodeId = call.args.nodeId
    const x = call.args.x
    const y = call.args.y
    if (typeof nodeId !== 'string' || !nodeId.trim()) {
      throw new AgentToolError('invalid_params', 'nodeId 必须是非空字符串')
    }
    if (
      typeof x !== 'number' ||
      !Number.isFinite(x) ||
      typeof y !== 'number' ||
      !Number.isFinite(y)
    ) {
      throw new AgentToolError('invalid_params', 'x 和 y 必须是有限数字')
    }
    assertSelectedNode(scope, nodeId)
  }

  if (call.name === 'canvas_add_node') {
    const kind = call.args.kind
    if (
      typeof kind !== 'string' ||
      !['text', 'image', 'video', 'audio'].includes(kind)
    ) {
      throw new AgentToolError('invalid_params', '节点类型无效')
    }
    const nearNodeId = call.args.nearNodeId
    if (nearNodeId !== undefined) {
      if (typeof nearNodeId !== 'string' || !nearNodeId.trim()) {
        throw new AgentToolError('invalid_params', 'nearNodeId 必须是非空字符串')
      }
    } else {
      const x = call.args.x
      const y = call.args.y
      if (
        typeof x !== 'number' ||
        !Number.isFinite(x) ||
        typeof y !== 'number' ||
        !Number.isFinite(y)
      ) {
        throw new AgentToolError(
          'invalid_params',
          '需要 nearNodeId，或同时提供 x 和 y'
        )
      }
    }
    if (
      call.args.title !== undefined &&
      (typeof call.args.title !== 'string' || call.args.title.length > 200)
    ) {
      throw new AgentToolError('invalid_params', 'title 不能超过 200 个字符')
    }
  }

  if (call.name === 'canvas_connect') {
    const source = call.args.sourceNodeId
    const target = call.args.targetNodeId
    if (typeof source !== 'string' || !source.trim()) {
      throw new AgentToolError('invalid_params', 'sourceNodeId 必须是非空字符串')
    }
    if (typeof target !== 'string' || !target.trim()) {
      throw new AgentToolError('invalid_params', 'targetNodeId 必须是非空字符串')
    }
    if (source === target) {
      throw new AgentToolError('invalid_params', '不能把节点连接到自身')
    }
    assertSelectedNode(scope, source)
    assertSelectedNode(scope, target)
  }

  if (call.name === 'canvas_delete_node') {
    const nodeId = call.args.nodeId
    if (typeof nodeId !== 'string' || !nodeId.trim()) {
      throw new AgentToolError('invalid_params', 'nodeId 必须是非空字符串')
    }
    assertSelectedNode(scope, nodeId)
  }

  if (call.name === 'canvas_group') {
    const nodeIds = call.args.nodeIds
    if (
      !Array.isArray(nodeIds) ||
      nodeIds.length < 2 ||
      nodeIds.length > 20
    ) {
      throw new AgentToolError('invalid_params', 'nodeIds 需要 2-20 个节点')
    }
    const unique = new Set(nodeIds)
    if (unique.size !== nodeIds.length) {
      throw new AgentToolError('invalid_params', 'nodeIds 不能重复')
    }
    for (const id of nodeIds) {
      if (typeof id !== 'string' || !id.trim()) {
        throw new AgentToolError('invalid_params', 'nodeIds 必须是非空字符串')
      }
      assertSelectedNode(scope, id)
    }
  }

  if (call.name === 'canvas_ungroup') {
    const groupId = call.args.groupId
    if (typeof groupId !== 'string' || !groupId.trim()) {
      throw new AgentToolError('invalid_params', 'groupId 必须是非空字符串')
    }
    assertSelectedNode(scope, groupId)
  }

  if (call.name === 'library_search') {
    if (
      call.args.query !== undefined &&
      (typeof call.args.query !== 'string' || call.args.query.length > 100)
    ) {
      throw new AgentToolError('invalid_params', 'query 不能超过 100 个字符')
    }
    if (
      call.args.kind !== undefined &&
      !['image', 'video', 'audio'].includes(String(call.args.kind))
    ) {
      throw new AgentToolError('invalid_params', 'kind 无效')
    }
    if (call.args.limit !== undefined) {
      const limit = call.args.limit
      if (
        typeof limit !== 'number' ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 30
      ) {
        throw new AgentToolError('invalid_params', 'limit 必须是 1-30 的整数')
      }
    }
  }

  if (call.name === 'generation_propose') {
    const nodeId = call.args.nodeId
    const modelKey = call.args.modelKey
    const prompt = call.args.prompt

    if (typeof nodeId !== 'string' || !nodeId.trim()) {
      throw new AgentToolError('invalid_params', 'nodeId 必须是非空字符串')
    }
    assertSelectedNode(scope, nodeId)

    if (
      typeof modelKey !== 'string' ||
      modelKey.indexOf('/') <= 0 ||
      modelKey.length > 300
    ) {
      throw new AgentToolError('invalid_params', 'modelKey 格式无效')
    }
    if (
      typeof prompt !== 'string' ||
      !prompt.trim() ||
      prompt.length > 8000
    ) {
      throw new AgentToolError(
        'invalid_params',
        'prompt 不能为空且不能超过 8000 个字符'
      )
    }
    if (
      call.args.params !== undefined &&
      (typeof call.args.params !== 'object' ||
        call.args.params === null ||
        Array.isArray(call.args.params))
    ) {
      throw new AgentToolError('invalid_params', 'params 必须是对象')
    }

    if (call.args.count !== undefined) {
      const count = call.args.count
      if (
        typeof count !== 'number' ||
        !Number.isInteger(count) ||
        count < 1 ||
        count > 8
      ) {
        throw new AgentToolError('invalid_params', 'count 必须是 1-8 的整数')
      }
    }

    if (call.args.refNodeIds !== undefined) {
      const ids = call.args.refNodeIds
      if (!Array.isArray(ids) || ids.length > 4) {
        throw new AgentToolError('invalid_params', 'refNodeIds 最多 4 个')
      }
      const unique = new Set(ids)
      if (unique.size !== ids.length) {
        throw new AgentToolError('invalid_params', 'refNodeIds 不能重复')
      }
      for (const id of ids) {
        if (typeof id !== 'string' || !id.trim()) {
          throw new AgentToolError('invalid_params', 'refNodeIds 必须是非空字符串')
        }
      }
    }

    if (call.args.libraryRefs !== undefined) {
      const refs = call.args.libraryRefs
      if (!Array.isArray(refs) || refs.length > 4) {
        throw new AgentToolError('invalid_params', 'libraryRefs 最多 4 个')
      }
      const seen = new Set<string>()
      for (const ref of refs) {
        if (!ref || typeof ref !== 'object' || Array.isArray(ref)) {
          throw new AgentToolError('invalid_params', 'libraryRefs 格式无效')
        }
        const item = ref as Record<string, unknown>
        if (
          typeof item.path !== 'string' ||
          !item.path.trim() ||
          item.path.length > 2000
        ) {
          throw new AgentToolError('invalid_params', 'libraryRefs.path 无效')
        }
        if (
          item.path.includes('..') ||
          item.path.startsWith('/') ||
          item.path.startsWith('\\') ||
          /^[a-zA-Z]:/.test(item.path)
        ) {
          throw new AgentToolError(
            'invalid_params',
            'libraryRefs.path 必须是资产库相对路径'
          )
        }
        if (!['image', 'video'].includes(String(item.kind))) {
          throw new AgentToolError('invalid_params', 'libraryRefs.kind 无效')
        }
        if (
          item.role !== undefined &&
          !['firstFrame', 'lastFrame', 'reference'].includes(String(item.role))
        ) {
          throw new AgentToolError('invalid_params', 'libraryRefs.role 无效')
        }
        const key = `${item.kind}:${item.path}`
        if (seen.has(key)) {
          throw new AgentToolError('invalid_params', 'libraryRefs 不能重复')
        }
        seen.add(key)
      }
    }

    if (
      call.args.negativePrompt !== undefined &&
      (typeof call.args.negativePrompt !== 'string' ||
        call.args.negativePrompt.length > 4000)
    ) {
      throw new AgentToolError(
        'invalid_params',
        'negativePrompt 不能超过 4000 个字符'
      )
    }
  }

  if (call.name === 'generation_catalog') {
    if (
      call.args.capability !== undefined &&
      !['image', 'video', 'audio', 'text'].includes(
        String(call.args.capability)
      )
    ) {
      throw new AgentToolError('invalid_params', 'capability 无效')
    }
  }

  if (call.name === 'stage_capabilities') {
    return
  }

  if (call.name.startsWith('stage_')) {
    const nodeId = call.args.nodeId
    if (typeof nodeId !== 'string' || !nodeId.trim()) {
      throw new AgentToolError('invalid_params', 'nodeId 必须是非空字符串')
    }
    assertSelectedNode(scope, nodeId)

    if (call.name === 'stage_add_object') {
      if (
        typeof call.args.type !== 'string' ||
        !STAGE_OBJECT_TYPES.includes(
          call.args.type as (typeof STAGE_OBJECT_TYPES)[number]
        )
      ) {
        throw new AgentToolError('invalid_params', '对象类型无效')
      }
      if (
        call.args.name !== undefined &&
        (typeof call.args.name !== 'string' ||
          !call.args.name.trim() ||
          call.args.name.length > STAGE_LIMITS.maxNameLength)
      ) {
        throw new AgentToolError('invalid_params', 'name 无效')
      }
      assertStageVec3(call.args.position, 'position')
      assertStageVec3(call.args.rotation, 'rotation')
      assertStageVec3(call.args.scale, 'scale')
      if (
        call.args.pose !== undefined &&
        (typeof call.args.pose !== 'string' ||
          call.args.pose.length > STAGE_LIMITS.maxNameLength)
      ) {
        throw new AgentToolError('invalid_params', 'pose 无效')
      }
      if (
        call.args.color !== undefined &&
        (typeof call.args.color !== 'string' ||
          call.args.color.length > 40)
      ) {
        throw new AgentToolError('invalid_params', 'color 无效')
      }
      if (call.args.count !== undefined) {
        const count = call.args.count
        if (
          typeof count !== 'number' ||
          !Number.isInteger(count) ||
          count < 1 ||
          count > 100
        ) {
          throw new AgentToolError('invalid_params', 'count 必须是 1-100 的整数')
        }
      }
    }

    if (call.name === 'stage_transform_object') {
      if (typeof call.args.objectId !== 'string' || !call.args.objectId.trim()) {
        throw new AgentToolError('invalid_params', 'objectId 必须是非空字符串')
      }
      if (
        call.args.position === undefined &&
        call.args.rotation === undefined &&
        call.args.scale === undefined
      ) {
        throw new AgentToolError('invalid_params', '至少需要 position、rotation 或 scale')
      }
      assertStageVec3(call.args.position, 'position')
      assertStageVec3(call.args.rotation, 'rotation')
      assertStageVec3(call.args.scale, 'scale')
    }

    if (call.name === 'stage_add_camera') {
      if (
        call.args.name !== undefined &&
        (typeof call.args.name !== 'string' ||
          !call.args.name.trim() ||
          call.args.name.length > STAGE_LIMITS.maxNameLength)
      ) {
        throw new AgentToolError('invalid_params', 'name 无效')
      }
      assertStageVec3(call.args.position, 'position')
      assertStageVec3(call.args.target, 'target')
      if (call.args.fov !== undefined) {
        const fov = call.args.fov
        if (
          typeof fov !== 'number' ||
          !Number.isFinite(fov) ||
          fov < 10 ||
          fov > 120
        ) {
          throw new AgentToolError('invalid_params', 'fov 必须在 10-120 之间')
        }
      }
      if (
        call.args.aspect !== undefined &&
        !['16:9', '9:16', '1:1'].includes(String(call.args.aspect))
      ) {
        throw new AgentToolError('invalid_params', 'aspect 无效')
      }
    }

    if (call.name === 'stage_set_active_camera') {
      if (
        typeof call.args.cameraId !== 'string' ||
        !call.args.cameraId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'cameraId 必须是非空字符串')
      }
    }

    if (call.name === 'stage_remove_object') {
      if (
        typeof call.args.objectId !== 'string' ||
        !call.args.objectId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'objectId 必须是非空字符串')
      }
    }
  }

  if (call.name.startsWith('timeline_')) {
    if (!scope.timelineId) {
      throw new AgentToolError('scope_denied', '请先打开剪辑室')
    }

    const assertClipIds = (value: unknown, allowEmpty = false): void => {
      if (!Array.isArray(value)) {
        throw new AgentToolError('invalid_params', 'clipIds 必须是数组')
      }
      if (allowEmpty && value.length === 0) return
      if (
        value.length < 1 ||
        value.length > 100 ||
        value.some(
          (id) => typeof id !== 'string' || !id.trim()
        ) ||
        new Set(value).size !== value.length
      ) {
        throw new AgentToolError('invalid_params', 'clipIds 无效')
      }
    }

    if (call.name === 'timeline_select_clips') {
      assertClipIds(call.args.clipIds, true)
      if (
        Array.isArray(call.args.clipIds) &&
        call.args.clipIds.length > 200
      ) {
        throw new AgentToolError('invalid_params', '一次最多选择 200 个片段')
      }
    }

    if (call.name === 'timeline_move_clips') {
      assertClipIds(call.args.clipIds)
      if (
        call.args.deltaMs === undefined &&
        call.args.startMs === undefined
      ) {
        throw new AgentToolError(
          'invalid_params',
          '需要 deltaMs 或 startMs'
        )
      }
      if (
        call.args.deltaMs !== undefined &&
        (typeof call.args.deltaMs !== 'number' ||
          !Number.isFinite(call.args.deltaMs))
      ) {
        throw new AgentToolError('invalid_params', 'deltaMs 必须是有限数字')
      }
      if (
        call.args.startMs !== undefined &&
        (typeof call.args.startMs !== 'number' ||
          !Number.isFinite(call.args.startMs) ||
          call.args.startMs < 0)
      ) {
        throw new AgentToolError('invalid_params', 'startMs 必须是非负数字')
      }
      if (
        call.args.mode !== undefined &&
        !['insert', 'overwrite'].includes(String(call.args.mode))
      ) {
        throw new AgentToolError('invalid_params', 'mode 无效')
      }
    }

    if (call.name === 'timeline_trim_clip') {
      if (
        typeof call.args.clipId !== 'string' ||
        !call.args.clipId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'clipId 必须是非空字符串')
      }
      if (!['start', 'end'].includes(String(call.args.edge))) {
        throw new AgentToolError('invalid_params', 'edge 必须是 start 或 end')
      }
      if (
        typeof call.args.deltaMs !== 'number' ||
        !Number.isFinite(call.args.deltaMs)
      ) {
        throw new AgentToolError('invalid_params', 'deltaMs 必须是有限数字')
      }
      if (
        call.args.ripple !== undefined &&
        typeof call.args.ripple !== 'boolean'
      ) {
        throw new AgentToolError('invalid_params', 'ripple 必须是布尔值')
      }
    }

    if (call.name === 'timeline_split_clips') {
      assertClipIds(call.args.clipIds)
      if (
        typeof call.args.atMs !== 'number' ||
        !Number.isFinite(call.args.atMs) ||
        call.args.atMs < 0
      ) {
        throw new AgentToolError('invalid_params', 'atMs 必须是非负数字')
      }
    }

    if (call.name === 'timeline_remove_clips') {
      assertClipIds(call.args.clipIds)
      if (
        call.args.ripple !== undefined &&
        typeof call.args.ripple !== 'boolean'
      ) {
        throw new AgentToolError('invalid_params', 'ripple 必须是布尔值')
      }
    }

    if (call.name === 'timeline_update_clip') {
      if (
        typeof call.args.clipId !== 'string' ||
        !call.args.clipId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'clipId 必须是非空字符串')
      }
      const patch = call.args.patch
      if (
        typeof patch !== 'object' ||
        patch === null ||
        Array.isArray(patch)
      ) {
        throw new AgentToolError('invalid_params', 'patch 必须是对象')
      }

      const allowed = new Set([
        'name',
        'volume',
        'muted',
        'opacity',
        'fadeInMs',
        'fadeOutMs',
        'speed'
      ])
      const entries = Object.entries(patch)
      if (entries.length === 0) {
        throw new AgentToolError('invalid_params', 'patch 不能为空')
      }
      for (const [key, value] of entries) {
        if (!allowed.has(key)) {
          throw new AgentToolError('invalid_params', `不支持修改 ${key}`)
        }
        if (key === 'name' && (typeof value !== 'string' || value.length > 200)) {
          throw new AgentToolError('invalid_params', 'name 无效')
        }
        if (key === 'muted' && typeof value !== 'boolean') {
          throw new AgentToolError('invalid_params', 'muted 必须是布尔值')
        }
        if (
          (key === 'volume' ||
            key === 'opacity' ||
            key === 'fadeInMs' ||
            key === 'fadeOutMs' ||
            key === 'speed') &&
          (typeof value !== 'number' || !Number.isFinite(value))
        ) {
          throw new AgentToolError('invalid_params', `${key} 必须是数字`)
        }
        if (
          key === 'volume' &&
          typeof value === 'number' &&
          (value < 0 || value > 4)
        ) {
          throw new AgentToolError('invalid_params', 'volume 必须在 0-4 之间')
        }
        if (
          key === 'opacity' &&
          typeof value === 'number' &&
          (value < 0 || value > 1)
        ) {
          throw new AgentToolError('invalid_params', 'opacity 必须在 0-1 之间')
        }
        if (
          (key === 'fadeInMs' || key === 'fadeOutMs') &&
          typeof value === 'number' &&
          value < 0
        ) {
          throw new AgentToolError('invalid_params', `${key} 不能为负`)
        }
        if (
          key === 'speed' &&
          typeof value === 'number' &&
          (value < 0.1 || value > 10)
        ) {
          throw new AgentToolError('invalid_params', 'speed 必须在 0.1-10 之间')
        }
      }
    }

    if (call.name === 'timeline_set_track') {
      if (
        typeof call.args.trackId !== 'string' ||
        !call.args.trackId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'trackId 必须是非空字符串')
      }
      if (
        !['visible', 'muted', 'locked'].includes(String(call.args.flag))
      ) {
        throw new AgentToolError('invalid_params', 'track flag 无效')
      }
      if (typeof call.args.value !== 'boolean') {
        throw new AgentToolError('invalid_params', 'value 必须是布尔值')
      }
    }

    if (call.name === 'timeline_add_marker') {
      if (
        typeof call.args.atMs !== 'number' ||
        !Number.isFinite(call.args.atMs) ||
        call.args.atMs < 0
      ) {
        throw new AgentToolError('invalid_params', 'atMs 必须是非负数字')
      }
      if (
        call.args.label !== undefined &&
        (typeof call.args.label !== 'string' ||
          call.args.label.length > 200)
      ) {
        throw new AgentToolError('invalid_params', 'label 过长')
      }
      if (
        call.args.color !== undefined &&
        (typeof call.args.color !== 'string' ||
          call.args.color.length > 50)
      ) {
        throw new AgentToolError('invalid_params', 'color 无效')
      }
    }

    if (call.name === 'timeline_auto_subtitles') {
      if (
        call.args.clipId !== undefined &&
        (typeof call.args.clipId !== 'string' ||
          !call.args.clipId.trim())
      ) {
        throw new AgentToolError('invalid_params', 'clipId 必须是非空字符串')
      }
    }

    if (call.name === 'timeline_remove_silence') {
      if (call.args.clipIds !== undefined) {
        assertClipIds(call.args.clipIds)
      }
      for (const key of ['paddingMs', 'minDurationMs'] as const) {
        const value = call.args[key]
        if (
          value !== undefined &&
          (typeof value !== 'number' ||
            !Number.isFinite(value) ||
            value < 0 ||
            value > 10_000)
        ) {
          throw new AgentToolError(
            'invalid_params',
            `${key} 必须是 0-10000 的数字`
          )
        }
      }
      if (
        call.args.ripple !== undefined &&
        typeof call.args.ripple !== 'boolean'
      ) {
        throw new AgentToolError('invalid_params', 'ripple 必须是布尔值')
      }
    }

    if (call.name === 'timeline_set_transition') {
      if (
        typeof call.args.clipId !== 'string' ||
        !call.args.clipId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'clipId 必须是非空字符串')
      }
      if (
        ![...TIMELINE_TRANSITION_TYPES, 'none'].includes(
          String(call.args.type)
        )
      ) {
        throw new AgentToolError('invalid_params', '转场类型无效')
      }
      if (
        call.args.durationMs !== undefined &&
        (typeof call.args.durationMs !== 'number' ||
          !Number.isFinite(call.args.durationMs) ||
          call.args.durationMs < 100 ||
          call.args.durationMs > 10_000)
      ) {
        throw new AgentToolError(
          'invalid_params',
          'durationMs 必须在 100-10000 之间'
        )
      }
    }

    if (call.name === 'timeline_export') {
      if (
        call.args.codec !== undefined &&
        !['h264', 'hevc', 'av1'].includes(String(call.args.codec))
      ) {
        throw new AgentToolError('invalid_params', 'codec 无效')
      }
    }
  }

  if (call.name === 'skill_read') {
    if (typeof call.args.name !== 'string' || !call.args.name.trim()) {
      throw new AgentToolError('invalid_params', 'name 必须是非空字符串')
    }
    if (
      call.args.path !== undefined &&
      typeof call.args.path !== 'string'
    ) {
      throw new AgentToolError('invalid_params', 'path 必须是字符串')
    }
    for (const key of ['offset', 'limit'] as const) {
      const value = call.args[key]
      if (
        value !== undefined &&
        (typeof value !== 'number' ||
          !Number.isFinite(value) ||
          value < 0)
      ) {
        throw new AgentToolError(
          'invalid_params',
          `${key} 必须是非负有限数字`
        )
      }
    }
  }
}
