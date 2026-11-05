import { NODE_META, TITLE_HEIGHT } from '@shared/canvas-schema'
import type { CineNode } from '../stores/canvas'

export interface NodeBounds {
  left: number
  top: number
  right: number
  bottom: number
}

export interface AlignmentMatch {
  delta: number
  value: number
}

export interface AlignmentResult {
  dx: number
  dy: number
  vertical: AlignmentMatch | null
  horizontal: AlignmentMatch | null
}

export function boundsOfNode(node: CineNode): NodeBounds {
  const width =
    node.measured?.width ?? node.width ?? NODE_META[node.data.kind].width
  const height =
    node.measured?.height ??
    node.height ??
    NODE_META[node.data.kind].height + TITLE_HEIGHT

  return {
    left: node.position.x,
    top: node.position.y,
    right: node.position.x + width,
    bottom: node.position.y + height
  }
}

export function boundsOfNodes(nodes: CineNode[]): NodeBounds {
  const boxes = nodes.map(boundsOfNode)

  return {
    left: Math.min(...boxes.map((box) => box.left)),
    top: Math.min(...boxes.map((box) => box.top)),
    right: Math.max(...boxes.map((box) => box.right)),
    bottom: Math.max(...boxes.map((box) => box.bottom))
  }
}

export function computeAlignment(
  draggedNodes: CineNode[],
  otherNodes: CineNode[],
  zoom: number
): AlignmentResult {
  if (draggedNodes.length === 0 || otherNodes.length === 0) {
    return { dx: 0, dy: 0, vertical: null, horizontal: null }
  }

  const dragBounds = boundsOfNodes(draggedNodes)
  const threshold = 6 / zoom

  const dragVertical = [
    dragBounds.left,
    (dragBounds.left + dragBounds.right) / 2,
    dragBounds.right
  ]
  const dragHorizontal = [
    dragBounds.top,
    (dragBounds.top + dragBounds.bottom) / 2,
    dragBounds.bottom
  ]

  let vertical: AlignmentMatch | null = null
  let horizontal: AlignmentMatch | null = null

  for (const other of otherNodes) {
    const otherBounds = boundsOfNode(other)
    const otherVertical = [
      otherBounds.left,
      (otherBounds.left + otherBounds.right) / 2,
      otherBounds.right
    ]
    const otherHorizontal = [
      otherBounds.top,
      (otherBounds.top + otherBounds.bottom) / 2,
      otherBounds.bottom
    ]

    for (const dragValue of dragVertical) {
      for (const otherValue of otherVertical) {
        const delta = otherValue - dragValue
        if (
          Math.abs(delta) <= threshold &&
          (!vertical || Math.abs(delta) < Math.abs(vertical.delta))
        ) {
          vertical = { delta, value: otherValue }
        }
      }
    }

    for (const dragValue of dragHorizontal) {
      for (const otherValue of otherHorizontal) {
        const delta = otherValue - dragValue
        if (
          Math.abs(delta) <= threshold &&
          (!horizontal || Math.abs(delta) < Math.abs(horizontal.delta))
        ) {
          horizontal = { delta, value: otherValue }
        }
      }
    }
  }

  return {
    dx: vertical?.delta ?? 0,
    dy: horizontal?.delta ?? 0,
    vertical,
    horizontal
  }
}
