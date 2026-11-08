import type {
  AgentToolCallRequest,
  AgentToolResultInput,
  AgentTurnChange
} from '@shared/agent'
import { useCanvasStore } from '../stores/canvas'

function selectedNodeSummary(): Array<{
  id: string
  title: string
  kind: string
}> {
  const { nodes } = useCanvasStore.getState()
  return nodes
    .filter((node) => node.selected && node.type === 'cine')
    .map((node) => ({
      id: node.id,
      title: String((node.data as { title?: unknown }).title ?? ''),
      kind: String((node.data as { kind?: unknown }).kind ?? 'unknown')
    }))
}

function nodeTitleOf(node: { data?: unknown }): string {
  return String((node.data as { title?: unknown } | undefined)?.title ?? '')
}

async function executeTool(call: AgentToolCallRequest): Promise<{
  ok: boolean
  result?: unknown
  error?: string
  change?: AgentTurnChange
}> {
  const state = useCanvasStore.getState()

  if (call.name === 'canvas_get') {
    return {
      ok: true,
      result: {
        nodeCount: state.nodes.length,
        edgeCount: state.edges.length,
        selectedNodes: selectedNodeSummary()
      }
    }
  }

  if (call.name === 'canvas_update_title') {
    const nodeId = String(call.args.nodeId ?? '')
    const title = String(call.args.title ?? '').trim()
    const node = state.nodes.find((item) => item.id === nodeId)

    if (!node || node.type !== 'cine') {
      return { ok: false, error: '找不到这个画布节点' }
    }
    if (!title) {
      return { ok: false, error: '标题不能为空' }
    }

    const previousTitle = nodeTitleOf(node)
    const change = state.applyCommands(
      [{ type: 'updateTitle', nodeId, title }],
      call.turnId
    )

    return {
      ok: true,
      result: {
        nodeId,
        title,
        previousTitle
      },
      change
    }
  }

  if (call.name === 'canvas_move_node') {
    const nodeId = String(call.args.nodeId ?? '')
    const x = Number(call.args.x)
    const y = Number(call.args.y)
    const node = state.nodes.find((item) => item.id === nodeId)

    if (!node || node.type !== 'cine') {
      return { ok: false, error: '找不到这个画布节点' }
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return { ok: false, error: '节点位置必须是有限数字' }
    }

    const previousPosition = { ...node.position }
    const change = state.applyCommands(
      [{ type: 'moveNode', nodeId, position: { x, y } }],
      call.turnId
    )

    return {
      ok: true,
      result: {
        nodeId,
        x,
        y,
        previousPosition
      },
      change
    }
  }

  return { ok: false, error: `未实现的工具：${call.name}` }
}

export function initAgentCanvasBridge(): () => void {
  return window.api.agent.onToolCall((call) => {
    void executeTool(call)
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
