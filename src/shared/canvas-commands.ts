import type { Edge, Node, XYPosition } from '@xyflow/react'
import type {
  CineNodeData,
  FilmNodeData,
  GroupNodeData,
  StudioNodeData,
  VideoOpNodeData
} from './canvas-schema'

export type CanvasCommandNode =
  | Node<CineNodeData, 'cine'>
  | Node<StudioNodeData, 'studio'>
  | Node<FilmNodeData, 'film'>
  | Node<VideoOpNodeData, 'video-op'>
  | Node<GroupNodeData, 'group'>

export type CanvasCommandEdge = Edge

export type CanvasCommand =
  | { type: 'updateTitle'; nodeId: string; title: string }
  | { type: 'moveNode'; nodeId: string; position: XYPosition }
  | { type: 'addNode'; node: CanvasCommandNode }
  | { type: 'removeNode'; nodeId: string }
  | { type: 'connect'; edge: CanvasCommandEdge }
  | { type: 'removeEdge'; edgeId: string }

export interface CanvasCommandChange {
  createdNodeIds: string[]
  updatedNodeIds: string[]
  deletedNodeIds: string[]
  createdEdgeIds: string[]
  deletedEdgeIds: string[]
  previousTitles: Record<string, string>
  previousPositions: Record<string, XYPosition>
}

export interface CanvasCommandState {
  nodes: CanvasCommandNode[]
  edges: CanvasCommandEdge[]
}

export interface CanvasCommandResult extends CanvasCommandState {
  change: CanvasCommandChange
  warnings: string[]
}

export function emptyCanvasChange(): CanvasCommandChange {
  return {
    createdNodeIds: [],
    updatedNodeIds: [],
    deletedNodeIds: [],
    createdEdgeIds: [],
    deletedEdgeIds: [],
    previousTitles: {},
    previousPositions: {}
  }
}

function pushUnique(target: string[], value: string): void {
  if (!target.includes(value)) target.push(value)
}

function mergeChange(
  target: CanvasCommandChange,
  next: CanvasCommandChange
): void {
  for (const id of next.createdNodeIds) pushUnique(target.createdNodeIds, id)
  for (const id of next.updatedNodeIds) pushUnique(target.updatedNodeIds, id)
  for (const id of next.deletedNodeIds) pushUnique(target.deletedNodeIds, id)
  for (const id of next.createdEdgeIds) pushUnique(target.createdEdgeIds, id)
  for (const id of next.deletedEdgeIds) pushUnique(target.deletedEdgeIds, id)
  for (const [id, title] of Object.entries(next.previousTitles)) {
    if (!(id in target.previousTitles)) target.previousTitles[id] = title
  }
  for (const [id, position] of Object.entries(next.previousPositions)) {
    if (!(id in target.previousPositions)) {
      target.previousPositions[id] = position
    }
  }
}

export function applyCanvasCommand(
  state: CanvasCommandState,
  command: CanvasCommand
): CanvasCommandResult {
  const change = emptyCanvasChange()
  const warnings: string[] = []

  switch (command.type) {
    case 'updateTitle': {
      const node = state.nodes.find((item) => item.id === command.nodeId)
      if (!node) {
        warnings.push(`找不到节点：${command.nodeId}`)
        return { ...state, change, warnings }
      }
      const title = command.title.trim()
      if (!title) {
        warnings.push('标题不能为空')
        return { ...state, change, warnings }
      }
      const previous = String((node.data as { title?: unknown }).title ?? '')
      if (previous === title) return { ...state, change, warnings }
      change.updatedNodeIds.push(node.id)
      change.previousTitles[node.id] = previous
      return {
        nodes: state.nodes.map((item) =>
          item.id === node.id
            ? ({ ...item, data: { ...item.data, title } } as CanvasCommandNode)
            : item
        ),
        edges: state.edges,
        change,
        warnings
      }
    }

    case 'moveNode': {
      const node = state.nodes.find((item) => item.id === command.nodeId)
      if (!node) {
        warnings.push(`找不到节点：${command.nodeId}`)
        return { ...state, change, warnings }
      }
      const { x, y } = command.position
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        warnings.push('节点位置必须是有限数字')
        return { ...state, change, warnings }
      }
      if (node.position.x === x && node.position.y === y) {
        return { ...state, change, warnings }
      }
      change.updatedNodeIds.push(node.id)
      change.previousPositions[node.id] = { ...node.position }
      return {
        nodes: state.nodes.map((item) =>
          item.id === node.id ? { ...item, position: { x, y } } : item
        ),
        edges: state.edges,
        change,
        warnings
      }
    }

    case 'addNode': {
      if (state.nodes.some((item) => item.id === command.node.id)) {
        warnings.push(`节点已存在：${command.node.id}`)
        return { ...state, change, warnings }
      }
      change.createdNodeIds.push(command.node.id)
      return {
        nodes: [...state.nodes, command.node],
        edges: state.edges,
        change,
        warnings
      }
    }

    case 'removeNode': {
      if (!state.nodes.some((item) => item.id === command.nodeId)) {
        warnings.push(`找不到节点：${command.nodeId}`)
        return { ...state, change, warnings }
      }
      const removedEdges = state.edges.filter(
        (edge) =>
          edge.source === command.nodeId || edge.target === command.nodeId
      )
      for (const edge of removedEdges) pushUnique(change.deletedEdgeIds, edge.id)
      change.deletedNodeIds.push(command.nodeId)
      return {
        nodes: state.nodes.filter((item) => item.id !== command.nodeId),
        edges: state.edges.filter(
          (edge) =>
            edge.source !== command.nodeId && edge.target !== command.nodeId
        ),
        change,
        warnings
      }
    }

    case 'connect': {
      const edge = command.edge
      if (state.edges.some((item) => item.id === edge.id)) {
        warnings.push(`连线已存在：${edge.id}`)
        return { ...state, change, warnings }
      }
      const duplicate = state.edges.some(
        (item) =>
          item.source === edge.source &&
          item.target === edge.target &&
          item.sourceHandle === edge.sourceHandle &&
          item.targetHandle === edge.targetHandle
      )
      if (duplicate) {
        warnings.push('相同的连线已经存在')
        return { ...state, change, warnings }
      }
      change.createdEdgeIds.push(edge.id)
      return {
        nodes: state.nodes,
        edges: [...state.edges, edge],
        change,
        warnings
      }
    }

    case 'removeEdge': {
      if (!state.edges.some((item) => item.id === command.edgeId)) {
        warnings.push(`找不到连线：${command.edgeId}`)
        return { ...state, change, warnings }
      }
      change.deletedEdgeIds.push(command.edgeId)
      return {
        nodes: state.nodes,
        edges: state.edges.filter((item) => item.id !== command.edgeId),
        change,
        warnings
      }
    }

    default:
      warnings.push('未知的画布命令')
      return { ...state, change, warnings }
  }
}

export function applyCanvasBatch(
  state: CanvasCommandState,
  commands: CanvasCommand[]
): CanvasCommandResult {
  let current: CanvasCommandState = state
  const change = emptyCanvasChange()
  const warnings: string[] = []

  for (const command of commands) {
    const result = applyCanvasCommand(current, command)
    current = { nodes: result.nodes, edges: result.edges }
    mergeChange(change, result.change)
    warnings.push(...result.warnings)
  }

  return { ...current, change, warnings }
}
