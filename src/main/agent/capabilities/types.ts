import type { AgentPermissionMode, AgentProfileId } from '@shared/agent'
import type { AgentToolScope } from '@shared/agent-tools'
import type { AgentToolDefinition } from '@shared/agent-tools'

export type CapabilityConfirmation = 'none' | 'always' | 'conditional'

/**
 * Agent 能力的只读投影。
 * 工具定义仍然以 AgentToolDefinition 为准，这里补上能力目录需要的稳定 ID 和确认级别。
 */
export interface AgentCapability {
  id: string
  toolName: string
  description: string
  profiles: AgentProfileId[]
  scope: AgentToolScope
  readOnly: boolean
  modes: AgentPermissionMode[]
  replay: 'safe' | 'unsafe'
  confirmation: CapabilityConfirmation
  executor: 'main' | 'renderer'
}

const CONDITIONAL_CONFIRM_TOOLS = new Set([
  'canvas_node_operation',
  'timeline_move_clips',
  'timeline_split_clips'
])

export function toAgentCapability(tool: AgentToolDefinition): AgentCapability {
  return {
    id: tool.id,
    toolName: tool.name,
    description: tool.description,
    profiles: tool.profiles,
    scope: tool.scope,
    readOnly: tool.readOnly,
    modes: tool.modes,
    replay: tool.replay,
    confirmation: tool.requiresConfirm
      ? 'always'
      : CONDITIONAL_CONFIRM_TOOLS.has(tool.name)
        ? 'conditional'
        : 'none',
    executor: tool.executor ?? 'renderer'
  }
}

export function listAgentCapabilities(
  tools: AgentToolDefinition[]
): AgentCapability[] {
  return tools.map(toAgentCapability)
}

export function capabilitiesForProfile(
  tools: AgentToolDefinition[],
  profile: AgentProfileId,
  mode: AgentPermissionMode
): AgentCapability[] {
  return listAgentCapabilities(
    tools.filter(
      (tool) => tool.profiles.includes(profile) && tool.modes.includes(mode)
    )
  )
}

export function capabilitySummary(
  tools: AgentToolDefinition[]
): Array<{
  scope: AgentToolScope
  count: number
  readOnly: number
}> {
  const scopes = new Map<
    AgentToolScope,
    { scope: AgentToolScope; count: number; readOnly: number }
  >()
  for (const tool of tools) {
    const entry =
      scopes.get(tool.scope) ?? {
        scope: tool.scope,
        count: 0,
        readOnly: 0
      }
    entry.count += 1
    if (tool.readOnly) entry.readOnly += 1
    scopes.set(tool.scope, entry)
  }
  return [...scopes.values()]
}
