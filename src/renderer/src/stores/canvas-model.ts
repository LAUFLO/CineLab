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
  type FilmNodeData,
  type FilmStatus,
  type GroupColor,
  type GroupMode,
  type GroupNodeData,
  type GroupRatio,
  type NodeKind,
  type OutputRef,
  type StageNodeData,
  type StudioNodeData,
  type VideoOpNodeData
} from '@shared/canvas-schema'
import { VIDEO_OPERATIONS, type VideoOperationId } from '@shared/operation-schema'
import type { GeneratedAsset } from '@shared/generation'
import type { DirectorStageDoc } from '@shared/stage-schema'
import {
  applyCanvasBatch,
  type CanvasCommand,
  type CanvasCommandChange
} from '@shared/canvas-commands'
import { clearEdgeReferences } from './edge-references'

export type CineNode = Node<CineNodeData, 'cine'>
export type StudioNode = Node<StudioNodeData, 'studio'>
export type StageNode = Node<StageNodeData, 'stage'>
export type FilmNode = Node<FilmNodeData, 'film'>
export type VideoOpNode = Node<VideoOpNodeData, 'video-op'>
export type GroupNode = Node<GroupNodeData, 'group'>
export type CanvasNode =
  | CineNode
  | StudioNode
  | StageNode
  | FilmNode
  | VideoOpNode
  | GroupNode
export type CineEdge = Edge

/** 一轮 Agent 的多个画布命令只压入一条历史记录 */
export const commandTurns = new Set<string>()
/** 直接写 store 的工具批次期间暂停自身的历史压栈，由 beginToolTurn 统一压一条 */


export function isGroupNode(node: CanvasNode): node is GroupNode {
  return node.type === 'group'
}

export function isMediaNode(node: CanvasNode): node is CineNode {
  return node.type === 'cine'
}

export function isStudioNode(node: CanvasNode): node is StudioNode {
  return node.type === 'studio'
}

export function isStageNode(node: CanvasNode): node is StageNode {
  return node.type === 'stage'
}

export function isFilmNode(node: CanvasNode): node is FilmNode {
  return node.type === 'film'
}

export function isVideoOpNode(node: CanvasNode): node is VideoOpNode {
  return node.type === 'video-op'
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

export function nodeOutputs(node: CanvasNode): OutputRef[] {
  return node.type === 'cine' || node.type === 'film' || node.type === 'studio'
    ? node.data.outputs ?? []
    : []
}

export function selectedNodeOutput(node: CanvasNode): OutputRef | null {
  const outputs = nodeOutputs(node)
  const selectedOutputId =
    node.type === 'cine' || node.type === 'film' || node.type === 'studio'
      ? node.data.selectedOutputId
      : undefined
  return (
    outputs.find((output) => output.id === selectedOutputId) ??
    outputs[0] ??
    null
  )
}

export interface Snapshot {
  nodes: CanvasNode[]
  edges: CineEdge[]
}

export interface NodeClipboard {
  nodes: CanvasNode[]
  edges: CineEdge[]
  /** 一端在复制集合内、一端在外部的连线，粘贴时按需重建 */
  boundaryEdges?: CineEdge[]
}

export const HISTORY_LIMIT = 60

export function cloneSnapshot(nodes: CanvasNode[], edges: CineEdge[]): Snapshot {
  // store 的所有更新都保持不可变（未变化的节点/边对象直接复用），
  // 因此快照只需复制数组本身，避免每次操作深拷贝整张画布。
  return { nodes: nodes.slice(), edges: edges.slice() }
}

export type GroupArrangeMode = 'row' | 'column' | 'grid'

export const externalWrite = { depth: 0 }

export interface AddAssetLayout {
  columns?: number
  cellWidth?: number
  groupTitle?: string
  groupColor?: GroupColor
  scope?: 'project' | 'global'
  /** 有分组时只连一条线到分组，而不是逐个连子节点 */
  connectGroup?: boolean
  /** 分组创建后的回调，用于记录分组 id */
  onGroupCreated?: (groupId: string) => void
}

export interface CreateGroupOptions {
  title?: string
  color?: GroupColor
  columns?: number
  allowSingle?: boolean
}

/** 复制/粘贴时把节点内部引用的画布节点 id 映射到新节点 */
export function remapNodeReferences(
  node: CanvasNode,
  idMap: Map<string, string>
): void {
  const mapRef = (id: string): string => idMap.get(id) ?? id

  if (node.type === 'cine') {
    if (node.data.sourceNodeId) {
      node.data.sourceNodeId = mapRef(node.data.sourceNodeId)
    }
    if (node.data.studyOutputNodeIds) {
      node.data.studyOutputNodeIds = node.data.studyOutputNodeIds
        .map((id) => idMap.get(id))
        .filter((id): id is string => Boolean(id))
    }
  }

  if (node.type === 'video-op') {
    node.data.sourceNodeId = mapRef(node.data.sourceNodeId)
    if (node.data.resultNodeId) {
      node.data.resultNodeId = mapRef(node.data.resultNodeId)
    }
  }

  if (node.type === 'studio' && node.data.references) {
    const next: Record<string, string> = {}
    for (const [key, value] of Object.entries(node.data.references)) {
      next[mapRef(key)] = value
    }
    node.data.references = next
  }
}

/**
 * 重建粘贴/复制后的连线：
 * - 两端都在复制集合内：映射到新节点
 * - 只有一端在集合内：另一端保留原节点，前提是它仍存在
 */
export function remapEdges(
  edges: CineEdge[],
  idMap: Map<string, string>,
  liveIds: Set<string>,
  stamp: string
): CineEdge[] {
  const result: CineEdge[] = []

  edges.forEach((edge, index) => {
    const source = idMap.get(edge.source) ?? edge.source
    const target = idMap.get(edge.target) ?? edge.target
    if (source === target) return
    if (!liveIds.has(source) || !liveIds.has(target)) return

    result.push({
      ...structuredClone(edge),
      id: `edge_${stamp}_${index + 1}`,
      source,
      target,
      selected: false
    })
  })

  return result
}

let seq = 0

export function nextId(prefix: string): string {
  seq += 1
  return `${prefix}_${Date.now().toString(36)}_${seq}`
}
export interface NodeRect {
  x: number
  y: number
  width: number
  height: number
}

export function overlaps(a: NodeRect, b: NodeRect, gap: number): boolean {
  return !(
    a.x + a.width + gap <= b.x ||
    b.x + b.width + gap <= a.x ||
    a.y + a.height + gap <= b.y ||
    b.y + b.height + gap <= a.y
  )
}

export function findFreeOrigin(
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


export interface GroupBounds {
  x: number
  y: number
  width: number
  height: number
}

export function childrenOf(nodes: CanvasNode[], groupId: string): CanvasNode[] {
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

export function contentBounds(children: CanvasNode[], nodes: CanvasNode[]): GroupBounds {
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

export function defaultGroupSize(index: number): GroupBounds {
  return { x: 0, y: 0, width: 320 + index * 24, height: 200 + index * 24 }
}
