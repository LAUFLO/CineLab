import type {
  AgentProposal,
  AgentToolCallRequest,
  AgentToolResultInput,
  AgentTurnChange
} from '@shared/agent'
import {
  emptyCanvasChange,
  type CanvasCommandEdge,
  type CanvasCommandNode
} from '@shared/canvas-commands'
import { NODE_META, TITLE_HEIGHT } from '@shared/canvas-schema'
import type { ReferenceInput } from '@shared/generation'
import {
  isGroupNode,
  selectedNodeOutput,
  useCanvasStore
} from '../stores/canvas'

function selectedNodeSummary(): Array<{
  id: string
  title: string
  kind: string
}> {
  const { nodes } = useCanvasStore.getState()
  return nodes
    .filter((node) => node.selected)
    .map((node) => ({
      id: node.id,
      title: String((node.data as { title?: unknown }).title ?? ''),
      kind:
        node.type === 'cine'
          ? String((node.data as { kind?: unknown }).kind ?? 'unknown')
          : node.type
    }))
}

function nodeTitleOf(node: { data?: unknown }): string {
  return String((node.data as { title?: unknown } | undefined)?.title ?? '')
}

interface CollectedRefs {
  refs: ReferenceInput[]
  video?: ReferenceInput
}

function collectRefsFromNodes(nodeIds: string[]): CollectedRefs {
  const { nodes } = useCanvasStore.getState()
  const refs: ReferenceInput[] = []
  let video: ReferenceInput | undefined
  let imageIndex = 0

  for (const nodeId of nodeIds) {
    const node = nodes.find((item) => item.id === nodeId)
    if (!node || isGroupNode(node)) continue
    const output = selectedNodeOutput(node)
    if (!output) continue

    if (output.kind === 'video') {
      if (!video) {
        video = {
          path: output.path,
          role: 'reference',
          scope: output.scope
        }
      }
      continue
    }

    if (output.kind !== 'image' || imageIndex >= 3) continue
    const role: ReferenceInput['role'] =
      imageIndex === 0
        ? 'firstFrame'
        : imageIndex === 1
          ? 'lastFrame'
          : 'reference'
    refs.push({ path: output.path, role, scope: output.scope })
    imageIndex += 1
  }

  return { refs, ...(video ? { video } : {}) }
}

function collectUpstreamRefs(targetNodeId: string): CollectedRefs {
  const { nodes, edges } = useCanvasStore.getState()
  const sourceIds = edges
    .filter((edge) => edge.target === targetNodeId)
    .map((edge) => edge.source)

  const expanded: string[] = []
  for (const sourceId of sourceIds) {
    const source = nodes.find((node) => node.id === sourceId)
    if (!source) continue
    if (isGroupNode(source)) {
      expanded.push(
        ...nodes
          .filter((node) => node.parentId === source.id)
          .map((node) => node.id)
      )
    } else {
      expanded.push(sourceId)
    }
  }

  return collectRefsFromNodes(expanded)
}

function proposalSummary(proposal: AgentProposal): Record<string, unknown> {
  return {
    proposalId: proposal.id,
    status: proposal.status,
    nodeId: proposal.request.nodeId,
    nodeTitle: proposal.nodeTitle,
    modelKey: proposal.request.modelKey,
    modelName: proposal.modelName,
    count: proposal.count,
    estimatedCost: proposal.estimatedCost,
    expiresAt: proposal.expiresAt
  }
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

  if (call.name === 'canvas_group') {
    const nodeIds = Array.isArray(call.args.nodeIds)
      ? call.args.nodeIds.filter(
          (id): id is string => typeof id === 'string'
        )
      : []
    if (nodeIds.length < 2) {
      return { ok: false, error: '至少需要两个节点才能分组' }
    }

    const targets = state.nodes.filter((node) => nodeIds.includes(node.id))
    if (targets.length !== nodeIds.length) {
      return { ok: false, error: '部分节点不存在' }
    }
    if (targets.some((node) => node.type === 'group' || node.parentId)) {
      return { ok: false, error: '只能把顶层非分组节点打组' }
    }

    useCanvasStore.setState({
      nodes: state.nodes.map((node) => ({
        ...node,
        selected: nodeIds.includes(node.id)
      }))
    })
    const groupId = useCanvasStore.getState().groupSelection(call.turnId)
    if (!groupId) {
      return { ok: false, error: '打组失败，至少需要两个顶层节点' }
    }

    const change = emptyCanvasChange()
    change.createdNodeIds.push(groupId)
    change.updatedNodeIds.push(...nodeIds)
    return {
      ok: true,
      result: { groupId, nodeIds },
      change
    }
  }

  if (call.name === 'canvas_ungroup') {
    const groupId = String(call.args.groupId ?? '')
    const group = state.nodes.find((node) => node.id === groupId)
    if (!group || !isGroupNode(group)) {
      return { ok: false, error: '找不到这个分组' }
    }

    const releasedNodeIds = state.nodes
      .filter((node) => node.parentId === groupId)
      .map((node) => node.id)
    useCanvasStore.getState().ungroup(groupId, call.turnId)

    const change = emptyCanvasChange()
    change.deletedNodeIds.push(groupId)
    change.updatedNodeIds.push(...releasedNodeIds)
    return {
      ok: true,
      result: { groupId, releasedNodeIds },
      change
    }
  }

  if (call.name === 'generation_propose') {
    const nodeId = String(call.args.nodeId ?? '')
    const modelKey = String(call.args.modelKey ?? '')
    const prompt = String(call.args.prompt ?? '').trim()
    const target = state.nodes.find((node) => node.id === nodeId)

    if (!target || target.type !== 'cine') {
      return { ok: false, error: '找不到目标生成节点' }
    }
    if (!prompt) {
      return { ok: false, error: '提示词不能为空' }
    }

    const explicitRefs = Array.isArray(call.args.refNodeIds)
      ? call.args.refNodeIds.filter(
          (id): id is string => typeof id === 'string' && Boolean(id)
        )
      : []
    const collected =
      explicitRefs.length > 0
        ? collectRefsFromNodes(explicitRefs)
        : collectUpstreamRefs(nodeId)

    const baseParams =
      call.args.params &&
      typeof call.args.params === 'object' &&
      !Array.isArray(call.args.params)
        ? { ...(call.args.params as Record<string, unknown>) }
        : {}
    const negativePrompt =
      typeof call.args.negativePrompt === 'string'
        ? call.args.negativePrompt.trim()
        : ''
    if (negativePrompt) {
      baseParams.negative_prompt = negativePrompt
    }

    const count =
      typeof call.args.count === 'number' ? call.args.count : undefined

    try {
      const proposal = await window.api.agent.proposalCreate({
        turnId: call.turnId,
        request: {
          nodeId,
          modelKey,
          prompt,
          params: baseParams,
          ...(collected.refs.length > 0 ? { refs: collected.refs } : {}),
          ...(collected.video ? { video: collected.video } : {})
        },
        nodeTitle: nodeTitleOf(target),
        ...(count !== undefined ? { count } : {})
      })
      return { ok: true, result: proposalSummary(proposal) }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : '登记生成提案失败'
      }
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
