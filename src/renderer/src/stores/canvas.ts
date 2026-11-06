import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type Viewport,
  type XYPosition
} from '@xyflow/react'
import { create } from 'zustand'
import {
  GROUP_GAP,
  GROUP_HEADER_HEIGHT,
  GROUP_PADDING,
  GROUP_RATIO_VALUE,
  NODE_META,
  STORYBOARD_CELL_WIDTH,
  STORYBOARD_GAP,
  STORYBOARD_MAX_NODES,
  TITLE_HEIGHT,
  type CineNodeData,
  type GroupColor,
  type GroupMode,
  type GroupNodeData,
  type GroupRatio,
  type NodeKind,
  type OutputRef
} from '@shared/canvas-schema'
import type { GeneratedAsset } from '@shared/generation'

export type CineNode = Node<CineNodeData, 'cine'>
export type GroupNode = Node<GroupNodeData, 'group'>
export type CanvasNode = CineNode | GroupNode
export type CineEdge = Edge

export function isGroupNode(node: CanvasNode): node is GroupNode {
  return node.type === 'group'
}

export function nodeSize(node: CanvasNode): { width: number; height: number } {
  if (isGroupNode(node)) {
    return {
      width: node.measured?.width ?? Number(node.style?.width ?? 320),
      height: node.measured?.height ?? Number(node.style?.height ?? 200)
    }
  }

  const meta = NODE_META[node.data.kind]
  return {
    width: node.measured?.width ?? meta.width,
    height: node.measured?.height ?? meta.height + TITLE_HEIGHT
  }
}

interface Snapshot {
  nodes: CanvasNode[]
  edges: CineEdge[]
}

interface NodeClipboard {
  nodes: CanvasNode[]
  edges: CineEdge[]
}

const HISTORY_LIMIT = 60

function cloneSnapshot(nodes: CanvasNode[], edges: CineEdge[]): Snapshot {
  return structuredClone({ nodes, edges })
}

export type GroupArrangeMode = 'row' | 'column' | 'grid'

export interface AddAssetLayout {
  columns?: number
  cellWidth?: number
  groupTitle?: string
  groupColor?: GroupColor
}

export interface CreateGroupOptions {
  title?: string
  color?: GroupColor
  columns?: number
}

interface CanvasStore {
  nodes: CanvasNode[]
  edges: CineEdge[]
  viewport: Viewport
  hydrated: boolean
  past: Snapshot[]
  future: Snapshot[]
  clipboard: NodeClipboard | null
  boxSelecting: boolean

  loadCanvas: (nodes: CanvasNode[], edges: CineEdge[], viewport: Viewport) => void
  setBoxSelecting: (value: boolean) => void
  setViewport: (viewport: Viewport) => void
  onNodesChange: (changes: NodeChange<CanvasNode>[]) => void
  onEdgesChange: (changes: EdgeChange<CineEdge>[]) => void
  onConnect: (connection: Connection | { source: string; target: string }) => void
  addNode: (kind: NodeKind, position: XYPosition) => string
  addAssetNodes: (
    kind: NodeKind,
    origin: XYPosition,
    assets: GeneratedAsset[],
    titlePrefix: string,
    sourceNodeId?: string,
    layout?: AddAssetLayout
  ) => string[]
  createGroupFromNodes: (
    nodeIds: string[],
    options?: CreateGroupOptions
  ) => string | null
  applyOutput: (nodeId: string, asset: GeneratedAsset, op?: string) => void
  patchNodeData: (nodeId: string, patch: Partial<CineNodeData>) => void
  resizeNode: (nodeId: string, height: number) => void
  removeNode: (id: string) => void
  clearSelection: () => void
  arrangeNodes: () => void
  pushHistory: () => void
  undo: () => void
  redo: () => void
  copySelection: () => number
  pasteNodes: (position?: XYPosition) => number
  duplicateSelection: () => number
  removeSelection: () => number
  groupSelection: () => string | null
  mergeSelection: () => string | null
  createStoryboard: () => string | null
  arrangeStoryboard: (groupId: string) => void
  setGroupMode: (groupId: string, mode: GroupMode) => void
  setStoryboardGrid: (groupId: string, cols: number, rows: number) => void
  setStoryboardRatio: (groupId: string, ratio: GroupRatio) => void
  toggleStoryboardIndex: (groupId: string) => void
  clearGroupChildren: (groupId: string) => number
  ungroup: (groupId: string) => void
  deleteGroupWithChildren: (groupId: string) => number
  renameGroup: (groupId: string, title: string) => void
  setGroupColor: (groupId: string, color: GroupColor) => void
  arrangeGroup: (groupId: string, mode: GroupArrangeMode) => void
  detachNode: (nodeId: string) => void
  syncGroupBounds: (groupId: string) => void
}

let seq = 0

function nextId(prefix: string): string {
  seq += 1
  return `${prefix}_${Date.now().toString(36)}_${seq}`
}
interface NodeRect {
  x: number
  y: number
  width: number
  height: number
}

function overlaps(a: NodeRect, b: NodeRect, gap: number): boolean {
  return !(
    a.x + a.width + gap <= b.x ||
    b.x + b.width + gap <= a.x ||
    a.y + a.height + gap <= b.y ||
    b.y + b.height + gap <= a.y
  )
}

function findFreeOrigin(
  nodes: CanvasNode[],
  origin: XYPosition,
  width: number,
  height: number,
  gap: number
): XYPosition {
  let y = origin.y
  const candidates = nodes.filter((node) => !isGroupNode(node))

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate: NodeRect = { x: origin.x, y, width, height }
    const hit = candidates.find((node) => {
      const size = nodeSize(node)
      return overlaps(
        candidate,
        {
          x: node.position.x,
          y: node.position.y,
          width: size.width,
          height: size.height
        },
        gap
      )
    })

    if (!hit) return { x: origin.x, y }

    y = hit.position.y + nodeSize(hit).height + gap
  }

  return { x: origin.x, y }
}


interface GroupBounds {
  x: number
  y: number
  width: number
  height: number
}

function childrenOf(nodes: CanvasNode[], groupId: string): CanvasNode[] {
  return nodes.filter((node) => node.parentId === groupId)
}

export function absolutePosition(
  node: CanvasNode,
  nodes: CanvasNode[]
): XYPosition {
  let x = node.position.x
  let y = node.position.y
  let parentId = node.parentId

  for (let depth = 0; depth < 8 && parentId; depth += 1) {
    const parent = nodes.find((entry) => entry.id === parentId)
    if (!parent) break
    x += parent.position.x
    y += parent.position.y
    parentId = parent.parentId
  }

  return { x, y }
}

function contentBounds(children: CanvasNode[], nodes: CanvasNode[]): GroupBounds {
  const rects = children.map((child) => {
    const size = nodeSize(child)
    const absolute = absolutePosition(child, nodes)
    return { x: absolute.x, y: absolute.y, ...size }
  })

  const minX = Math.min(...rects.map((rect) => rect.x))
  const minY = Math.min(...rects.map((rect) => rect.y))
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width))
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height))

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  }
}

function defaultGroupSize(index: number): GroupBounds {
  return { x: 0, y: 0, width: 320 + index * 24, height: 200 + index * 24 }
}

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  hydrated: false,
  past: [],
  future: [],
  clipboard: null,
  boxSelecting: false,

  setBoxSelecting: (value) => {
    set({ boxSelecting: value })
  },

  loadCanvas: (nodes, edges, viewport) => {
    const groupIds = new Set<string>()
    const migrated = nodes.map((node) => {
      if (isGroupNode(node)) return node
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
      edges,
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

  setViewport: (viewport) => {
    set({ viewport })
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
    set({ edges: applyEdgeChanges(changes, get().edges) })
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

  addAssetNodes: (kind, origin, assets, titlePrefix, sourceNodeId, layout) => {
    if (assets.length === 0) return []

    get().pushHistory()

    const meta = NODE_META[kind]
    const gap = GROUP_GAP
    const columns = Math.max(1, Math.round(layout?.columns ?? 3))
    const width = Math.max(1, Math.round(layout?.cellWidth ?? meta.width))
    const heights = assets.map((asset) => {
      const ratio =
        asset.width && asset.height
          ? asset.height / asset.width
          : meta.height / meta.width
      return Math.round(width * ratio) + TITLE_HEIGHT
    })
    const rowHeights: number[] = []
    heights.forEach((height, index) => {
      const row = Math.floor(index / columns)
      rowHeights[row] = Math.max(rowHeights[row] ?? 0, height)
    })
    const rows = rowHeights.length
    const contentWidth = columns * width + (columns - 1) * gap
    const contentHeight =
      rowHeights.reduce((sum, height) => sum + height, 0) +
      Math.max(0, rows - 1) * gap
    const grouped = Boolean(layout?.groupTitle)
    const outerWidth = grouped ? contentWidth + GROUP_PADDING * 2 : contentWidth
    const outerHeight = grouped
      ? contentHeight + GROUP_HEADER_HEIGHT + GROUP_PADDING
      : contentHeight
    const start = findFreeOrigin(get().nodes, origin, outerWidth, outerHeight, gap)
    const ids: string[] = []
    const groupId = grouped ? nextId('group') : null
    const groupCount = get().nodes.filter(isGroupNode).length

    const created: CineNode[] = assets.map((asset, index) => {
      const id = nextId(kind)
      ids.push(id)

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
        hasAudio: asset.hasAudio
      }

      const column = index % columns
      const row = Math.floor(index / columns)
      const rowOffset =
        rowHeights.slice(0, row).reduce((sum, height) => sum + height, 0) +
        row * gap
      const position = grouped
        ? {
            x: GROUP_PADDING + column * (width + gap),
            y: GROUP_HEADER_HEIGHT + rowOffset
          }
        : {
            x: start.x + column * (width + gap),
            y: start.y + rowOffset
          }

      return {
        id,
        type: 'cine',
        ...(groupId ? { parentId: groupId } : {}),
        position,
        selected: false,
        ...(groupId ? { zIndex: 1 } : {}),
        data: {
          kind,
          title: `${titlePrefix} ${index + 1}`,
          status: 'done',
          outputs: [output],
          selectedOutputId: output.id,
          templates: meta.templates
        },
        style: { width, height: heights[index] }
      }
    })

    const group: GroupNode | null =
      grouped && groupId
        ? {
            id: groupId,
            type: 'group',
            position: start,
            data: {
              title: layout?.groupTitle ?? `分组 ${groupCount + 1}`,
              color: layout?.groupColor ?? 'blue'
            },
            style: { width: outerWidth, height: outerHeight },
            selected: true,
            zIndex: 0
          }
        : null

    const createdEdges: CineEdge[] = sourceNodeId
      ? created.map((node) => ({
          id: nextId('edge'),
          source: sourceNodeId,
          target: node.id,
          type: 'flow',
          data: { role: 'auto' }
        }))
      : []

    set({
      nodes: [
        ...(group
          ? get().nodes.map((node) => ({ ...node, selected: false }))
          : get().nodes),
        ...(group ? [group] : []),
        ...created
      ],
      edges: [...get().edges, ...createdEdges]
    })
    return ids
  },
  createGroupFromNodes: (nodeIds, options) => {
    const all = get().nodes
    const wanted = new Set(nodeIds)
    const targets = all.filter(
      (node) => wanted.has(node.id) && !isGroupNode(node) && !node.parentId
    )
    if (targets.length < 2) return null

    get().pushHistory()

    const columns = Math.max(
      1,
      Math.round(options?.columns ?? Math.ceil(Math.sqrt(targets.length)))
    )
    const sizes = new Map(targets.map((node) => [node.id, nodeSize(node)]))
    const columnWidths: number[] = []
    const rowHeights: number[] = []

    targets.forEach((node, index) => {
      const size = sizes.get(node.id) as { width: number; height: number }
      const column = index % columns
      const row = Math.floor(index / columns)
      columnWidths[column] = Math.max(columnWidths[column] ?? 0, size.width)
      rowHeights[row] = Math.max(rowHeights[row] ?? 0, size.height)
    })

    const contentWidth =
      columnWidths.reduce((sum, value) => sum + value, 0) +
      Math.max(0, columns - 1) * GROUP_GAP
    const contentHeight =
      rowHeights.reduce((sum, value) => sum + value, 0) +
      Math.max(0, rowHeights.length - 1) * GROUP_GAP

    const absolute = new Map(
      targets.map((node) => [node.id, absolutePosition(node, all)])
    )
    const minX = Math.min(...targets.map((node) => absolute.get(node.id)!.x))
    const minY = Math.min(...targets.map((node) => absolute.get(node.id)!.y))

    const groupId = nextId('group')
    const groupCount = all.filter(isGroupNode).length

    const positions = new Map<string, XYPosition>()
    let y = GROUP_HEADER_HEIGHT
    rowHeights.forEach((rowHeight, row) => {
      let x = GROUP_PADDING
      for (let column = 0; column < columns; column += 1) {
        const node = targets[row * columns + column]
        if (!node) break
        const size = sizes.get(node.id) as { width: number; height: number }
        positions.set(node.id, {
          x: x + (columnWidths[column] - size.width) / 2,
          y: y + (rowHeight - size.height) / 2
        })
        x += columnWidths[column] + GROUP_GAP
      }
      y += rowHeight + GROUP_GAP
    })

    const group: GroupNode = {
      id: groupId,
      type: 'group',
      position: {
        x: minX - GROUP_PADDING,
        y: minY - GROUP_HEADER_HEIGHT
      },
      data: {
        title: options?.title ?? `分组 ${groupCount + 1}`,
        color: options?.color ?? 'blue'
      },
      style: {
        width: contentWidth + GROUP_PADDING * 2,
        height: contentHeight + GROUP_HEADER_HEIGHT + GROUP_PADDING
      },
      selected: true,
      zIndex: 0
    }

    const ids = new Set(targets.map((node) => node.id))
    const nodes = all.map((node) => {
      if (ids.has(node.id)) {
        return {
          ...node,
          parentId: groupId,
          position: positions.get(node.id) ?? node.position,
          zIndex: 1,
          selected: false
        }
      }
      return { ...node, selected: false }
    })

    set({ nodes: [group, ...nodes] })
    return groupId
  },
  applyOutput: (nodeId, asset, op) => {
    const node = get().nodes.find((entry) => entry.id === nodeId)
    if (!node || isGroupNode(node)) return

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
        if (entry.id !== nodeId || isGroupNode(entry)) return entry
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
        if (node.id !== nodeId || isGroupNode(node)) return node
        return { ...node, data: { ...node.data, ...patch } }
      })
    })
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

  arrangeNodes: () => {
    get().pushHistory()

    const gap = 48
    const maxWidth = 1400
    let x = 0
    let y = 0
    let rowHeight = 0

    const nodes = get().nodes.map((node) => {
      if (isGroupNode(node) || node.parentId) return node

      const { width, height } = nodeSize(node)

      if (x > 0 && x + width > maxWidth) {
        x = 0
        y += rowHeight + gap
        rowHeight = 0
      }

      const position = { x, y }
      x += width + gap
      rowHeight = Math.max(rowHeight, height)
      return { ...node, position }
    })

    set({ nodes })
  },

  pushHistory: () => {
    const { nodes, edges, past } = get()
    const next = [...past, cloneSnapshot(nodes, edges)]
    if (next.length > HISTORY_LIMIT) next.shift()
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
    const selected = get().nodes.filter((node) => node.selected)
    if (selected.length === 0) return 0

    const ids = new Set(selected.map((node) => node.id))
    const edges = get().edges.filter(
      (edge) => ids.has(edge.source) && ids.has(edge.target)
    )

    set({ clipboard: structuredClone({ nodes: selected, edges }) })
    return selected.length
  },

  pasteNodes: (position) => {
    const clipboard = get().clipboard
    if (!clipboard || clipboard.nodes.length === 0) return 0

    get().pushHistory()

    const stamp = Date.now().toString(36)
    const idMap = new Map<string, string>()
    const bounds = clipboard.nodes.map((node) => {
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

    clipboard.nodes.forEach((node, index) => {
      const prefix = isGroupNode(node) ? 'group' : node.data.kind
      idMap.set(node.id, `${prefix}_${stamp}_${index + 1}`)
    })

    const pastedNodes = clipboard.nodes.map((node) => {
      const id = idMap.get(node.id) as string
      const copiedParent = node.parentId ? idMap.has(node.parentId) : false

      return {
        ...structuredClone(node),
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

    const pastedEdges = clipboard.edges.map((edge, index) => ({
      ...structuredClone(edge),
      id: `edge_${stamp}_${index + 1}`,
      source: idMap.get(edge.source) ?? edge.source,
      target: idMap.get(edge.target) ?? edge.target,
      selected: false
    }))

    set({
      nodes: [
        ...get().nodes.map((node) => ({ ...node, selected: false })),
        ...pastedNodes
      ],
      edges: [...get().edges, ...pastedEdges]
    })

    return pastedNodes.length
  },

  duplicateSelection: () => {
    const allNodes = get().nodes
    const selected = allNodes.filter((node) => node.selected)
    if (selected.length === 0) return 0

    const ids = new Set(selected.map((node) => node.id))
    for (const node of selected) {
      if (!isGroupNode(node)) continue
      for (const child of childrenOf(allNodes, node.id)) ids.add(child.id)
    }

    const expanded = allNodes.filter((node) => ids.has(node.id))
    const internalEdges = get().edges.filter(
      (edge) => ids.has(edge.source) && ids.has(edge.target)
    )

    get().pushHistory()

    const stamp = Date.now().toString(36)
    const idMap = new Map<string, string>()

    expanded.forEach((node, index) => {
      const prefix = isGroupNode(node) ? 'group' : node.data.kind
      idMap.set(node.id, `${prefix}_${stamp}_${index + 1}`)
    })

    const clones = expanded.map((node) => {
      const id = idMap.get(node.id) as string
      const copiedParent = node.parentId ? idMap.has(node.parentId) : false
      const parentId = node.parentId
        ? idMap.get(node.parentId) ?? node.parentId
        : undefined

      return {
        ...structuredClone(node),
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

    const clonedEdges = internalEdges.map((edge, index) => ({
      ...structuredClone(edge),
      id: `edge_${stamp}_${index + 1}`,
      source: idMap.get(edge.source) ?? edge.source,
      target: idMap.get(edge.target) ?? edge.target,
      selected: false
    }))

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

  groupSelection: () => {
    const all = get().nodes
    const selected = all.filter(
      (node) => node.selected && !isGroupNode(node) && !node.parentId
    )
    if (selected.length < 2) return null

    get().pushHistory()

    const absolute = selected.map((node) => {
      const size = nodeSize(node)
      const position = absolutePosition(node, all)
      return { node, position, size }
    })

    const minX = Math.min(...absolute.map((item) => item.position.x))
    const minY = Math.min(...absolute.map((item) => item.position.y))
    const maxX = Math.max(
      ...absolute.map((item) => item.position.x + item.size.width)
    )
    const maxY = Math.max(
      ...absolute.map((item) => item.position.y + item.size.height)
    )

    const groupX = minX - GROUP_PADDING
    const groupY = minY - GROUP_HEADER_HEIGHT
    const groupWidth = maxX - minX + GROUP_PADDING * 2
    const groupHeight = maxY - minY + GROUP_HEADER_HEIGHT + GROUP_PADDING

    const groupCount = all.filter(isGroupNode).length
    const groupId = nextId('group')

    const group: GroupNode = {
      id: groupId,
      type: 'group',
      position: { x: groupX, y: groupY },
      data: { title: `分组 ${groupCount + 1}`, color: 'blue' },
      style: { width: groupWidth, height: groupHeight },
      selected: true,
      zIndex: 0
    }

    const ids = new Set(selected.map((node) => node.id))

    const nodes: CanvasNode[] = [
      group,
      ...all.map((node) => {
        if (ids.has(node.id)) {
          const absolute = absolutePosition(node, all)
          return {
            ...node,
            parentId: groupId,
            position: {
              x: absolute.x - groupX,
              y: absolute.y - groupY
            },
            zIndex: 1,
            selected: false
          }
        }
        return { ...node, selected: false }
      })
    ]

    set({ nodes })
    return groupId
  },

  mergeSelection: () => {
    const all = get().nodes
    const selected = all.filter((node) => node.selected)
    const selectedGroups = selected.filter(isGroupNode)
    const looseNodes = selected.filter(
      (node) => !isGroupNode(node) && !node.parentId
    )
    if (selectedGroups.length + looseNodes.length < 2) return null

    get().pushHistory()

    const selectedGroupIds = new Set(selectedGroups.map((group) => group.id))
    const moving = all.filter(
      (node) =>
        (!isGroupNode(node) &&
          (selectedGroupIds.has(node.parentId ?? '') ||
            looseNodes.some((loose) => loose.id === node.id))) ||
        selectedGroupIds.has(node.id)
    )
    const contentNodes = moving.filter((node) => !isGroupNode(node))

    const absolute = contentNodes.map((node) => {
      const size = nodeSize(node)
      const position = absolutePosition(node, all)
      return { node, position, size }
    })

    if (absolute.length === 0) {
      const groupCount =
        all.filter(isGroupNode).length - selectedGroups.length
      const size = defaultGroupSize(groupCount)
      const groupId = nextId('group')
      const group: GroupNode = {
        id: groupId,
        type: 'group',
        position: { x: size.x, y: size.y },
        data: { title: `分组 ${groupCount + 1}`, color: 'blue' },
        style: { width: 320, height: 200 },
        selected: true,
        zIndex: 0
      }
      set({
        nodes: [
          group,
          ...all
            .filter((node) => !selectedGroupIds.has(node.id))
            .map((node) => ({ ...node, selected: false }))
        ]
      })
      return groupId
    }

    const minX = Math.min(...absolute.map((item) => item.position.x))
    const minY = Math.min(...absolute.map((item) => item.position.y))
    const maxX = Math.max(
      ...absolute.map((item) => item.position.x + item.size.width)
    )
    const maxY = Math.max(
      ...absolute.map((item) => item.position.y + item.size.height)
    )

    const groupCount =
      all.filter(isGroupNode).length - selectedGroups.length
    const groupId = nextId('group')
    const group: GroupNode = {
      id: groupId,
      type: 'group',
      position: {
        x: minX - GROUP_PADDING,
        y: minY - GROUP_HEADER_HEIGHT
      },
      data: { title: `分组 ${groupCount + 1}`, color: 'blue' },
      style: {
        width: maxX - minX + GROUP_PADDING * 2,
        height: maxY - minY + GROUP_HEADER_HEIGHT + GROUP_PADDING
      },
      selected: true,
      zIndex: 0
    }

    const movingIds = new Set(contentNodes.map((node) => node.id))

    const nodes: CanvasNode[] = [
      group,
      ...all
        .filter(
          (node) => !selectedGroupIds.has(node.id) && !isGroupNode(node)
        )
        .map((node) => {
          if (!movingIds.has(node.id)) return { ...node, selected: false }
          const absolute = absolutePosition(node, all)
          return {
            ...node,
            parentId: groupId,
            position: {
              x: absolute.x - group.position.x,
              y: absolute.y - group.position.y
            },
            zIndex: 1,
            selected: false
          }
        })
    ]

    set({ nodes })
    return groupId
  },

  createStoryboard: () => {
    const all = get().nodes
    const selected = all.filter((node) => node.selected)
    const images = selected.filter(
      (node) =>
        !isGroupNode(node) && !node.parentId && node.data.kind === 'image'
    )

    if (
      selected.length !== images.length ||
      images.length < 2 ||
      images.length > STORYBOARD_MAX_NODES
    ) {
      return null
    }

    get().pushHistory()

    const ratio: GroupRatio = '16:9'
    const count = images.length
    const cols = count <= 3 ? count : Math.ceil(Math.sqrt(count))
    const rows = Math.ceil(count / cols)
    const cellHeight = Math.round(STORYBOARD_CELL_WIDTH / GROUP_RATIO_VALUE[ratio])
    const nodeHeight = cellHeight + TITLE_HEIGHT

    const minX = Math.min(...images.map((node) => node.position.x))
    const minY = Math.min(...images.map((node) => node.position.y))
    const groupX = minX - GROUP_PADDING
    const groupY = minY - GROUP_HEADER_HEIGHT

    const storyboardCount = all.filter(
      (node) => isGroupNode(node) && node.data.mode === 'storyboard'
    ).length
    const groupId = nextId('group')

    const group: GroupNode = {
      id: groupId,
      type: 'group',
      position: { x: groupX, y: groupY },
      data: {
        title: `分镜组 ${storyboardCount + 1}`,
        color: 'violet',
        mode: 'storyboard',
        ratio,
        gridCols: cols,
        gridRows: rows,
        showIndex: true
      },
      style: {
        width:
          GROUP_PADDING * 2 +
          cols * STORYBOARD_CELL_WIDTH +
          (cols - 1) * STORYBOARD_GAP,
        height:
          GROUP_HEADER_HEIGHT +
          GROUP_PADDING +
          rows * nodeHeight +
          (rows - 1) * STORYBOARD_GAP
      },
      selected: true,
      zIndex: 0
    }

    const order = new Map(images.map((node, index) => [node.id, index]))
    const ids = new Set(images.map((node) => node.id))

    const nodes: CanvasNode[] = [
      group,
      ...all
        .filter((node) => !ids.has(node.id))
        .map((node) => ({ ...node, selected: false })),
      ...images.map((node) => {
        const index = order.get(node.id) as number
        const col = index % cols
        const row = Math.floor(index / cols)
        return {
          ...node,
          parentId: groupId,
          position: {
            x: GROUP_PADDING + col * (STORYBOARD_CELL_WIDTH + STORYBOARD_GAP),
            y: GROUP_HEADER_HEIGHT + row * (nodeHeight + STORYBOARD_GAP)
          },
          style: {
            ...node.style,
            width: STORYBOARD_CELL_WIDTH,
            height: nodeHeight
          },
          zIndex: 1,
          selected: false
        }
      })
    ]

    set({ nodes })
    return groupId
  },

  arrangeStoryboard: (groupId) => {
    const all = get().nodes
    const group = all.find((node) => node.id === groupId)
    if (!group || !isGroupNode(group)) return

    const children = childrenOf(all, groupId)
    if (children.length === 0) return

    const ratio = group.data.ratio ?? '16:9'
    const cols = Math.max(1, group.data.gridCols ?? 2)
    const rows = Math.max(1, group.data.gridRows ?? Math.ceil(children.length / cols))
    const cellHeight = Math.round(STORYBOARD_CELL_WIDTH / GROUP_RATIO_VALUE[ratio])
    const nodeHeight = cellHeight + TITLE_HEIGHT

    const positions = new Map<string, XYPosition>()
    children.forEach((child, index) => {
      const col = index % cols
      const row = Math.floor(index / cols)
      positions.set(child.id, {
        x: GROUP_PADDING + col * (STORYBOARD_CELL_WIDTH + STORYBOARD_GAP),
        y: GROUP_HEADER_HEIGHT + row * (nodeHeight + STORYBOARD_GAP)
      })
    })

    const nodes = all.map((node) => {
      if (node.id === groupId) {
        return {
          ...node,
          style: {
            ...node.style,
            width:
              GROUP_PADDING * 2 +
              cols * STORYBOARD_CELL_WIDTH +
              (cols - 1) * STORYBOARD_GAP,
            height:
              GROUP_HEADER_HEIGHT +
              GROUP_PADDING +
              rows * nodeHeight +
              (rows - 1) * STORYBOARD_GAP
          }
        }
      }

      const position = positions.get(node.id)
      if (!position) return node

      return {
        ...node,
        position,
        style: { ...node.style, width: STORYBOARD_CELL_WIDTH, height: nodeHeight }
      }
    })

    set({ nodes })
  },

  setGroupMode: (groupId, mode) => {
    const all = get().nodes
    const group = all.find((node) => node.id === groupId)
    if (!group || !isGroupNode(group)) return

    get().pushHistory()

    set({
      nodes: all.map((node) =>
        node.id === groupId && isGroupNode(node)
          ? {
              ...node,
              data: {
                ...node.data,
                mode,
                ratio: node.data.ratio ?? '16:9',
                gridCols: node.data.gridCols ?? 2,
                gridRows:
                  node.data.gridRows ??
                  Math.ceil(
                    childrenOf(all, groupId).length /
                      Math.max(1, node.data.gridCols ?? 2)
                  ),
                showIndex: node.data.showIndex ?? true
              }
            }
          : node
      )
    })

    if (mode === 'storyboard') get().arrangeStoryboard(groupId)
  },

  setStoryboardGrid: (groupId, cols, rows) => {
    const all = get().nodes
    const group = all.find((node) => node.id === groupId)
    if (!group || !isGroupNode(group)) return

    get().pushHistory()

    set({
      nodes: all.map((node) =>
        node.id === groupId && isGroupNode(node)
          ? {
              ...node,
              data: {
                ...node.data,
                gridCols: Math.min(10, Math.max(1, Math.round(cols))),
                gridRows: Math.min(10, Math.max(1, Math.round(rows)))
              }
            }
          : node
      )
    })

    get().arrangeStoryboard(groupId)
  },

  setStoryboardRatio: (groupId, ratio) => {
    const all = get().nodes
    const group = all.find((node) => node.id === groupId)
    if (!group || !isGroupNode(group)) return

    get().pushHistory()

    set({
      nodes: all.map((node) =>
        node.id === groupId && isGroupNode(node)
          ? { ...node, data: { ...node.data, ratio } }
          : node
      )
    })

    get().arrangeStoryboard(groupId)
  },

  toggleStoryboardIndex: (groupId) => {
    set({
      nodes: get().nodes.map((node) =>
        node.id === groupId && isGroupNode(node)
          ? {
              ...node,
              data: { ...node.data, showIndex: !node.data.showIndex }
            }
          : node
      )
    })
  },

  clearGroupChildren: (groupId) => {
    const all = get().nodes
    const group = all.find((node) => node.id === groupId)
    if (!group || !isGroupNode(group)) return 0

    const removed = new Set(childrenOf(all, groupId).map((node) => node.id))
    if (removed.size === 0) return 0

    get().pushHistory()

    set({
      nodes: all.filter((node) => !removed.has(node.id)),
      edges: get().edges.filter(
        (edge) => !removed.has(edge.source) && !removed.has(edge.target)
      )
    })

    return removed.size
  },

  ungroup: (groupId) => {
    const all = get().nodes
    const group = all.find((node) => node.id === groupId)
    if (!group || !isGroupNode(group)) return

    get().pushHistory()

    const nodes: CanvasNode[] = all
      .filter((node) => node.id !== groupId)
      .map((node) => {
        if (node.parentId !== groupId) return node
        const { parentId: _removed, zIndex: _z, ...rest } = node
        return {
          ...rest,
          position: absolutePosition(node, all),
          selected: false
        }
      })

    set({ nodes })
  },

  deleteGroupWithChildren: (groupId) => {
    const all = get().nodes
    const group = all.find((node) => node.id === groupId)
    if (!group || !isGroupNode(group)) return 0

    const removed = new Set<string>([groupId])
    for (const child of childrenOf(all, groupId)) removed.add(child.id)

    get().pushHistory()

    set({
      nodes: all.filter((node) => !removed.has(node.id)),
      edges: get().edges.filter(
        (edge) => !removed.has(edge.source) && !removed.has(edge.target)
      )
    })

    return removed.size
  },

  renameGroup: (groupId, title) => {
    set({
      nodes: get().nodes.map((node) =>
        node.id === groupId && isGroupNode(node)
          ? {
              ...node,
              data: {
                ...node.data,
                title: title.trim() || node.data.title
              }
            }
          : node
      )
    })
  },

  setGroupColor: (groupId, color) => {
    set({
      nodes: get().nodes.map((node) =>
        node.id === groupId && isGroupNode(node)
          ? { ...node, data: { ...node.data, color } }
          : node
      )
    })
  },

  arrangeGroup: (groupId, mode) => {
    const all = get().nodes
    const group = all.find((node) => node.id === groupId)
    if (!group || !isGroupNode(group)) return

    const children = childrenOf(all, groupId)
    if (children.length === 0) return

    get().pushHistory()

    const sizes = new Map(
      children.map((child) => [child.id, nodeSize(child)])
    )

    const sorted = [...children].sort((a, b) => {
      if (mode === 'row') {
        if (a.position.y !== b.position.y) return a.position.y - b.position.y
        return a.position.x - b.position.x
      }
      if (a.position.x !== b.position.x) return a.position.x - b.position.x
      return a.position.y - b.position.y
    })

    const columns =
      mode === 'grid' ? Math.ceil(Math.sqrt(sorted.length)) : 1
    const rowHeights: number[] = []

    sorted.forEach((child, index) => {
      const row = Math.floor(index / columns)
      const size = sizes.get(child.id) as { width: number; height: number }
      rowHeights[row] = Math.max(rowHeights[row] ?? 0, size.height)
    })

    const positions = new Map<string, XYPosition>()
    if (mode === 'row') {
      let x = GROUP_PADDING
      const rowHeight = Math.max(
        ...sorted.map((child) => (sizes.get(child.id) as { height: number }).height)
      )
      for (const child of sorted) {
        const size = sizes.get(child.id) as { width: number; height: number }
        positions.set(child.id, { x, y: GROUP_HEADER_HEIGHT + (rowHeight - size.height) / 2 })
        x += size.width + GROUP_GAP
      }
    } else if (mode === 'column') {
      let y = GROUP_HEADER_HEIGHT
      for (const child of sorted) {
        const size = sizes.get(child.id) as { width: number; height: number }
        positions.set(child.id, { x: GROUP_PADDING, y })
        y += size.height + GROUP_GAP
      }
    } else {
      const columnWidths: number[] = []
      sorted.forEach((child, index) => {
        const column = index % columns
        const size = sizes.get(child.id) as { width: number; height: number }
        columnWidths[column] = Math.max(columnWidths[column] ?? 0, size.width)
      })

      let y = GROUP_HEADER_HEIGHT
      for (let row = 0; row < Math.ceil(sorted.length / columns); row += 1) {
        let x = GROUP_PADDING
        for (let column = 0; column < columns; column += 1) {
          const child = sorted[row * columns + column]
          if (!child) break
          const size = sizes.get(child.id) as { width: number; height: number }
          positions.set(child.id, {
            x,
            y: y + (rowHeights[row] - size.height) / 2
          })
          x += (columnWidths[column] ?? 0) + GROUP_GAP
        }
        y += (rowHeights[row] ?? 0) + GROUP_GAP
      }
    }

    const nodes = all.map((node) => {
      const position = positions.get(node.id)
      return position ? { ...node, position } : node
    })

    set({ nodes })
    get().syncGroupBounds(groupId)
  },

  detachNode: (nodeId) => {
    const all = get().nodes
    const node = all.find((entry) => entry.id === nodeId)
    if (!node || !node.parentId) return

    const group = all.find((entry) => entry.id === node.parentId)
    if (!group || !isGroupNode(group)) return

    const size = nodeSize(node)
    const center = {
      x: node.position.x + size.width / 2,
      y: node.position.y + size.height / 2
    }
    const groupSize = nodeSize(group)
    const inside =
      center.x >= 0 &&
      center.y >= 0 &&
      center.x <= groupSize.width &&
      center.y <= groupSize.height

    if (inside) {
      get().syncGroupBounds(group.id)
      return
    }

    const absolute = absolutePosition(node, all)
    const { parentId: _removed, zIndex: _z, ...rest } = node

    set({
      nodes: all.map((entry) =>
        entry.id === nodeId
          ? { ...rest, position: absolute }
          : entry
      )
    })

    get().syncGroupBounds(group.id)
  },

  syncGroupBounds: (groupId) => {
    const all = get().nodes
    const group = all.find((node) => node.id === groupId)
    if (!group || !isGroupNode(group)) return

    const children = childrenOf(all, groupId)
    if (children.length === 0) return

    const bounds = contentBounds(children, all)
    const nextX = bounds.x - GROUP_PADDING
    const nextY = bounds.y - GROUP_HEADER_HEIGHT
    const nextWidth = Math.max(bounds.width + GROUP_PADDING * 2, 120)
    const nextHeight = Math.max(
      bounds.height + GROUP_HEADER_HEIGHT + GROUP_PADDING,
      120
    )

    const moved = {
      ...group,
      position: { x: nextX, y: nextY },
      style: { ...group.style, width: nextWidth, height: nextHeight }
    }

    const delta = {
      x: group.position.x - nextX,
      y: group.position.y - nextY
    }

    const nodes = all.map((node) => {
      if (node.id === groupId) return moved
      if (node.parentId !== groupId) return node
      return {
        ...node,
        position: {
          x: node.position.x + delta.x,
          y: node.position.y + delta.y
        }
      }
    })

    set({ nodes })
  }
}))
// 开发期调试：供 scripts/cdp-*.mjs 访问画布状态
if (import.meta.env.DEV) {
  ;(window as unknown as { __canvasStore?: typeof useCanvasStore }).__canvasStore =
    useCanvasStore
}