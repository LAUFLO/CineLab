import type { AgentToolDefinition } from '@shared/agent-tools'

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

