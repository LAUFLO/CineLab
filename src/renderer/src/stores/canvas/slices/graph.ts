import { addEdge, applyEdgeChanges, applyNodeChanges } from '@xyflow/react'
import { NODE_META, TITLE_HEIGHT, type OutputRef } from '@shared/canvas-schema'
import { VIDEO_OPERATIONS } from '@shared/operation-schema'
import { applyCanvasBatch } from '@shared/canvas-commands'
import { clearEdgeReferences } from '../../edge-references'
import { externalWrite, commandTurns, isGroupNode, isStudioNode, isStageNode, isFilmNode, isVideoOpNode, nodeSize, nextId, absolutePosition, type CineNode, type StudioNode, type StageNode, type FilmNode, type VideoOpNode, type CanvasNode } from '../../canvas-model'

import type { StateCreator } from 'zustand'
import type { CanvasStore } from '../../canvas'

type GraphSlice = Pick<CanvasStore, 'loadCanvas' | 'onNodesChange' | 'onEdgesChange' | 'removeEdges' | 'onConnect' | 'addNode' | 'addStudioNode' | 'addStageNode' | 'addVideoOpNode' | 'patchStudioNode' | 'patchStageNode' | 'patchVideoOpNode' | 'applyOutput' | 'patchNodeData' | 'applyCommands' | 'endCommandTurn' | 'beginToolTurn' | 'endToolTurn' | 'resizeNode' | 'removeNode' | 'clearSelection'>

export const createGraphSlice: StateCreator<
  CanvasStore,
  [],
  [],
  GraphSlice
> = (set, get) => ({
loadCanvas: (nodes, edges, viewport) => {
    const groupIds = new Set<string>()

    // ===== 旧项目迁移：独立成片节点合并回剪辑室节点 =====
    const filmToStudio = new Map<string, string>()
    for (const node of nodes) {
      if (!isFilmNode(node)) continue
      const studioId = node.data.studioNodeId
      if (!studioId) continue
      const studio = nodes.find(
        (entry) => entry.id === studioId && isStudioNode(entry)
      )
      if (!studio || !isStudioNode(studio)) continue
      filmToStudio.set(node.id, studioId)
    }

    const mergedNodes = nodes
      .map((node): CanvasNode | null => {
        if (isFilmNode(node)) {
          const studioId = filmToStudio.get(node.id)
          if (studioId) return null

          // 找不到剪辑室的孤儿成片：降级为普通视频素材，避免数据丢失
          const outputs = node.data.outputs ?? []
          return {
            id: node.id,
            type: 'cine',
            parentId: node.parentId,
            position: node.position,
            selected: node.selected,
            zIndex: node.zIndex,
            measured: node.measured,
            data: {
              kind: 'video',
              title: node.data.title,
              status: outputs.length > 0 ? 'done' : 'idle',
              outputs,
              selectedOutputId: node.data.selectedOutputId,
              templates: NODE_META.video.templates
            },
            style: node.style
          }
        }

        if (!isStudioNode(node)) return node

        const film = nodes.find(
          (entry): entry is FilmNode =>
            isFilmNode(entry) && filmToStudio.get(entry.id) === node.id
        )
        if (!film) {
          const outputs = node.data.outputs ?? []
          const filmStatus =
            node.data.filmStatus === 'rendering'
              ? outputs.length > 0
                ? 'ready'
                : 'pending'
              : node.data.filmStatus ??
                (outputs.length > 0 ? 'ready' : 'pending')
          return {
            ...node,
            data: {
              ...node.data,
              filmStatus
            }
          }
        }

        const outputs = film.data.outputs ?? []
        const filmStatus =
          film.data.filmStatus === 'rendering'
            ? outputs.length > 0
              ? 'ready'
              : 'pending'
            : film.data.filmStatus ??
              (outputs.length > 0 ? 'ready' : 'pending')

        return {
          ...node,
          data: {
            ...node.data,
            filmNodeId: undefined,
            filmStatus,
            outputs,
            selectedOutputId: film.data.selectedOutputId,
            upstreamAck: film.data.upstreamAck
          }
        }
      })
      .filter((node): node is CanvasNode => node !== null)

    const mergedEdges = edges
      .filter((edge) => {
        const studioId = filmToStudio.get(edge.target)
        return !(studioId && edge.source === studioId)
      })
      .map((edge) => {
        const studioId = filmToStudio.get(edge.source)
        return studioId ? { ...edge, source: studioId } : edge
      })
      .filter((edge) => edge.source !== edge.target)

    const migrated = mergedNodes.map((node) => {
      if (isGroupNode(node)) return node
      if (isStudioNode(node)) {
        const width = Number(node.style?.width ?? 0)
        if (width === NODE_META.studio.width) return node
        return {
          ...node,
          style: {
            ...node.style,
            width: NODE_META.studio.width,
            height: NODE_META.studio.height + TITLE_HEIGHT
          }
        }
      }
      if (node.type !== 'cine') return node
      if (node.data.kind === 'study') {
        const height = Number(node.style?.height ?? 0)
        if (height === 368 || height === 308) {
          return {
            ...node,
            style: {
              ...node.style,
              height: NODE_META.study.height + TITLE_HEIGHT
            }
          }
        }
        return node
      }
      if (node.data.kind !== 'image' && node.data.kind !== 'video') return node

      const width = Number(node.style?.width ?? 0)
      if (width !== 614) return node

      const meta = NODE_META[node.data.kind]
      const output = node.data.outputs?.find(
        (item) => item.width && item.height
      )
      const oldHeight = Number(
        node.style?.height ?? meta.height + TITLE_HEIGHT
      )
      const height = output?.width && output?.height
        ? Math.round((meta.width * output.height) / output.width) + TITLE_HEIGHT
        : Math.round(oldHeight * (meta.width / width))

      if (node.parentId) groupIds.add(node.parentId)

      return {
        ...node,
        style: {
          ...node.style,
          width: meta.width,
          height
        }
      }
    })

    set({
      nodes: migrated,
      edges: mergedEdges,
      viewport,
      hydrated: true,
      past: [],
      future: [],
      clipboard: null
    })

    for (const groupId of groupIds) {
      get().syncGroupBounds(groupId)
    }
  },
onNodesChange: (changes) => {
    if (changes.some((change) => change.type === 'remove')) {
      get().pushHistory()
    }

    const boxSelecting = get().boxSelecting
    const effective = boxSelecting
      ? changes.map((change) => {
          if (
            change.type === 'select' &&
            change.selected &&
            get().nodes.some(
              (node) => node.id === change.id && isGroupNode(node)
            )
          ) {
            return { ...change, selected: false }
          }
          return change
        })
      : changes

    const nodes = applyNodeChanges(effective, get().nodes)
    const removed = changes
      .filter((change) => change.type === 'remove')
      .map((change) => change.id)

    let edges = get().edges
    if (removed.length > 0) {
      edges = edges.filter(
        (edge) => !removed.includes(edge.source) && !removed.includes(edge.target)
      )
    }

    set({ nodes, edges })
  },
onEdgesChange: (changes) => {
    const removedIds = new Set(
      changes
        .filter((change) => change.type === 'remove')
        .map((change) => change.id)
    )
    if (removedIds.size === 0) {
      set({ edges: applyEdgeChanges(changes, get().edges) })
      return
    }

    const removedEdges = get().edges.filter((edge) => removedIds.has(edge.id))
    const edges = applyEdgeChanges(changes, get().edges)
    set({
      edges,
      nodes: clearEdgeReferences(get().nodes, edges, removedEdges)
    })
  },
removeEdges: (edgeIds, turnId) => {
    if (edgeIds.length === 0) return 0
    const ids = new Set(edgeIds)
    const removedEdges = get().edges.filter((edge) => ids.has(edge.id))
    if (removedEdges.length === 0) return 0

    if (!turnId || !commandTurns.has(turnId)) {
      get().pushHistory()
      if (turnId) commandTurns.add(turnId)
    }

    const edges = get().edges.filter((edge) => !ids.has(edge.id))
    set({
      edges,
      nodes: clearEdgeReferences(get().nodes, edges, removedEdges)
    })

    return removedEdges.length
  },
onConnect: (connection) => {
    if (!connection.source || !connection.target) return
    if (connection.source === connection.target) return

    const exists = get().edges.some(
      (edge) => edge.source === connection.source && edge.target === connection.target
    )
    if (exists) return

    get().pushHistory()

    set({
      edges: addEdge(
        {
          id: nextId('edge'),
          source: connection.source,
          target: connection.target,
          type: 'flow',
          data: { role: 'auto' }
        },
        get().edges
      )
    })
  },
addNode: (kind, position) => {
    get().pushHistory()

    const meta = NODE_META[kind]
    const sameKind = get().nodes.filter((node) => node.data.kind === kind).length
    const id = nextId(kind)

    const node: CineNode = {
      id,
      type: 'cine',
      position,
      selected: true,
      data: {
        kind,
        title: `${meta.label}节点 ${sameKind + 1}`,
        status: 'idle',
        templates: meta.templates
      },
      style: { width: meta.width, height: meta.height + TITLE_HEIGHT }
    }

    set({
      nodes: [...get().nodes.map((n) => ({ ...n, selected: false })), node]
    })

    return id
  },
addStudioNode: (position, title) => {
    get().pushHistory()

    const meta = NODE_META.studio
    const count = get().nodes.filter(isStudioNode).length
    const id = nextId('studio')

    const node: StudioNode = {
      id,
      type: 'studio',
      position,
      selected: true,
      data: {
        kind: 'studio',
        title: title ?? `剪辑室 ${count + 1}`,
        status: 'idle',
        timelineId: nextId('timeline'),
        filmStatus: 'pending',
        outputs: [],
        templates: []
      },
      style: { width: meta.width, height: meta.height + TITLE_HEIGHT }
    }

    set({
      nodes: [
        ...get().nodes.map((entry) => ({ ...entry, selected: false })),
        node
      ]
    })

    return id
  },
addStageNode: (doc, position) => {
    get().pushHistory()

    const meta = NODE_META.stage
    const id = nextId('stage-node')
    const node: StageNode = {
      id,
      type: 'stage',
      position,
      selected: true,
      data: {
        kind: 'stage',
        title: doc.name,
        status: 'idle',
        stageId: doc.stageId,
        ...(doc.activeCameraId
          ? { activeCameraId: doc.activeCameraId }
          : {}),
        objectCount: doc.objects.length,
        cameraCount: doc.cameras.length,
        shotCount: doc.shots.length,
        templates: []
      },
      style: { width: meta.width, height: meta.height }
    }

    set({
      nodes: [
        ...get().nodes.map((entry) => ({ ...entry, selected: false })),
        node
      ]
    })

    return id
  },
addVideoOpNode: (sourceNodeId, operation, position, title) => {
    const state = get()
    const existing = state.nodes.find(
      (node): node is VideoOpNode =>
        isVideoOpNode(node) &&
        node.data.sourceNodeId === sourceNodeId &&
        node.data.operation === operation
    )

    if (existing) {
      set({
        nodes: state.nodes.map((node) => ({
          ...node,
          selected: node.id === existing.id
        }))
      })
      get().patchVideoOpNode(existing.id, { expanded: true })
      return existing.id
    }

    get().pushHistory()
    const source = state.nodes.find((node) => node.id === sourceNodeId)
    const absolute = source
      ? absolutePosition(source, state.nodes)
      : { x: 0, y: 0 }
    const meta = NODE_META['video-op']
    const operationDef = VIDEO_OPERATIONS.find((item) => item.id === operation)
    const id = nextId('video-op')
    const sourceTitle = source ? source.data.title : '视频'

    const node: VideoOpNode = {
      id,
      type: 'video-op',
      position:
        position ??
        {
          x: absolute.x + (source ? nodeSize(source).width : meta.width) + 80,
          y: absolute.y
        },
      selected: true,
      data: {
        kind: 'video-op',
        title: title ?? `${operationDef?.label ?? operation} · ${sourceTitle}`,
        status: 'idle',
        operation,
        sourceNodeId,
        expanded: true,
        templates: []
      },
      style: { width: meta.width }
    }

    set({
      nodes: [
        ...state.nodes.map((entry) => ({ ...entry, selected: false })),
        node
      ]
    })
    get().onConnect({ source: sourceNodeId, target: id })
    return id
  },
patchStudioNode: (nodeId, patch) => {
    set({
      nodes: get().nodes.map((node) =>
        node.id === nodeId && isStudioNode(node)
          ? { ...node, data: { ...node.data, ...patch } }
          : node
      )
    })
  },
patchStageNode: (nodeId, patch) => {
    set({
      nodes: get().nodes.map((node) =>
        node.id === nodeId && isStageNode(node)
          ? { ...node, data: { ...node.data, ...patch } }
          : node
      )
    })
  },
patchVideoOpNode: (nodeId, patch) => {
    set({
      nodes: get().nodes.map((node) =>
        node.id === nodeId && isVideoOpNode(node)
          ? { ...node, data: { ...node.data, ...patch } }
          : node
      )
    })
  },
applyOutput: (nodeId, asset, op) => {
    const node = get().nodes.find((entry) => entry.id === nodeId)
    if (!node || node.type !== 'cine') return

    get().pushHistory()

    const output: OutputRef = {
      id: asset.id,
      path: asset.path,
      kind: asset.kind,
      createdAt: asset.createdAt,
      model: asset.model,
      width: asset.width,
      height: asset.height,
      duration: asset.duration,
      fps: asset.fps,
      hasAudio: asset.hasAudio,
      op
    }

    const outputs = [output, ...(node.data.outputs ?? [])].slice(0, 20)
    const kind = node.data.kind
    const baseWidth = node.measured?.width ?? NODE_META[kind].width
    const nextHeight =
      asset.width && asset.height
        ? Math.round((baseWidth * asset.height) / asset.width) + TITLE_HEIGHT
        : node.measured?.height ?? NODE_META[kind].height + TITLE_HEIGHT

    set({
      nodes: get().nodes.map((entry) => {
        if (entry.id !== nodeId || entry.type !== 'cine') return entry
        return {
          ...entry,
          data: {
            ...entry.data,
            status: 'done',
            progress: 100,
            error: undefined,
            outputs,
            selectedOutputId: output.id
          },
          style: { ...entry.style, height: nextHeight }
        }
      })
    })
  },
patchNodeData: (nodeId, patch) => {
    set({
      nodes: get().nodes.map((node) => {
        if (node.id !== nodeId || node.type !== 'cine') return node
        return { ...node, data: { ...node.data, ...patch } }
      })
    })
  },
applyCommands: (commands, turnId) => {
    const { nodes, edges } = get()
    const result = applyCanvasBatch({ nodes, edges }, commands)
    const change = result.change
    const hasChange =
      change.createdNodeIds.length > 0 ||
      change.updatedNodeIds.length > 0 ||
      change.deletedNodeIds.length > 0 ||
      change.createdEdgeIds.length > 0 ||
      change.deletedEdgeIds.length > 0

    if (hasChange) {
      if (!turnId || !commandTurns.has(turnId)) {
        get().pushHistory()
        if (turnId) commandTurns.add(turnId)
      }
      set({ nodes: result.nodes, edges: result.edges })
    }

    return change
  },
endCommandTurn: (turnId) => {
    commandTurns.delete(turnId)
  },
beginToolTurn: (turnId) => {
    if (turnId && !commandTurns.has(turnId)) {
      get().pushHistory()
      commandTurns.add(turnId)
    }
    externalWrite.depth += 1
  },
endToolTurn: () => {
    externalWrite.depth = Math.max(0, externalWrite.depth - 1)
  },
resizeNode: (nodeId, height) => {
    set({
      nodes: get().nodes.map((node) =>
        node.id === nodeId
          ? { ...node, style: { ...node.style, height } }
          : node
      )
    })
  },
removeNode: (id) => {
    get().pushHistory()
    set({
      nodes: get().nodes.filter((node) => node.id !== id),
      edges: get().edges.filter((edge) => edge.source !== id && edge.target !== id)
    })
  },
clearSelection: () => {
    set({ nodes: get().nodes.map((node) => ({ ...node, selected: false })) })
  },
})
