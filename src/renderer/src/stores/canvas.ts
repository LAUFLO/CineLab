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

interface CanvasStore {
  nodes: CineNode[]
  edges: CineEdge[]
  viewport: Viewport
  hydrated: boolean

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

  loadCanvas: (nodes, edges, viewport) => {
    set({ nodes, edges, viewport, hydrated: true })
  },

  setViewport: (viewport) => {
    set({ viewport })
  },

  onNodesChange: (changes) => {
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
    set({
      nodes: get().nodes.filter((node) => node.id !== id),
      edges: get().edges.filter((edge) => edge.source !== id && edge.target !== id)
    })
  },

  clearSelection: () => {
    set({ nodes: get().nodes.map((node) => ({ ...node, selected: false })) })
  },

  arrangeNodes: () => {
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
  }
}))
