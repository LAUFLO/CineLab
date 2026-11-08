import type {
  AgentPermissionMode,
  AgentScope,
  AgentToolCall
} from '@shared/agent'

export interface AgentToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
  readOnly: boolean
}

export class AgentToolError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'AgentToolError'
    this.code = code
  }
}

/**
 * Spike 阶段只注册两个工具：
 * - canvas_get：读取画布摘要和选中节点
 * - canvas_update_title：修改选中节点标题
 *
 * 工具执行在渲染进程，主进程只做定义、参数校验和权限校验。
 */
export const AGENT_TOOLS: AgentToolDefinition[] = [
  {
    name: 'canvas_get',
    description:
      '读取当前画布的节点摘要和当前选中节点。修改节点前先调用它确认节点 ID。',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false
    },
    readOnly: true
  },
  {
    name: 'canvas_update_title',
    description:
      '修改当前画布中一个选中节点的标题。nodeId 必须来自 canvas_get 返回的 selectedNodes；只允许修改选中节点。',
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
    readOnly: false
  }
]

export function toolDefinitionsForModel(): Array<{
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}> {
  return AGENT_TOOLS.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  }))
}

export function getTool(name: string): AgentToolDefinition | undefined {
  return AGENT_TOOLS.find((tool) => tool.name === name)
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
    if (!scope.selectedNodeIds.includes(nodeId)) {
      throw new AgentToolError('scope_denied', '只能修改当前选中的节点')
    }
  }
}
