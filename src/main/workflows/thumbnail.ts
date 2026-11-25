import type { WorkflowEdge, WorkflowNode } from '@shared/workflow-schema'

interface Point {
  x: number
  y: number
}

interface Box extends Point {
  width: number
  height: number
}

const CANVAS_WIDTH = 640
const CANVAS_HEIGHT = 360
const PADDING = 20

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function nodeSize(node: WorkflowNode): { width: number; height: number } {
  const style = node.style as { width?: number; height?: number } | undefined
  return {
    width: style?.width ?? 240,
    height: style?.height ?? 160
  }
}

function absolutePosition(
  nodes: WorkflowNode[],
  node: WorkflowNode,
  cache: Map<string, Point>,
  depth = 0
): Point {
  const cached = cache.get(node.id)
  if (cached) return cached

  let point: Point = { x: node.position.x, y: node.position.y }
  const parentId = (node as { parentId?: string }).parentId
  if (parentId && depth < 8) {
    const parent = nodes.find((item) => item.id === parentId)
    if (parent) {
      const parentPoint = absolutePosition(nodes, parent, cache, depth + 1)
      point = {
        x: parentPoint.x + point.x,
        y: parentPoint.y + point.y
      }
    }
  }

  cache.set(node.id, point)
  return point
}

function truncate(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value
}

export function buildWorkflowThumbnail(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): string {
  const cache = new Map<string, Point>()
  const boxes = new Map<string, Box>()

  for (const node of nodes) {
    const point = absolutePosition(nodes, node, cache)
    const size = nodeSize(node)
    boxes.set(node.id, { ...point, ...size })
  }

  const values = [...boxes.values()]
  const minX = values.length ? Math.min(...values.map((box) => box.x)) : 0
  const minY = values.length ? Math.min(...values.map((box) => box.y)) : 0
  const maxX = values.length
    ? Math.max(...values.map((box) => box.x + box.width))
    : 320
  const maxY = values.length
    ? Math.max(...values.map((box) => box.y + box.height))
    : 180
  const contentWidth = Math.max(1, maxX - minX)
  const contentHeight = Math.max(1, maxY - minY)
  const scale = Math.min(
    (CANVAS_WIDTH - PADDING * 2) / contentWidth,
    (CANVAS_HEIGHT - PADDING * 2) / contentHeight,
    1.4
  )
  const offsetX = (CANVAS_WIDTH - contentWidth * scale) / 2 - minX * scale
  const offsetY = (CANVAS_HEIGHT - contentHeight * scale) / 2 - minY * scale

  const project = (box: Box): Box => ({
    x: box.x * scale + offsetX,
    y: box.y * scale + offsetY,
    width: box.width * scale,
    height: box.height * scale
  })

  const edgeLines = edges
    .map((edge) => {
      const source = boxes.get(edge.source)
      const target = boxes.get(edge.target)
      if (!source || !target) return ''
      const from = project(source)
      const to = project(target)
      return `<line x1="${from.x + from.width / 2}" y1="${from.y + from.height / 2}" x2="${to.x + to.width / 2}" y2="${to.y + to.height / 2}" stroke="#94a3b8" stroke-width="1.5" />`
    })
    .join('')

  const nodeShapes = [...boxes.entries()]
    .map(([id, box]) => {
      const node = nodes.find((item) => item.id === id)
      if (!node) return ''
      const shifted = project(box)
      const title = truncate(
        String((node.data as { title?: string }).title ?? '节点'),
        16
      )
      return [
        `<rect x="${shifted.x.toFixed(1)}" y="${shifted.y.toFixed(1)}" width="${shifted.width.toFixed(1)}" height="${shifted.height.toFixed(1)}" rx="6" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5" />`,
        `<text x="${(shifted.x + 8).toFixed(1)}" y="${(shifted.y + 18).toFixed(1)}" font-family="sans-serif" font-size="12" fill="#334155">${escapeXml(title)}</text>`
      ].join('')
    })
    .join('')

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}">`,
    `<rect width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" fill="#f8fafc" />`,
    edgeLines,
    nodeShapes,
    '</svg>'
  ].join('')
}
