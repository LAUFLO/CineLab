import type { AgentPermissionMode, AgentProfileId } from './agent'

export type AgentToolScope =
  | 'canvas'
  | 'timeline'
  | 'stage'
  | 'film'
  | 'project'
  | 'library'
  | 'generation'
  | 'skill'

export type McpToolCategory =
  | '适配器'
  | '项目'
  | '画布'
  | '生成'
  | '剪辑室'
  | '导演台'
  | '拉片'
  | '资产'
  | '提示词'
  | '风格'
  | '能力'
  | '技能'

export interface AgentToolMcpMeta {
  /** MCP 客户端与设置页展示标题，中文必填 */
  title: string
  category: McpToolCategory
  /** false = 不暴露给 MCP；缺省不暴露 */
  expose?: boolean
  /** 危险操作：删除、清空类 */
  destructive?: boolean
  /** 对外描述；缺省复用 description */
  description?: string
}

export interface AgentToolDefinition {
  /** 内部稳定 ID，例如 canvas.updateTitle */
  id: string
  /** 模型可见的工具名，OpenAI function name 只使用字母、数字和下划线 */
  name: string
  description: string
  profiles: AgentProfileId[]
  readOnly: boolean
  scope: AgentToolScope
  modes: AgentPermissionMode[]
  parameters: Record<string, unknown>
  replay: 'safe' | 'unsafe'
  requiresConfirm?: boolean
  /** 默认 renderer；技能等主进程可直接执行 */
  executor?: 'main' | 'renderer'
  /** MCP 对外元数据；缺省不暴露给 MCP */
  mcp?: AgentToolMcpMeta
}

export function filterAgentTools(
  tools: AgentToolDefinition[],
  profile: AgentProfileId,
  mode: AgentPermissionMode
): AgentToolDefinition[] {
  return tools.filter(
    (tool) => tool.profiles.includes(profile) && tool.modes.includes(mode)
  )
}

export function toModelTools(
  tools: AgentToolDefinition[]
): Array<{
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}> {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  }))
}
