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

export const AGENT_TOOLS = [...CANVAS_TOOLS, ...SKILL_TOOLS]

export function toolDefinitionsForModel(
  profile: AgentProfileId,
  mode: AgentPermissionMode
): ReturnType<typeof toModelTools> {
  return toModelTools(filterAgentTools(AGENT_TOOLS, profile, mode))
}

export function getTool(name: string): AgentToolDefinition | undefined {
  return AGENT_TOOLS.find((tool) => tool.name === name)
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
