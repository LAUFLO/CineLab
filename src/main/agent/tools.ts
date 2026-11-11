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
  STAGE_EASINGS,
  STAGE_LIMITS,
  STAGE_OBJECT_TYPES
} from '@shared/stage-schema'
import { TIMELINE_TRANSITION_TYPES } from '@shared/timeline-schema'
import {
  nodeOperationAgentSpec,
  validateNodeOperationParams
} from '@shared/node-operation-specs'

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
    id: 'canvas.removeEdge',
    name: 'canvas_remove_edge',
    description:
      '删除画布上的一条连线。传 edgeId，或传上游 sourceNodeId 和下游 targetNodeId；两条节点之间同一对端点的连线会被断开。只允许操作与选中节点或本轮新建节点相关的连线。',
    profiles: ['canvas'],
    readOnly: false,
    scope: 'canvas',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        edgeId: {
          type: 'string',
          description: '连线 ID，必须来自 canvas_get 的 edges'
        },
        sourceNodeId: {
          type: 'string',
          description: '上游节点 ID；与 targetNodeId 一起使用'
        },
        targetNodeId: {
          type: 'string',
          description: '下游节点 ID；与 sourceNodeId 一起使用'
        }
      },
      additionalProperties: false
    },
    replay: 'unsafe',
    requiresConfirm: true
  },
  {
    id: 'canvas.updateText',
    name: 'canvas_update_text',
    description:
      '覆盖一个选中文本节点的正文，支持 Markdown。传空字符串可清空正文。只允许修改当前选中的文本节点。',
    profiles: ['canvas'],
    readOnly: false,
    scope: 'canvas',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: '要修改的文本节点 ID，必须来自 canvas_get 的 selectedNodes'
        },
        text: {
          type: 'string',
          description: '新的正文，最多 100000 个字符；支持 Markdown'
        }
      },
      required: ['nodeId', 'text'],
      additionalProperties: false
    },
    replay: 'unsafe',
    requiresConfirm: true
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
  },
  {
    id: 'canvas.nodeOperations',
    name: 'canvas_node_operations',
    description:
      '读取一个选中节点当前可用的操作，包括操作 ID、菜单项、是否需要确认、参数定义和 Agent 是否可直接执行。执行节点操作前先调用它。',
    profiles: ['canvas'],
    readOnly: true,
    scope: 'canvas',
    modes: ['read-only', 'current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: '要检查的节点 ID' }
      },
      required: ['nodeId'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'canvas.nodeOperation',
    name: 'canvas_node_operation',
    description:
      '在一个选中节点上执行工具栏操作，例如宫格切分、裁剪、抽帧、片段截取、分离音视频、去字幕、图层分离、抠图、主体消除、扩图、白模预演等。operationId 和 itemId 必须来自 canvas_node_operations；需要模型的操作请改用 generation_propose。',
    profiles: ['canvas'],
    readOnly: false,
    scope: 'canvas',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: '要操作的节点 ID' },
        operationId: {
          type: 'string',
          description: '操作 ID，必须来自 canvas_node_operations'
        },
        itemId: {
          type: 'string',
          description: '菜单项 ID，必须来自该操作的 menu'
        },
        params: {
          type: 'object',
          description:
            '操作参数；矩形使用 { x, y, width, height }，时间单位为秒'
        }
      },
      required: ['nodeId', 'operationId'],
      additionalProperties: false
    },
    replay: 'unsafe'
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
    id: 'stage.transformCamera',
    name: 'stage_transform_camera',
    description:
      '调整一个已有机位的位置、朝向目标、视场角、画幅或名称，支持只传其中一部分。cameraId 必须来自 stage_get。',
    profiles: ['canvas', 'stage'],
    readOnly: false,
    scope: 'stage',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: stageNodeIdParameter,
        cameraId: { type: 'string', description: '机位 ID，来自 stage_get' },
        name: { type: 'string', description: '机位名称；省略时不修改' },
        position: stageVec3Parameter,
        target: stageVec3Parameter,
        fov: { type: 'number', description: '视场角 10-120；省略时不修改' },
        aspect: { type: 'string', enum: ['16:9', '9:16', '1:1'] }
      },
      required: ['nodeId', 'cameraId'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'stage.addShot',
    name: 'stage_add_shot',
    description:
      '向导演台场景添加一个镜头，绑定已有机位并设置时长和画幅。',
    profiles: ['canvas', 'stage'],
    readOnly: false,
    scope: 'stage',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: stageNodeIdParameter,
        cameraId: { type: 'string', description: '机位 ID，来自 stage_get' },
        name: { type: 'string', description: '镜头名称；省略时自动命名' },
        durationMs: {
          type: 'number',
          description: '镜头时长毫秒，100-600000'
        },
        aspect: { type: 'string', enum: ['16:9', '9:16', '1:1'] }
      },
      required: ['nodeId', 'cameraId', 'durationMs', 'aspect'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'stage.updateShot',
    name: 'stage_update_shot',
    description:
      '修改导演台镜头的名称、机位、时长或画幅，支持只传其中一部分。',
    profiles: ['canvas', 'stage'],
    readOnly: false,
    scope: 'stage',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: stageNodeIdParameter,
        shotId: { type: 'string', description: '镜头 ID，来自 stage_get' },
        name: { type: 'string', description: '镜头名称' },
        cameraId: { type: 'string', description: '新的机位 ID' },
        durationMs: { type: 'number', description: '镜头时长毫秒' },
        aspect: { type: 'string', enum: ['16:9', '9:16', '1:1'] }
      },
      required: ['nodeId', 'shotId'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'stage.removeShot',
    name: 'stage_remove_shot',
    description: '删除导演台的一个镜头及其运镜和动作轨。',
    profiles: ['canvas', 'stage'],
    readOnly: false,
    scope: 'stage',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: stageNodeIdParameter,
        shotId: { type: 'string', description: '镜头 ID' }
      },
      required: ['nodeId', 'shotId'],
      additionalProperties: false
    },
    replay: 'unsafe',
    requiresConfirm: true
  },
  {
    id: 'stage.setCameraTrack',
    name: 'stage_set_camera_track',
    description:
      '整体替换一个镜头的机位关键帧轨道，用于运镜。关键帧时间单位为毫秒。',
    profiles: ['canvas', 'stage'],
    readOnly: false,
    scope: 'stage',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: stageNodeIdParameter,
        shotId: { type: 'string', description: '镜头 ID' },
        keyframes: {
          type: 'array',
          minItems: 1,
          maxItems: 60,
          description: '机位关键帧',
          items: {
            type: 'object',
            properties: {
              timeMs: { type: 'number', description: '相对镜头起点的毫秒' },
              position: stageVec3Parameter,
              target: stageVec3Parameter,
              fov: { type: 'number', description: '视场角 10-120' },
              easing: {
                type: 'string',
                enum: ['linear', 'ease-in', 'ease-out', 'ease-in-out']
              }
            },
            required: ['timeMs', 'position', 'target', 'fov'],
            additionalProperties: false
          }
        }
      },
      required: ['nodeId', 'shotId', 'keyframes'],
      additionalProperties: false
    },
    replay: 'unsafe',
    requiresConfirm: true
  },
  {
    id: 'stage.setBackground',
    name: 'stage_set_background',
    description:
      '设置导演台背景：纯色 color、全景图 panorama 或模型 model。value 为颜色值、项目相对路径或模型标识。',
    profiles: ['canvas', 'stage'],
    readOnly: false,
    scope: 'stage',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: stageNodeIdParameter,
        kind: { type: 'string', enum: ['color', 'panorama', 'model'] },
        value: { type: 'string', description: '背景值，最多 2000 字符' }
      },
      required: ['nodeId', 'kind', 'value'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'stage.updateObject',
    name: 'stage_update_object',
    description:
      '修改导演台对象的姿势、颜色或可见性，支持只传其中一部分。位置/旋转/缩放请用 stage_transform_object。',
    profiles: ['canvas', 'stage'],
    readOnly: false,
    scope: 'stage',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: stageNodeIdParameter,
        objectId: { type: 'string', description: '对象 ID，来自 stage_get' },
        pose: { type: 'string', description: '姿势预设名称' },
        color: { type: 'string', description: '十六进制颜色，例如 #60a5fa' },
        visible: { type: 'boolean', description: '是否可见' }
      },
      required: ['nodeId', 'objectId'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'stage.exportPreview',
    name: 'stage_export_preview',    description:
      '把导演台的一个镜头渲染导出为白模预演视频，并自动在画布上创建一个视频节点。shotId 必须来自 stage_get；导出耗时较长，执行前需要用户确认。',
    profiles: ['canvas', 'stage'],
    readOnly: false,
    scope: 'stage',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: stageNodeIdParameter,
        shotId: { type: 'string', description: '镜头 ID，来自 stage_get 的 shots' },
        resolution: { type: 'string', enum: ['720p', '1080p'] },
        fps: { type: 'number', enum: [24, 30] }
      },
      required: ['nodeId', 'shotId'],
      additionalProperties: false
    },
    replay: 'unsafe',
    requiresConfirm: true
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
    id: 'timeline.setVideo',
    name: 'timeline_set_video',
    description:
      '设置时间线画幅、分辨率、帧率或背景。width 和 height 必须成对出现且为偶数；只传其中一项或只改 fps/background 也可以。',
    profiles: ['clip'],
    readOnly: false,
    scope: 'timeline',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        width: { type: 'number', description: '画面宽度 16-7680，偶数' },
        height: { type: 'number', description: '画面高度 16-4320，偶数' },
        fps: { type: 'number', description: '帧率 1-120' },
        background: {
          type: 'object',
          description: '时间线背景设置',
          properties: {
            type: { type: 'string', enum: ['none', 'color', 'image'] },
            color: { type: 'string', description: '背景颜色，例如 #000000' },
            path: { type: 'string', description: '背景图片的项目内相对路径' }
          },
          required: ['type'],
          additionalProperties: false
        }
      },
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
    id: 'timeline.splitByShots',
    name: 'timeline_split_by_shots',
    description:
      '分析一个选中视频片段的镜头切点，并按镜头自动切分。会改变片段结构，执行前需要用户确认。',
    profiles: ['clip'],
    readOnly: false,
    scope: 'timeline',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        clipId: { type: 'string', description: '作为镜头切分来源的视频片段 ID' },
        minShotMs: {
          type: 'number',
          description: '两个镜头之间的最短间隔，默认 500'
        },
        edgePaddingMs: {
          type: 'number',
          description: '片段首尾不切的缓冲，默认 100'
        }
      },
      required: ['clipId'],
      additionalProperties: false
    },
    replay: 'unsafe',
    requiresConfirm: true
  },
  {
    id: 'timeline.beatMarkers',
    name: 'timeline_beat_markers',
    description:
      '分析一个选中音频或视频片段的节拍，并把节拍点写成时间线标记。只新增标记，不改变片段。',
    profiles: ['clip'],
    readOnly: false,
    scope: 'timeline',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        clipId: { type: 'string', description: '作为节拍来源的音频或视频片段 ID' },
        label: { type: 'string', description: '标记名称，默认「节拍」' },
        color: { type: 'string', description: '标记颜色，例如 #7bd88f' }
      },
      required: ['clipId'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'timeline.beatSplit',
    name: 'timeline_beat_split',
    description:
      '分析一个选中音频或视频片段的节拍，并在目标轨道上按节拍点切分片段。省略 trackId 时使用主轨。执行前需要用户确认。',
    profiles: ['clip'],
    readOnly: false,
    scope: 'timeline',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        clipId: { type: 'string', description: '作为节拍来源的音频或视频片段 ID' },
        trackId: {
          type: 'string',
          description: '要切分的轨道 ID；省略时使用主轨'
        },
        minGapMs: {
          type: 'number',
          description: '两个节拍切点之间的最短间隔，默认 250'
        }
      },
      required: ['clipId'],
      additionalProperties: false
    },
    replay: 'unsafe',
    requiresConfirm: true
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

export const CAPABILITY_TOOLS: AgentToolDefinition[] = [
  {
    id: 'capability.catalog',
    name: 'capability_catalog',
    description:
      '返回当前空间和选中节点可用的能力：节点操作、时间线操作、导演台镜头和拉片信息。不确定下一步能做什么时先调用它。',
    profiles: ['canvas', 'clip', 'stage', 'film'],
    readOnly: true,
    scope: 'project',
    modes: ['read-only', 'current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        space: {
          type: 'string',
          enum: ['canvas', 'clip', 'stage', 'film'],
          description: '只看某个空间；省略时返回当前空间'
        },
        nodeId: {
          type: 'string',
          description: '可选，查询该节点可用的操作'
        }
      },
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'capability.search',
    name: 'capability_search',
    description:
      '按关键词搜索 CineBot 已注册的工具。返回工具名、说明、作用域、只读性和确认级别；不确定工具名时使用。',
    profiles: ['canvas', 'clip', 'stage', 'film'],
    readOnly: true,
    scope: 'project',
    modes: ['read-only', 'current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词，例如 裁剪、时间线、拉片、机位'
        },
        limit: { type: 'number', description: '返回数量，默认 10，最大 30' }
      },
      required: ['query'],
      additionalProperties: false
    },
    replay: 'safe',
    executor: 'main'
  }
]

/** 真正修改时间线文档的工具；只读、选择和导出不计入回合撤销 */const TIMELINE_WRITE_TOOL_NAMES = new Set([
  'timeline_set_video',
  'timeline_move_clips',
  'timeline_trim_clip',
  'timeline_split_clips',
  'timeline_split_by_shots',
  'timeline_beat_markers',
  'timeline_beat_split',
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
  ...FILM_TOOLS,
  ...CAPABILITY_TOOLS,
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
  if (call.name === 'canvas_remove_edge') {
    return '将删除画布连线，下游节点对上游的引用会被清理。'
  }
  if (call.name === 'canvas_update_text') {
    return '将覆盖文本节点的正文内容。'
  }
  if (call.name === 'canvas_node_operation') {
    const operationId = String(call.args.operationId ?? '')
    const spec = nodeOperationAgentSpec(operationId)
    if (spec?.requiresConfirm) {
      return `节点操作「${operationId}」会修改或生成素材，耗时可能较长。`
    }
    return null
  }
  if (call.name === 'stage_remove_object') {
    return '将删除导演台对象及其动作轨。'
  }
  if (call.name === 'stage_remove_shot') {
    return '将删除导演台镜头及其运镜和动作轨。'
  }
  if (call.name === 'stage_set_camera_track') {
    return '将整体替换镜头的机位关键帧轨道。'
  }
  if (call.name === 'stage_export_preview') {
    return '将渲染并导出白模预演视频，耗时取决于镜头长度。'
  }
  if (call.name === 'timeline_split_by_shots') {
    return '将按镜头分析视频并切分片段，片段结构会改变。'
  }
  if (call.name === 'timeline_beat_split') {
    return '将按节拍切分片段，片段结构会改变。'
  }
  if (call.name === 'film_study_auto') {
    return '将执行逐帧拉片并创建或替换分镜输出，耗时较长。'
  }
  if (call.name === 'film_study_extract_subtitles') {
    return '将从源视频提取字幕并覆盖当前拉片字幕，耗时较长。'
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

  if (call.name === 'canvas_update_text') {
    const nodeId = call.args.nodeId
    const text = call.args.text
    if (typeof nodeId !== 'string' || !nodeId.trim()) {
      throw new AgentToolError('invalid_params', 'nodeId 必须是非空字符串')
    }
    if (typeof text !== 'string') {
      throw new AgentToolError('invalid_params', 'text 必须是字符串')
    }
    if (text.length > 100_000) {
      throw new AgentToolError('invalid_params', 'text 不能超过 100000 个字符')
    }
    assertSelectedNode(scope, nodeId)
  }

  if (call.name === 'canvas_node_operations') {
    const nodeId = call.args.nodeId
    if (typeof nodeId !== 'string' || !nodeId.trim()) {
      throw new AgentToolError('invalid_params', 'nodeId 必须是非空字符串')
    }
    assertSelectedNode(scope, nodeId)
  }

  if (call.name === 'canvas_node_operation') {
    const nodeId = call.args.nodeId
    const operationId = call.args.operationId
    const itemId = call.args.itemId
    const params = call.args.params

    if (typeof nodeId !== 'string' || !nodeId.trim()) {
      throw new AgentToolError('invalid_params', 'nodeId 必须是非空字符串')
    }
    assertSelectedNode(scope, nodeId)

    if (typeof operationId !== 'string' || !operationId.trim()) {
      throw new AgentToolError(
        'invalid_params',
        'operationId 必须是非空字符串'
      )
    }
    const spec = nodeOperationAgentSpec(operationId)
    if (!spec) {
      throw new AgentToolError(
        'invalid_params',
        `未知节点操作：${operationId}`
      )
    }
    if (!spec.executable) {
      throw new AgentToolError(
        'unsupported',
        spec.reason ?? `${operationId} 不能由 Agent 直接执行`
      )
    }
    if (
      itemId !== undefined &&
      (typeof itemId !== 'string' || !itemId.trim())
    ) {
      throw new AgentToolError('invalid_params', 'itemId 必须是非空字符串')
    }
    let paramRecord: Record<string, unknown> = {}
    if (params !== undefined) {
      if (
        !params ||
        typeof params !== 'object' ||
        Array.isArray(params)
      ) {
        throw new AgentToolError('invalid_params', 'params 必须是对象')
      }
      paramRecord = params as Record<string, unknown>
    }
    const paramError = validateNodeOperationParams(
      operationId,
      typeof itemId === 'string' ? itemId : undefined,
      paramRecord
    )
    if (paramError) {
      throw new AgentToolError('invalid_params', paramError)
    }
  }

  if (call.name === 'capability_search') {
    if (
      typeof call.args.query !== 'string' ||
      !call.args.query.trim() ||
      call.args.query.length > 100
    ) {
      throw new AgentToolError(
        'invalid_params',
        'query 必须是非空字符串且不超过 100 字'
      )
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

  if (call.name === 'capability_catalog') {
    if (
      call.args.space !== undefined &&
      !['canvas', 'clip', 'stage', 'film'].includes(
        String(call.args.space)
      )
    ) {
      throw new AgentToolError('invalid_params', 'space 无效')
    }
    if (
      call.args.nodeId !== undefined &&
      (typeof call.args.nodeId !== 'string' ||
        !call.args.nodeId.trim())
    ) {
      throw new AgentToolError('invalid_params', 'nodeId 必须是非空字符串')
    }
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

  if (call.name === 'canvas_remove_edge') {
    const edgeId = call.args.edgeId
    const source = call.args.sourceNodeId
    const target = call.args.targetNodeId
    const hasEdgeId = edgeId !== undefined
    const hasEndpoints = source !== undefined || target !== undefined

    if (hasEdgeId) {
      if (typeof edgeId !== 'string' || !edgeId.trim()) {
        throw new AgentToolError('invalid_params', 'edgeId 必须是非空字符串')
      }
    }
    if (hasEndpoints) {
      if (typeof source !== 'string' || !source.trim()) {
        throw new AgentToolError(
          'invalid_params',
          'sourceNodeId 必须是非空字符串'
        )
      }
      if (typeof target !== 'string' || !target.trim()) {
        throw new AgentToolError(
          'invalid_params',
          'targetNodeId 必须是非空字符串'
        )
      }
      if (source === target) {
        throw new AgentToolError('invalid_params', '连线的上下游不能相同')
      }
      assertSelectedNode(scope, source)
      assertSelectedNode(scope, target)
    }
    if (!hasEdgeId && !hasEndpoints) {
      throw new AgentToolError(
        'invalid_params',
        '需要 edgeId，或同时提供 sourceNodeId 和 targetNodeId'
      )
    }
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

    if (call.name === 'stage_transform_camera') {
      if (
        typeof call.args.cameraId !== 'string' ||
        !call.args.cameraId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'cameraId 必须是非空字符串')
      }
      if (
        call.args.name === undefined &&
        call.args.position === undefined &&
        call.args.target === undefined &&
        call.args.fov === undefined &&
        call.args.aspect === undefined
      ) {
        throw new AgentToolError(
          'invalid_params',
          '至少需要 name、position、target、fov 或 aspect'
        )
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

    if (call.name === 'stage_add_shot') {
      if (
        typeof call.args.cameraId !== 'string' ||
        !call.args.cameraId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'cameraId 必须是非空字符串')
      }
      if (
        typeof call.args.durationMs !== 'number' ||
        !Number.isFinite(call.args.durationMs) ||
        call.args.durationMs < 100 ||
        call.args.durationMs > 600_000
      ) {
        throw new AgentToolError(
          'invalid_params',
          'durationMs 必须在 100-600000 之间'
        )
      }
      if (!['16:9', '9:16', '1:1'].includes(String(call.args.aspect))) {
        throw new AgentToolError('invalid_params', 'aspect 无效')
      }
      if (
        call.args.name !== undefined &&
        (typeof call.args.name !== 'string' ||
          !call.args.name.trim() ||
          call.args.name.length > STAGE_LIMITS.maxNameLength)
      ) {
        throw new AgentToolError('invalid_params', 'name 无效')
      }
    }

    if (call.name === 'stage_update_shot') {
      if (
        typeof call.args.shotId !== 'string' ||
        !call.args.shotId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'shotId 必须是非空字符串')
      }
      if (
        call.args.name === undefined &&
        call.args.cameraId === undefined &&
        call.args.durationMs === undefined &&
        call.args.aspect === undefined
      ) {
        throw new AgentToolError(
          'invalid_params',
          '至少需要 name、cameraId、durationMs 或 aspect'
        )
      }
      if (
        call.args.name !== undefined &&
        (typeof call.args.name !== 'string' ||
          call.args.name.length > STAGE_LIMITS.maxNameLength)
      ) {
        throw new AgentToolError('invalid_params', 'name 无效')
      }
      if (
        call.args.cameraId !== undefined &&
        (typeof call.args.cameraId !== 'string' ||
          !call.args.cameraId.trim())
      ) {
        throw new AgentToolError('invalid_params', 'cameraId 无效')
      }
      if (
        call.args.durationMs !== undefined &&
        (typeof call.args.durationMs !== 'number' ||
          !Number.isFinite(call.args.durationMs) ||
          call.args.durationMs < 100 ||
          call.args.durationMs > 600_000)
      ) {
        throw new AgentToolError('invalid_params', 'durationMs 无效')
      }
      if (
        call.args.aspect !== undefined &&
        !['16:9', '9:16', '1:1'].includes(String(call.args.aspect))
      ) {
        throw new AgentToolError('invalid_params', 'aspect 无效')
      }
    }

    if (call.name === 'stage_remove_shot') {
      if (
        typeof call.args.shotId !== 'string' ||
        !call.args.shotId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'shotId 必须是非空字符串')
      }
    }

    if (call.name === 'stage_set_camera_track') {
      if (
        typeof call.args.shotId !== 'string' ||
        !call.args.shotId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'shotId 必须是非空字符串')
      }
      const keyframes = call.args.keyframes
      if (
        !Array.isArray(keyframes) ||
        keyframes.length < 1 ||
        keyframes.length > 60
      ) {
        throw new AgentToolError(
          'invalid_params',
          'keyframes 需要 1-60 个关键帧'
        )
      }
      for (const frame of keyframes) {
        if (!frame || typeof frame !== 'object' || Array.isArray(frame)) {
          throw new AgentToolError('invalid_params', '关键帧格式无效')
        }
        const item = frame as Record<string, unknown>
        if (
          typeof item.timeMs !== 'number' ||
          !Number.isFinite(item.timeMs) ||
          item.timeMs < 0 ||
          item.timeMs > 600_000
        ) {
          throw new AgentToolError(
            'invalid_params',
            '关键帧 timeMs 必须在 0-600000 之间'
          )
        }
        assertStageVec3(item.position, 'position')
        assertStageVec3(item.target, 'target')
        if (
          typeof item.fov !== 'number' ||
          !Number.isFinite(item.fov) ||
          item.fov < 10 ||
          item.fov > 120
        ) {
          throw new AgentToolError(
            'invalid_params',
            '关键帧 fov 必须在 10-120 之间'
          )
        }
        if (
          item.easing !== undefined &&
          !STAGE_EASINGS.includes(
            item.easing as (typeof STAGE_EASINGS)[number]
          )
        ) {
          throw new AgentToolError('invalid_params', '关键帧 easing 无效')
        }
      }
    }

    if (call.name === 'stage_set_background') {
      if (!['color', 'panorama', 'model'].includes(String(call.args.kind))) {
        throw new AgentToolError('invalid_params', '背景 kind 无效')
      }
      if (
        typeof call.args.value !== 'string' ||
        !call.args.value.trim() ||
        call.args.value.length > 2000
      ) {
        throw new AgentToolError('invalid_params', '背景 value 无效')
      }
    }

    if (call.name === 'stage_update_object') {
      if (
        typeof call.args.objectId !== 'string' ||
        !call.args.objectId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'objectId 必须是非空字符串')
      }
      if (
        call.args.pose === undefined &&
        call.args.color === undefined &&
        call.args.visible === undefined
      ) {
        throw new AgentToolError(
          'invalid_params',
          '至少需要 pose、color 或 visible'
        )
      }
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
      if (
        call.args.visible !== undefined &&
        typeof call.args.visible !== 'boolean'
      ) {
        throw new AgentToolError('invalid_params', 'visible 必须是布尔值')
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

    if (call.name === 'stage_export_preview') {
      if (
        typeof call.args.shotId !== 'string' ||
        !call.args.shotId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'shotId 必须是非空字符串')
      }
      if (
        call.args.resolution !== undefined &&
        !['720p', '1080p'].includes(String(call.args.resolution))
      ) {
        throw new AgentToolError('invalid_params', 'resolution 无效')
      }
      if (
        call.args.fps !== undefined &&
        call.args.fps !== 24 &&
        call.args.fps !== 30
      ) {
        throw new AgentToolError('invalid_params', 'fps 只能是 24 或 30')
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

    if (call.name === 'timeline_set_video') {
      const width = call.args.width
      const height = call.args.height
      const fps = call.args.fps
      const background = call.args.background

      if (
        (width === undefined) !== (height === undefined)
      ) {
        throw new AgentToolError('invalid_params', 'width 和 height 必须同时提供')
      }
      for (const [key, value, max] of [
        ['width', width, 7680],
        ['height', height, 4320]
      ] as const) {
        if (value === undefined) continue
        if (
          typeof value !== 'number' ||
          !Number.isInteger(value) ||
          value < 16 ||
          value > max ||
          value % 2 !== 0
        ) {
          throw new AgentToolError(
            'invalid_params',
            `${key} 必须是 16-${max} 之间的偶数`
          )
        }
      }
      if (fps !== undefined) {
        if (
          typeof fps !== 'number' ||
          !Number.isFinite(fps) ||
          fps < 1 ||
          fps > 120
        ) {
          throw new AgentToolError('invalid_params', 'fps 必须在 1-120 之间')
        }
      }
      if (background !== undefined) {
        if (
          !background ||
          typeof background !== 'object' ||
          Array.isArray(background)
        ) {
          throw new AgentToolError('invalid_params', 'background 必须是对象')
        }
        const item = background as Record<string, unknown>
        if (!['none', 'color', 'image'].includes(String(item.type))) {
          throw new AgentToolError('invalid_params', 'background.type 无效')
        }
        if (
          item.color !== undefined &&
          (typeof item.color !== 'string' || item.color.length > 50)
        ) {
          throw new AgentToolError('invalid_params', 'background.color 无效')
        }
        if (
          item.path !== undefined &&
          (typeof item.path !== 'string' ||
            !item.path.trim() ||
            item.path.length > 2000 ||
            item.path.includes('..') ||
            item.path.startsWith('/') ||
            item.path.startsWith('\\') ||
            /^[a-zA-Z]:/.test(item.path))
        ) {
          throw new AgentToolError(
            'invalid_params',
            'background.path 必须是项目内相对路径'
          )
        }
        if (item.type === 'image' && typeof item.path !== 'string') {
          throw new AgentToolError(
            'invalid_params',
            'background.type=image 时必须提供 path'
          )
        }
        if (item.type === 'color' && typeof item.color !== 'string') {
          throw new AgentToolError(
            'invalid_params',
            'background.type=color 时必须提供 color'
          )
        }
      }
      if (
        width === undefined &&
        fps === undefined &&
        background === undefined
      ) {
        throw new AgentToolError(
          'invalid_params',
          '至少需要 width/height、fps 或 background'
        )
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

    if (call.name === 'timeline_split_by_shots') {
      if (
        typeof call.args.clipId !== 'string' ||
        !call.args.clipId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'clipId 必须是非空字符串')
      }
      for (const key of ['minShotMs', 'edgePaddingMs'] as const) {
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
    }

    if (call.name === 'timeline_beat_markers') {
      if (
        typeof call.args.clipId !== 'string' ||
        !call.args.clipId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'clipId 必须是非空字符串')
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

    if (call.name === 'timeline_beat_split') {
      if (
        typeof call.args.clipId !== 'string' ||
        !call.args.clipId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'clipId 必须是非空字符串')
      }
      if (
        call.args.trackId !== undefined &&
        (typeof call.args.trackId !== 'string' ||
          !call.args.trackId.trim())
      ) {
        throw new AgentToolError('invalid_params', 'trackId 必须是非空字符串')
      }
      if (
        call.args.minGapMs !== undefined &&
        (typeof call.args.minGapMs !== 'number' ||
          !Number.isFinite(call.args.minGapMs) ||
          call.args.minGapMs < 0 ||
          call.args.minGapMs > 10_000)
      ) {
        throw new AgentToolError(
          'invalid_params',
          'minGapMs 必须是 0-10000 的数字'
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
