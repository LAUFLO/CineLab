import type {
  AgentToolCallRequest,
  AgentToolResultInput,
  AgentTurnChange
} from '@shared/agent'
import type {
  CanvasCommandEdge,
  CanvasCommandNode
} from '@shared/canvas-commands'
import { NODE_META, TITLE_HEIGHT } from '@shared/canvas-schema'
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

  if (call.name === 'canvas_add_node') {
    const kind = String(call.args.kind ?? '')
    if (!['text', 'image', 'video', 'audio'].includes(kind)) {
      return { ok: false, error: '节点类型无效' }
    }
    const meta = NODE_META[kind as 'text' | 'image' | 'video' | 'audio']
    const x = Number(call.args.x)
    const y = Number(call.args.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return { ok: false, error: '节点位置必须是有限数字' }
    }

    const count = state.nodes.filter(
      (node) =>
        node.type === 'cine' &&
        (node.data as { kind?: string }).kind === kind
    ).length
    const title =
      String(call.args.title ?? '').trim() || `${meta.label}节点 ${count + 1}`
    const nodeId = `node-${kind}-${crypto.randomUUID().slice(0, 8)}`
    const node: CanvasCommandNode = {
      id: nodeId,
      type: 'cine',
      position: { x, y },
      selected: true,
      data: {
        kind: kind as 'text' | 'image' | 'video' | 'audio',
        title,
        status: 'idle',
        templates: meta.templates,
        ...(kind === 'text' ? { text: '' } : {})
      },
      style: { width: meta.width, height: meta.height + TITLE_HEIGHT }
    }

    const change = state.applyCommands(
      [{ type: 'addNode', node }],
      call.turnId
    )
    return {
      ok: true,
      result: { nodeId, kind, title, x, y },
      change
    }
  }

  if (call.name === 'canvas_connect') {
    const sourceNodeId = String(call.args.sourceNodeId ?? '')
    const targetNodeId = String(call.args.targetNodeId ?? '')
    if (!sourceNodeId || !targetNodeId) {
      return { ok: false, error: '必须提供上游和下游节点' }
    }
    if (sourceNodeId === targetNodeId) {
      return { ok: false, error: '不能把节点连接到自身' }
    }

    const edge: CanvasCommandEdge = {
      id: `edge-${crypto.randomUUID().slice(0, 8)}`,
      source: sourceNodeId,
      target: targetNodeId,
      type: 'flow',
      data: { role: 'auto' }
    }
    const change = state.applyCommands(
      [{ type: 'connect', edge }],
      call.turnId
    )
    return {
      ok: true,
      result: { edgeId: edge.id, sourceNodeId, targetNodeId },
      change
    }
  }

  if (call.name === 'canvas_delete_node') {
    const nodeId = String(call.args.nodeId ?? '')
    if (!nodeId) {
      return { ok: false, error: '缺少 nodeId' }
    }
    const change = state.applyCommands(
      [{ type: 'removeNode', nodeId }],
      call.turnId
    )
    return {
      ok: true,
      result: {
        nodeId,
        deletedEdgeIds: change.deletedEdgeIds
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
