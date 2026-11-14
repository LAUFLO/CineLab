import { NODE_META, TITLE_HEIGHT } from '@shared/canvas-schema'
import { externalWrite, isGroupNode, nodeSize, HISTORY_LIMIT, cloneSnapshot, remapNodeReferences, remapEdges, childrenOf, type CanvasNode } from '../../canvas-model'

import type { StateCreator } from 'zustand'
import type { CanvasStore } from '../../canvas'

type HistorySlice = Pick<CanvasStore, 'arrangeNodes' | 'pushHistory' | 'undo' | 'redo' | 'copySelection' | 'pasteNodes' | 'duplicateSelection' | 'removeSelection' | 'removeNodesByIds'>

export const createHistorySlice: StateCreator<
  CanvasStore,
  [],
  [],
  HistorySlice
> = (set, get) => ({
arrangeNodes: () => {
    const all = get().nodes
    const edges = get().edges
    if (all.length === 0) return
    get().pushHistory()

    const styleSize = (value: string | number | undefined): number | undefined => {
      if (value === undefined || value === '') return undefined
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : undefined
    }

    const layoutSize = (node: CanvasNode): { width: number; height: number } => {
      const measuredWidth = node.measured?.width
      const measuredHeight = node.measured?.height
      const styleWidth = styleSize(node.style?.width)
      const styleHeight = styleSize(node.style?.height)

      if (isGroupNode(node)) {
        return {
          width: measuredWidth ?? styleWidth ?? 320,
          height: measuredHeight ?? styleHeight ?? 200
        }
      }

      const meta = NODE_META[node.data.kind]
      return {
        width: measuredWidth ?? styleWidth ?? meta.width,
        height: measuredHeight ?? styleHeight ?? meta.height + TITLE_HEIGHT
      }
    }

    // 顶层节点作为布局块；分组把组内节点视为一个整体
    const topNodes = all.filter((node) => !node.parentId)
    const blockNodes = new Map<string, Set<string>>()
    for (const node of topNodes) {
      const ids = new Set<string>([node.id])
      if (isGroupNode(node)) {
        for (const child of all) {
          if (child.parentId === node.id) ids.add(child.id)
        }
      }
      blockNodes.set(node.id, ids)
    }

    const blockOf = new Map<string, string>()
    for (const [blockId, ids] of blockNodes) {
      for (const id of ids) blockOf.set(id, blockId)
    }

    const incoming = new Map<string, Set<string>>()
    const outgoing = new Map<string, Set<string>>()
    for (const blockId of blockNodes.keys()) {
      incoming.set(blockId, new Set())
      outgoing.set(blockId, new Set())
    }

    for (const edge of edges) {
      const from = blockOf.get(edge.source)
      const to = blockOf.get(edge.target)
      if (!from || !to || from === to) continue
      incoming.get(to)?.add(from)
      outgoing.get(from)?.add(to)
    }

    const isolated = new Set(
      [...blockNodes.keys()].filter(
        (blockId) =>
          (incoming.get(blockId)?.size ?? 0) === 0 &&
          (outgoing.get(blockId)?.size ?? 0) === 0
      )
    )

    // 按连线拓扑分层；孤立节点放到最后一列
    const levels = new Map<string, number>()
    for (const blockId of blockNodes.keys()) {
      if (!isolated.has(blockId)) levels.set(blockId, 0)
    }

    let changed = true
    let guard = 0
    while (changed && guard < blockNodes.size + 2) {
      changed = false
      guard += 1
      for (const blockId of levels.keys()) {
        const sources = [...(incoming.get(blockId) ?? [])].filter(
          (source) => !isolated.has(source)
        )
        if (sources.length === 0) continue
        const next = Math.max(
          ...sources.map((source) => (levels.get(source) ?? 0) + 1)
        )
        if ((levels.get(blockId) ?? 0) < next) {
          levels.set(blockId, next)
          changed = true
        }
      }
    }

    // 循环依赖导致层数异常时，退化为同层排列
    const maxLevel = Math.max(0, ...levels.values())
    if (maxLevel > blockNodes.size) {
      for (const key of levels.keys()) levels.set(key, 0)
    }

    const isolatedLevel =
      Math.max(0, ...levels.values()) + (isolated.size > 0 ? 1 : 0)
    for (const blockId of isolated) levels.set(blockId, isolatedLevel)

    const columns = new Map<number, string[]>()
    for (const blockId of blockNodes.keys()) {
      const level = levels.get(blockId) ?? 0
      const list = columns.get(level) ?? []
      list.push(blockId)
      columns.set(level, list)
    }

    const sortedLevels = [...columns.keys()].sort((a, b) => a - b)
    for (const level of sortedLevels) {
      const list = columns.get(level) ?? []
      list.sort((a, b) => {
        const nodeA = all.find((node) => node.id === a)
        const nodeB = all.find((node) => node.id === b)
        return (nodeA?.position.y ?? 0) - (nodeB?.position.y ?? 0)
      })
    }

    const GAP_X = 80
    const GAP_Y = 60
    const positions = new Map<string, { x: number; y: number }>()
    let cursorX = 0

    for (const level of sortedLevels) {
      const list = columns.get(level) ?? []
      let columnWidth = 0
      let cursorY = 0

      for (const blockId of list) {
        const node = all.find((item) => item.id === blockId)
        if (!node) continue
        const size = layoutSize(node)
        positions.set(blockId, { x: cursorX, y: cursorY })
        cursorY += size.height + GAP_Y
        columnWidth = Math.max(columnWidth, size.width)
      }

      cursorX += columnWidth + GAP_X
    }

    const nodes = all.map((node) => {
      if (node.parentId) return node
      const position = positions.get(node.id)
      if (!position) return node
      return { ...node, position }
    })

    set({ nodes })
  },
pushHistory: () => {
    if (externalWrite.depth > 0) return
    const { nodes, edges, past } = get()
    const next = [...past, cloneSnapshot(nodes, edges)]
    // 大画布的全量快照更占内存，降低保留步数，避免撤销栈拖慢主线程。
    const limit = nodes.length > 200 ? 20 : HISTORY_LIMIT
    if (next.length > limit) next.splice(0, next.length - limit)
    set({ past: next, future: [] })
  },
undo: () => {
    const { past, future, nodes, edges } = get()
    const previous = past[past.length - 1]
    if (!previous) return

    set({
      nodes: previous.nodes,
      edges: previous.edges,
      past: past.slice(0, -1),
      future: [...future, cloneSnapshot(nodes, edges)]
    })
  },
redo: () => {
    const { past, future, nodes, edges } = get()
    const next = future[future.length - 1]
    if (!next) return

    set({
      nodes: next.nodes,
      edges: next.edges,
      future: future.slice(0, -1),
      past: [...past, cloneSnapshot(nodes, edges)]
    })
  },
copySelection: () => {
    const baseSelected = get().nodes.filter(
      (node) => node.selected && node.type !== 'film'
    )
    if (baseSelected.length === 0) return 0

    const selected = [...baseSelected]
    const ids = new Set(baseSelected.map((node) => node.id))
    for (const group of baseSelected.filter(isGroupNode)) {
      for (const child of childrenOf(get().nodes, group.id)) {
        if (child.type === 'film' || ids.has(child.id)) continue
        ids.add(child.id)
        selected.push(child)
      }
    }

    const edges = get().edges.filter(
      (edge) => ids.has(edge.source) && ids.has(edge.target)
    )
    const boundaryEdges = get().edges.filter((edge) => {
      const sourceInside = ids.has(edge.source)
      const targetInside = ids.has(edge.target)
      return sourceInside !== targetInside
    })

    set({
      clipboard: structuredClone({ nodes: selected, edges, boundaryEdges })
    })
    return selected.length
  },
pasteNodes: (position, studioTimelines, stageDocs) => {
    const clipboard = get().clipboard
    if (!clipboard || clipboard.nodes.length === 0) return 0

    const nodesToPaste = clipboard.nodes.filter(
      (node) =>
        node.type !== 'film' &&
        (node.type !== 'studio' || studioTimelines?.has(node.id)) &&
        (node.type !== 'stage' || stageDocs?.has(node.id))
    )
    if (nodesToPaste.length === 0) return 0

    get().pushHistory()

    const stamp = Date.now().toString(36)
    const idMap = new Map<string, string>()
    const bounds = nodesToPaste.map((node) => {
      const size = nodeSize(node)
      return {
        x: node.position.x,
        y: node.position.y,
        width: size.width,
        height: size.height
      }
    })
    const minX = Math.min(...bounds.map((item) => item.x))
    const minY = Math.min(...bounds.map((item) => item.y))
    const maxX = Math.max(...bounds.map((item) => item.x + item.width))
    const maxY = Math.max(...bounds.map((item) => item.y + item.height))
    const offset = position
      ? {
          x: position.x - (minX + maxX) / 2,
          y: position.y - (minY + maxY) / 2
        }
      : { x: 24, y: 24 }

    nodesToPaste.forEach((node, index) => {
      const prefix = isGroupNode(node) ? 'group' : node.data.kind
      idMap.set(node.id, `${prefix}_${stamp}_${index + 1}`)
    })

    const pastedNodes: CanvasNode[] = nodesToPaste.map((node) => {
      const id = idMap.get(node.id) as string
      const copiedParent = node.parentId ? idMap.has(node.parentId) : false
      const clone = structuredClone(node)
      remapNodeReferences(clone, idMap)

      if (clone.type === 'studio') {
        clone.data.timelineId = studioTimelines?.get(node.id) as string
        clone.data.filmNodeId = undefined
        clone.data.title = `${clone.data.title} 副本`
      }

      if (clone.type === 'stage') {
        const stageId = stageDocs?.get(node.id)
        if (stageId) clone.data.stageId = stageId
        clone.data.title = `${clone.data.title} 副本`
      }

      return {
        ...clone,
        id,
        parentId: node.parentId ? idMap.get(node.parentId) : undefined,
        position: copiedParent
          ? { ...node.position }
          : {
              x: node.position.x + offset.x,
              y: node.position.y + offset.y
            },
        selected: true,
        dragging: false
      }
    })

    const liveIds = new Set([
      ...get().nodes.map((node) => node.id),
      ...pastedNodes.map((node) => node.id)
    ])
    const pastedEdges = remapEdges(
      [...clipboard.edges, ...(clipboard.boundaryEdges ?? [])],
      idMap,
      liveIds,
      stamp
    )

    set({
      nodes: [
        ...get().nodes.map((node) => ({ ...node, selected: false })),
        ...pastedNodes
      ],
      edges: [...get().edges, ...pastedEdges]
    })

    return pastedNodes.length
  },
duplicateSelection: (studioTimelines, stageDocs) => {
    const allNodes = get().nodes
    const selected = allNodes.filter(
      (node) =>
        node.selected &&
        node.type !== 'film' &&
        (node.type !== 'studio' || studioTimelines?.has(node.id)) &&
        (node.type !== 'stage' || stageDocs?.has(node.id))
    )
    if (selected.length === 0) return 0

    const ids = new Set(selected.map((node) => node.id))
    for (const node of selected) {
      if (!isGroupNode(node)) continue
      for (const child of childrenOf(allNodes, node.id)) {
        if (child.type === 'film') continue
        if (child.type === 'studio' && !studioTimelines?.has(child.id)) continue
        if (child.type === 'stage' && !stageDocs?.has(child.id)) continue
        ids.add(child.id)
      }
    }

    const expanded = allNodes.filter(
      (node) =>
        ids.has(node.id) &&
        node.type !== 'film' &&
        (node.type !== 'studio' || studioTimelines?.has(node.id)) &&
        (node.type !== 'stage' || stageDocs?.has(node.id))
    )
    const expandedIds = new Set(expanded.map((node) => node.id))
    const internalEdges = get().edges.filter(
      (edge) => expandedIds.has(edge.source) && expandedIds.has(edge.target)
    )
    const boundaryEdges = get().edges.filter((edge) => {
      const sourceInside = expandedIds.has(edge.source)
      const targetInside = expandedIds.has(edge.target)
      return sourceInside !== targetInside
    })

    get().pushHistory()

    const stamp = Date.now().toString(36)
    const idMap = new Map<string, string>()

    expanded.forEach((node, index) => {
      const prefix = isGroupNode(node) ? 'group' : node.data.kind
      idMap.set(node.id, `${prefix}_${stamp}_${index + 1}`)
    })

    const clones: CanvasNode[] = expanded.map((node) => {
      const id = idMap.get(node.id) as string
      const copiedParent = node.parentId ? idMap.has(node.parentId) : false
      const parentId = node.parentId
        ? idMap.get(node.parentId) ?? node.parentId
        : undefined
      const clone = structuredClone(node)
      remapNodeReferences(clone, idMap)

      if (clone.type === 'studio') {
        clone.data.timelineId = studioTimelines?.get(node.id) as string
        clone.data.filmNodeId = undefined
        clone.data.title = `${clone.data.title} 副本`
      }

      if (clone.type === 'stage') {
        const stageId = stageDocs?.get(node.id)
        if (stageId) clone.data.stageId = stageId
        clone.data.title = `${clone.data.title} 副本`
      }

      return {
        ...clone,
        id,
        parentId,
        position: copiedParent
          ? { ...node.position }
          : {
              x: node.position.x + 24,
              y: node.position.y + 24
            },
        selected: node.selected ?? false,
        dragging: false
      }
    })

    const liveIds = new Set([
      ...get().nodes.map((node) => node.id),
      ...clones.map((node) => node.id)
    ])
    const clonedEdges = remapEdges(
      [...internalEdges, ...boundaryEdges],
      idMap,
      liveIds,
      stamp
    )

    set({
      nodes: [
        ...get().nodes.map((node) => ({ ...node, selected: false })),
        ...clones
      ],
      edges: [...get().edges, ...clonedEdges]
    })

    const parentIds = new Set(
      clones
        .map((node) => node.parentId)
        .filter((id): id is string => Boolean(id))
    )
    for (const parentId of parentIds) {
      get().syncGroupBounds(parentId)
    }

    return clones.length
  },
removeSelection: () => {
    const selected = get().nodes.filter((node) => node.selected)
    if (selected.length === 0) return 0

    const ids = new Set(selected.map((node) => node.id))
    for (const node of selected) {
      if (!isGroupNode(node)) continue
      for (const child of childrenOf(get().nodes, node.id)) ids.add(child.id)
    }

    get().pushHistory()

    set({
      nodes: get().nodes.filter((node) => !ids.has(node.id)),
      edges: get().edges.filter(
        (edge) => !ids.has(edge.source) && !ids.has(edge.target)
      )
    })

    return ids.size
  },
removeNodesByIds: (nodeIds) => {
    if (nodeIds.length === 0) return 0
    const ids = new Set(nodeIds)

    for (const node of get().nodes) {
      if (!ids.has(node.id) || !isGroupNode(node)) continue
      for (const child of childrenOf(get().nodes, node.id)) ids.add(child.id)
    }

    get().pushHistory()

    set({
      nodes: get().nodes.filter((node) => !ids.has(node.id)),
      edges: get().edges.filter(
        (edge) => !ids.has(edge.source) && !ids.has(edge.target)
      )
    })

    return ids.size
  },
})
