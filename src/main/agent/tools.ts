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
      '读取当前画布的节点摘要和当前选中节点。修改节点前先调用它确认节点 ID。',
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
  }
]

export const AGENT_TOOLS = CANVAS_TOOLS

export function toolDefinitionsForModel(
  profile: AgentProfileId,
  mode: AgentPermissionMode
): ReturnType<typeof toModelTools> {
  return toModelTools(filterAgentTools(CANVAS_TOOLS, profile, mode))
}

export function getTool(name: string): AgentToolDefinition | undefined {
  return CANVAS_TOOLS.find((tool) => tool.name === name)
}

function assertSelectedNode(scope: AgentScope, nodeId: string): void {
  if (!scope.selectedNodeIds.includes(nodeId)) {
    throw new AgentToolError('scope_denied', '只能修改当前选中的节点')
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
}
