export interface CanvasNodeSummary {
  id: string
  type: string
  kind?: string
  title?: string
  status?: string
  parentId?: string
  position: { x: number; y: number }
}

export interface CanvasEdgeSummary {
  id: string
  source: string
  target: string
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export function summarizeCanvasNode(node: unknown): CanvasNodeSummary {
  const record = asRecord(node)
  const data = asRecord(record.data)
  const position = asRecord(record.position)

  return {
    id: asString(record.id) ?? '',
    type: asString(record.type) ?? '',
    ...(asString(data.kind) ? { kind: asString(data.kind) } : {}),
    ...(asString(data.title) ? { title: asString(data.title) } : {}),
    ...(asString(data.status) ? { status: asString(data.status) } : {}),
    ...(asString(record.parentId) ? { parentId: asString(record.parentId) } : {}),
    position: {
      x: typeof position.x === 'number' ? position.x : 0,
      y: typeof position.y === 'number' ? position.y : 0
    }
  }
}

export function summarizeCanvasEdge(edge: unknown): CanvasEdgeSummary {
  const record = asRecord(edge)
  return {
    id: asString(record.id) ?? '',
    source: asString(record.source) ?? '',
    target: asString(record.target) ?? ''
  }
}
