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
  NODE_META,
  TITLE_HEIGHT,
  type CineNodeData,
  type NodeKind,
  type OutputRef
} from '@shared/canvas-schema'
import type { GeneratedAsset } from '@shared/generation'

export type CineNode = Node<CineNodeData, 'cine'>
export type CineEdge = Edge

interface Snapshot {
  nodes: CineNode[]
  edges: CineEdge[]
}

interface NodeClipboard {
  nodes: CineNode[]
  edges: CineEdge[]
}

const HISTORY_LIMIT = 60

function cloneSnapshot(nodes: CineNode[], edges: CineEdge[]): Snapshot {
  return structuredClone({ nodes, edges })
}

interface CanvasStore {
  nodes: CineNode[]
  edges: CineEdge[]
  viewport: Viewport
  hydrated: boolean
  past: Snapshot[]
  future: Snapshot[]
  clipboard: NodeClipboard | null

  loadCanvas: (nodes: CineNode[], edges: CineEdge[], viewport: Viewport) => void
  setViewport: (viewport: Viewport) => void
  onNodesChange: (changes: NodeChange<CineNode>[]) => void
  onEdgesChange: (changes: EdgeChange<CineEdge>[]) => void
  onConnect: (connection: Connection | { source: string; target: string }) => void
  addNode: (kind: NodeKind, position: XYPosition) => string
  addAssetNodes: (
    kind: NodeKind,
    origin: XYPosition,
    assets: GeneratedAsset[],
    titlePrefix: string,
    sourceNodeId?: string
  ) => string[]
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
  nodes: CineNode[],
  origin: XYPosition,
  width: number,
  height: number,
  gap: number
): XYPosition {
  let y = origin.y

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate: NodeRect = { x: origin.x, y, width, height }
    const hit = nodes.find((node) => {
      const nodeWidth = node.measured?.width ?? NODE_META[node.data.kind].width
      const nodeHeight =
        node.measured?.height ?? NODE_META[node.data.kind].height + TITLE_HEIGHT
      return overlaps(
        candidate,
        {
          x: node.position.x,
          y: node.position.y,
          width: nodeWidth,
          height: nodeHeight
        },
        gap
      )
    })

    if (!hit) return { x: origin.x, y }

    const hitHeight =
      hit.measured?.height ?? NODE_META[hit.data.kind].height + TITLE_HEIGHT
    y = hit.position.y + hitHeight + gap
  }

  return { x: origin.x, y }
}


export const useCanvasStore = create<CanvasStore>((set, get) => ({
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  hydrated: false,
  past: [],
  future: [],
  clipboard: null,

  loadCanvas: (nodes, edges, viewport) => {
    set({
      nodes,
      edges,
      viewport,
      hydrated: true,
      past: [],
      future: [],
      clipboard: null
    })
  },

  setViewport: (viewport) => {
    set({ viewport })
  },

  onNodesChange: (changes) => {
    if (changes.some((change) => change.type === 'remove')) {
      get().pushHistory()
    }

    const nodes = applyNodeChanges(changes, get().nodes)
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

  addAssetNodes: (kind, origin, assets, titlePrefix, sourceNodeId) => {
    if (assets.length === 0) return []

    get().pushHistory()

    const meta = NODE_META[kind]
    const gap = 24
    const columns = 3
    const first = assets[0]
    const ratio =
      first?.width && first?.height
        ? first.height / first.width
        : meta.height / meta.width
    const nodeHeight = Math.round(meta.width * ratio) + TITLE_HEIGHT
    const colStep = meta.width + gap
    const rowStep = nodeHeight + gap
    const rows = Math.ceil(assets.length / columns)
    const groupWidth = columns * meta.width + (columns - 1) * gap
    const groupHeight = rows * nodeHeight + (rows - 1) * gap
    const start = findFreeOrigin(get().nodes, origin, groupWidth, groupHeight, gap)
    const ids: string[] = []

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

      return {
        id,
        type: 'cine',
        position: {
          x: start.x + (index % columns) * colStep,
          y: start.y + Math.floor(index / columns) * rowStep
        },
        selected: false,
        data: {
          kind,
          title: `${titlePrefix} ${index + 1}`,
          status: 'done',
          outputs: [output],
          selectedOutputId: output.id,
          templates: meta.templates
        },
        style: { width: meta.width, height: nodeHeight }
      }
    })

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
      nodes: [...get().nodes, ...created],
      edges: [...get().edges, ...createdEdges]
    })
    return ids
  },
  applyOutput: (nodeId, asset, op) => {
    const node = get().nodes.find((entry) => entry.id === nodeId)
    if (!node) return

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
      nodes: get().nodes.map((entry) =>
        entry.id === nodeId
          ? {
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
          : entry
      )
    })
  },
  patchNodeData: (nodeId, patch) => {
    set({
      nodes: get().nodes.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, ...patch } }
          : node
      )
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
      const width = node.measured?.width ?? NODE_META[node.data.kind].width
      const height =
        node.measured?.height ?? NODE_META[node.data.kind].height + TITLE_HEIGHT

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
    const bounds = clipboard.nodes.map((node) => ({
      x: node.position.x,
      y: node.position.y,
      width: node.measured?.width ?? NODE_META[node.data.kind].width,
      height:
        node.measured?.height ?? NODE_META[node.data.kind].height + TITLE_HEIGHT
    }))
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

    const pastedNodes = clipboard.nodes.map((node, index) => {
      const id = `${node.data.kind}_${stamp}_${index + 1}`
      idMap.set(node.id, id)

      return {
        ...structuredClone(node),
        id,
        position: {
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
    const selected = get().nodes.filter((node) => node.selected)
    if (selected.length === 0) return 0

    const ids = new Set(selected.map((node) => node.id))
    const internalEdges = get().edges.filter(
      (edge) => ids.has(edge.source) && ids.has(edge.target)
    )

    get().pushHistory()

    const stamp = Date.now().toString(36)
    const idMap = new Map<string, string>()

    const clones = selected.map((node, index) => {
      const id = `${node.data.kind}_${stamp}_${index + 1}`
      idMap.set(node.id, id)

      return {
        ...structuredClone(node),
        id,
        position: {
          x: node.position.x + 24,
          y: node.position.y + 24
        },
        selected: true,
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

    return clones.length
  },

  removeSelection: () => {
    const selected = get().nodes.filter((node) => node.selected)
    if (selected.length === 0) return 0

    const ids = new Set(selected.map((node) => node.id))
    get().pushHistory()

    set({
      nodes: get().nodes.filter((node) => !ids.has(node.id)),
      edges: get().edges.filter(
        (edge) => !ids.has(edge.source) && !ids.has(edge.target)
      )
    })

    return ids.size
  }
}))
// 开发期调试：供 scripts/cdp-*.mjs 访问画布状态
if (import.meta.env.DEV) {
  ;(window as unknown as { __canvasStore?: typeof useCanvasStore }).__canvasStore =
    useCanvasStore
}