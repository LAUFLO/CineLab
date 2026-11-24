import type {
  AgentToolCallRequest,
  AgentToolResultInput
} from '@shared/agent'
import { executeCanvasTool } from './canvasBridge'
import { executeFilmTool } from './filmBridge'
import { executeProjectTool } from './projectBridge'
import { executeStageTool } from './stageBridge'
import { executeTimelineTool } from './timelineBridge'

/**
 * 统一工具入口。
 * 按工具名前缀分发到画布、项目、时间线、导演台、拉片 bridge。
 */
export async function executeAgentTool(
  call: AgentToolCallRequest
): Promise<{
  ok: boolean
  result?: unknown
  error?: string
  change?: import('@shared/agent').AgentTurnChange
}> {
  if (call.name.startsWith('project_')) {
    return executeProjectTool(call)
  }
  if (call.name.startsWith('stage_')) {
    return executeStageTool(call)
  }
  if (call.name.startsWith('timeline_')) {
    return executeTimelineTool(call)
  }
  if (call.name.startsWith('film_')) {
    return executeFilmTool(call)
  }
  return executeCanvasTool(call)
}

export function initAgentBridge(): () => void {
  return window.api.agent.onToolCall((call) => {
    void executeAgentTool(call)
      .then((result) => {
        const payload: AgentToolResultInput = {
          turnId: call.turnId,
          callId: call.callId,
          ok: result.ok,
          ...(result.result !== undefined ? { result: result.result } : {}),
          ...(result.error ? { error: result.error } : {}),
          ...(result.change ? { change: result.change } : {})
        }
        return window.api.agent.toolResult(payload)
      })
      .catch((error) => {
        void window.api.agent.toolResult({
          turnId: call.turnId,
          callId: call.callId,
          ok: false,
          error: error instanceof Error ? error.message : '工具执行失败'
        })
      })
  })
}
