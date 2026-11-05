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
  type NodeKind
} from '@shared/canvas-schema'

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
}

let seq = 0

function nextId(prefix: string): string {
  seq += 1
  return `${prefix}_${Date.now().toString(36)}_${seq}`
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
  }
}))
