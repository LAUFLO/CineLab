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
  /** 本轮是否已调用 stage_get；用于给写工具加软提示 */
  stageRead: { called: boolean }
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

const STAGE_NON_WRITE_TOOLS = new Set([
  'stage_get',
  'stage_capabilities',
  'stage_previs_plan'
])

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

      const isStageWrite =
        runtime.profileId === 'stage' &&
        definition.name.startsWith('stage_') &&
        !STAGE_NON_WRITE_TOOLS.has(definition.name)
      const needsStageReadHint = isStageWrite && !runtime.stageRead.called

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

      if (result.ok && definition.name === 'stage_get') {
        runtime.stageRead.called = true
      }

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
            text: `${
              needsStageReadHint
                ? '提示：本轮尚未调用 stage_get，用户可能已手动修改场景；建议先读取最新状态再继续（本次不阻断）。\n'
                : ''
            }${JSON.stringify(result.result ?? { ok: true })}`
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
