import { Type } from 'typebox'
import type {
  AgentPermissionMode,
  AgentProfileId,
  AgentScope,
  AgentToolCallRequest,
  AgentToolResultInput
} from '@shared/agent'
import type { ToolDefinition } from '@earendil-works/pi-coding-agent'
import {
  filterAgentTools,
  type AgentToolDefinition
} from '@shared/agent-tools'
import { AGENT_TOOLS } from '../tools'
import { executeMainTool } from '../main-tools'

export interface PiToolRuntime {
  turnId: string
  scope: AgentScope
  profileId: AgentProfileId
  permissionMode: AgentPermissionMode
  sendToolCall: (call: AgentToolCallRequest) => void
  waitForToolResult: (
    callId: string,
    signal?: AbortSignal
  ) => Promise<AgentToolResultInput>
}

function proposalIdOf(result: {
  ok: boolean
  result?: unknown
}): string | undefined {
  if (!result.ok || !result.result || typeof result.result !== 'object') {
    return undefined
  }
  const value = (result.result as { proposalId?: unknown }).proposalId
  return typeof value === 'string' && value ? value : undefined
}

function detailsOf(result: {
  ok: boolean
  change?: AgentToolResultInput['change']
  result?: unknown
}): Record<string, unknown> {
  const proposalId = proposalIdOf(result)
  return {
    ok: result.ok,
    ...(result.change ? { change: result.change } : {}),
    ...(proposalId ? { proposalId } : {})
  }
}

function toPiTool(
  definition: AgentToolDefinition,
  runtime: PiToolRuntime
): ToolDefinition {
  return {
    name: definition.name,
    label: definition.id,
    description: definition.description,
    parameters: Type.Unsafe(definition.parameters),
    // M1 先用全串行，避免单个 pendingConfirm 被并行工具覆盖；M2 再按工具细调
    executionMode: 'sequential',
    execute: async (callId, args, signal) => {
      const call = {
        callId,
        name: definition.name,
        args:
          args && typeof args === 'object' && !Array.isArray(args)
            ? (args as Record<string, unknown>)
            : {}
      }

      const result =
        definition.executor === 'main'
          ? await executeMainTool(call, runtime.scope)
          : await (async () => {
              runtime.sendToolCall({
                ...call,
                turnId: runtime.turnId,
                permissionMode: runtime.permissionMode,
                scope: runtime.scope
              })
              return runtime.waitForToolResult(callId, signal)
            })()

      if (!result.ok) {
        return {
          content: [
            {
              type: 'text',
              text: result.error ?? '工具执行失败'
            }
          ],
          details: detailsOf(result),
          isError: true
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result.result ?? { ok: true })
          }
        ],
        details: detailsOf(result)
      }
    }
  }
}

export function createPiTools(runtime: PiToolRuntime): ToolDefinition[] {
  return filterAgentTools(
    AGENT_TOOLS,
    runtime.profileId,
    runtime.permissionMode
  ).map((definition) => toPiTool(definition, runtime))
}
