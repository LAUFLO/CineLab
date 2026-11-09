import type {
  AgentProposal,
  AgentToolCallRequest,
  AgentToolResultInput,
  AgentTurnChange
} from '@shared/agent'
import {
  emptyCanvasChange,
  type CanvasCommand,
  type CanvasCommandEdge,
  type CanvasCommandNode
} from '@shared/canvas-commands'
import { NODE_META, TITLE_HEIGHT, type OutputRef } from '@shared/canvas-schema'
import type { ReferenceInput } from '@shared/generation'
import {
  absolutePosition,
  isGroupNode,
  nodeSize,
  selectedNodeOutput,
  useCanvasStore,
  type CanvasNode
} from '../stores/canvas'
import { executeStageTool } from './stageBridge'
import { executeTimelineTool } from './timelineBridge'

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
  nodeIds: string[]
}

interface LibraryRefInput {
  path: string
  kind: 'image' | 'video'
  role?: ReferenceInput['role']
}

function upstreamNodeIds(targetNodeId: string): string[] {
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
  return expanded
}

function buildReferences(
  nodeIds: string[],
  libraryRefs: LibraryRefInput[] = []
): CollectedRefs {
  const { nodes } = useCanvasStore.getState()
  const images: ReferenceInput[] = []
  const videos: ReferenceInput[] = []
  const usedRoles = new Set<ReferenceInput['role']>()
  const seen = new Set<string>()

  const keyOf = (path: string, scope?: string): string =>
    `${scope ?? 'project'}:${path}`

  const pushImage = (
    path: string,
    scope: ReferenceInput['scope'],
    role?: ReferenceInput['role']
  ): void => {
    if (images.length >= 3) return
    const key = keyOf(path, scope)
    if (seen.has(key)) return
    seen.add(key)

    let nextRole: ReferenceInput['role'] =
      role ??
      (images.length === 0
        ? 'firstFrame'
        : images.length === 1
          ? 'lastFrame'
          : 'reference')
    if (nextRole !== 'reference' && usedRoles.has(nextRole)) {
      nextRole = 'reference'
    }
    if (nextRole !== 'reference') usedRoles.add(nextRole)
    images.push({ path, role: nextRole, ...(scope ? { scope } : {}) })
  }

  const pushVideo = (path: string, scope: ReferenceInput['scope']): void => {
    if (videos.length > 0) return
    const key = keyOf(path, scope)
    if (seen.has(key)) return
    seen.add(key)
    videos.push({ path, role: 'reference', ...(scope ? { scope } : {}) })
  }

  for (const nodeId of nodeIds) {
    const node = nodes.find((item) => item.id === nodeId)
    if (!node || isGroupNode(node)) continue
    const output = selectedNodeOutput(node)
    if (!output) continue
    if (output.kind === 'video') pushVideo(output.path, output.scope)
    else if (output.kind === 'image') pushImage(output.path, output.scope)
  }

  for (const ref of libraryRefs) {
    if (ref.kind === 'video') pushVideo(ref.path, 'global')
    else pushImage(ref.path, 'global', ref.role)
  }

  return {
    refs: images,
    ...(videos[0] ? { video: videos[0] } : {}),
    nodeIds: [...new Set(nodeIds)]
  }
}

function findNodeWithOutput(
  path: string,
  scope: ReferenceInput['scope']
): string | undefined {
  const { nodes } = useCanvasStore.getState()
  for (const node of nodes) {
    if (isGroupNode(node)) continue
    const output = selectedNodeOutput(node)
    if (!output) continue
    if (output.path !== path) continue
    if ((output.scope ?? 'project') !== (scope ?? 'project')) continue
    return node.id
  }
  return undefined
}

function libraryAssetName(path: string, fallback: string): string {
  const fileName = path.split('/').pop() ?? ''
  return fileName.replace(/\.[^.]+$/, '') || fallback
}

function libraryAssetNode(
  ref: LibraryRefInput,
  target: CanvasNode,
  nodes: CanvasNode[],
  offsetY: number
): CanvasCommandNode {
  const kind = ref.kind
  const meta = NODE_META[kind]
  const base = absolutePosition(target, nodes)
  const position = {
    x: base.x - meta.width - 80,
    y: base.y + offsetY
  }
  const output: OutputRef = {
    id: ref.path,
    path: ref.path,
    scope: 'global',
    kind,
    createdAt: new Date().toISOString(),
    model: '资产库'
  }
  return {
    id: `node-${kind}-${crypto.randomUUID().slice(0, 8)}`,
    type: 'cine',
    position,
    selected: false,
    data: {
      kind,
      title: libraryAssetName(ref.path, `${meta.label}素材`),
      status: 'done',
      assetOnly: true,
      outputs: [output],
      selectedOutputId: output.id,
      templates: meta.templates
    },
    style: { width: meta.width, height: meta.height + TITLE_HEIGHT }
  }
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
    expiresAt: proposal.expiresAt
  }
}

async function executeTool(call: AgentToolCallRequest): Promise<{
  ok: boolean
  result?: unknown
  error?: string
  change?: AgentTurnChange
}> {
  if (call.name.startsWith('stage_')) {
    return executeStageTool(call)
  }

  if (call.name.startsWith('timeline_')) {
    return executeTimelineTool(call)
  }

  const state = useCanvasStore.getState()

  if (call.name === 'canvas_get') {
    return {
      ok: true,
      result: {
        nodeCount: state.nodes.length,
        edgeCount: state.edges.length,
        selectedNodes: selectedNodeSummary(),
        nodes: state.nodes.slice(0, 200).map((node) => {
          const output = selectedNodeOutput(node)
          return {
            id: node.id,
            title: nodeTitleOf(node),
            kind:
              node.type === 'cine'
                ? node.data.kind
                : node.type,
            selected: node.selected === true,
            x: Math.round(node.position.x),
            y: Math.round(node.position.y),
            ...(output ? { outputKind: output.kind } : {})
          }
        }),
        ...(state.nodes.length > 200 ? { nodesTruncated: true } : {})
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
    const nearNodeId =
      typeof call.args.nearNodeId === 'string' ? call.args.nearNodeId.trim() : ''
    let position: { x: number; y: number }

    if (nearNodeId) {
      const near = state.nodes.find((node) => node.id === nearNodeId)
      if (!near) {
        return { ok: false, error: '找不到参考节点 nearNodeId' }
      }
      const base = absolutePosition(near, state.nodes)
      const size = nodeSize(near)
      position = { x: base.x + size.width + 80, y: base.y }
    } else {
      const x = Number(call.args.x)
      const y = Number(call.args.y)
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return { ok: false, error: '节点位置必须是有限数字' }
      }
      position = { x, y }
    }
    const { x, y } = position

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
    const libraryRefs: LibraryRefInput[] = Array.isArray(call.args.libraryRefs)
      ? call.args.libraryRefs
          .filter(
            (item): item is Record<string, unknown> =>
              Boolean(item) && typeof item === 'object' && !Array.isArray(item)
          )
          .map((item): LibraryRefInput => {
            const role = item.role
            return {
              path: String(item.path ?? ''),
              kind: item.kind === 'video' ? 'video' : 'image',
              ...(role === 'firstFrame' ||
              role === 'lastFrame' ||
              role === 'reference'
                ? { role: role as ReferenceInput['role'] }
                : {})
            }
          })
          .filter((item) => item.path)
      : []

    const matchedLibraryNodeIds = libraryRefs
      .map((ref) => findNodeWithOutput(ref.path, 'global'))
      .filter((id): id is string => Boolean(id))
    const refNodeIds = [
      ...new Set([...explicitRefs, ...matchedLibraryNodeIds])
    ]
    const autoRefNodeIds =
      explicitRefs.length === 0 && libraryRefs.length === 0
        ? upstreamNodeIds(nodeId)
        : refNodeIds

    const libraryNodes: CanvasCommandNode[] = []
    const libraryNodeIds: string[] = []
    const matchedPaths = new Set(
      libraryRefs
        .map((ref) => (findNodeWithOutput(ref.path, 'global') ? ref.path : ''))
        .filter(Boolean)
    )
    let offsetY = 0
    for (const ref of libraryRefs) {
      if (matchedPaths.has(ref.path)) continue
      const node = libraryAssetNode(ref, target, state.nodes, offsetY)
      libraryNodes.push(node)
      libraryNodeIds.push(node.id)
      offsetY += NODE_META[ref.kind].height + TITLE_HEIGHT + 24
    }

    const collected = buildReferences(
      [...autoRefNodeIds, ...libraryNodeIds],
      libraryRefs
    )
    if (
      (explicitRefs.length > 0 || libraryRefs.length > 0) &&
      collected.refs.length === 0 &&
      !collected.video
    ) {
      return {
        ok: false,
        error: '参考素材不存在或没有可用的图片/视频输出'
      }
    }

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

      const commands: CanvasCommand[] = libraryNodes.map((node) => ({
        type: 'addNode',
        node
      }))
      const existingSources = new Set(
        state.edges
          .filter((edge) => edge.target === nodeId)
          .map((edge) => edge.source)
      )
      const knownNodeIds = new Set([
        ...state.nodes.map((node) => node.id),
        ...libraryNodeIds
      ])
      const connectedNodeIds: string[] = []

      for (const sourceId of [...autoRefNodeIds, ...libraryNodeIds]) {
        if (sourceId === nodeId) continue
        if (!knownNodeIds.has(sourceId)) continue
        if (existingSources.has(sourceId)) {
          connectedNodeIds.push(sourceId)
          continue
        }
        existingSources.add(sourceId)
        connectedNodeIds.push(sourceId)
        commands.push({
          type: 'connect',
          edge: {
            id: `edge-${crypto.randomUUID().slice(0, 8)}`,
            source: sourceId,
            target: nodeId,
            type: 'flow',
            data: { role: 'auto' }
          }
        })
      }

      commands.push({ type: 'updatePrompt', nodeId, prompt })

      const change = useCanvasStore
        .getState()
        .applyCommands(commands, call.turnId)

      useCanvasStore.setState({
        nodes: useCanvasStore.getState().nodes.map((node) => ({
          ...node,
          selected: node.id === nodeId
        }))
      })

      return {
        ok: true,
        result: {
          ...proposalSummary(proposal),
          refs: collected.refs.map((ref) => ({
            path: ref.path,
            role: ref.role,
            scope: ref.scope ?? 'project'
          })),
          videoRef: collected.video
            ? {
                path: collected.video.path,
                scope: collected.video.scope ?? 'project'
              }
            : null,
          createdNodeIds: change.createdNodeIds,
          connectedNodeIds
        },
        change
      }
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
