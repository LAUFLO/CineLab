import type { WorkflowEdge, WorkflowNode } from '@shared/workflow-schema'

interface Point {
  x: number
  y: number
}

interface Box extends Point {
  width: number
  height: number
}

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

/** React Flow 子节点坐标相对父节点，逐层累加得到绝对坐标。 */
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
  const padding = 24
  const width = Math.max(320, Math.ceil(maxX - minX + padding * 2))
  const height = Math.max(180, Math.ceil(maxY - minY + padding * 2))

  const shift = (box: Box): Box => ({
    x: box.x - minX + padding,
    y: box.y - minY + padding,
    width: box.width,
    height: box.height
  })

  const edgeLines = edges
    .map((edge) => {
      const source = boxes.get(edge.source)
      const target = boxes.get(edge.target)
      if (!source || !target) return ''
      const from = shift(source)
      const to = shift(target)
      return `<line x1="${from.x + from.width / 2}" y1="${from.y + from.height / 2}" x2="${to.x + to.width / 2}" y2="${to.y + to.height / 2}" stroke="#94a3b8" stroke-width="1.5" />`
    })
    .join('')

  const nodeShapes = [...boxes.entries()]
    .map(([id, box]) => {
      const node = nodes.find((item) => item.id === id)
      if (!node) return ''
      const shifted = shift(box)
      const title = truncate(
        String((node.data as { title?: string }).title ?? '节点'),
        18
      )
      return [
        `<rect x="${shifted.x}" y="${shifted.y}" width="${shifted.width}" height="${shifted.height}" rx="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5" />`,
        `<text x="${shifted.x + 10}" y="${shifted.y + 22}" font-family="sans-serif" font-size="12" fill="#334155">${escapeXml(title)}</text>`
      ].join('')
    })
    .join('')

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="#f8fafc" />`,
    edgeLines,
    nodeShapes,
    '</svg>'
  ].join('')
}
