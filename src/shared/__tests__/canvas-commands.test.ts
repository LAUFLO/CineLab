import { describe, expect, it } from 'vitest'
import {
  applyCanvasBatch,
  type CanvasCommandNode
} from '../canvas-commands'

function node(id: string, title: string, x = 0, y = 0): CanvasCommandNode {
  return {
    id,
    type: 'cine',
    position: { x, y },
    data: {
      kind: 'text',
      title,
      status: 'idle',
      templates: []
    }
  }
}

describe('canvas commands', () => {
  it('applies title and move in one batch', () => {
    const start = { nodes: [node('a', '旧标题')], edges: [] }
    const result = applyCanvasBatch(start, [
      { type: 'updateTitle', nodeId: 'a', title: '新标题' },
      { type: 'moveNode', nodeId: 'a', position: { x: 120, y: 80 } }
    ])

    expect(result.nodes[0].position).toEqual({ x: 120, y: 80 })
    expect((result.nodes[0].data as { title: string }).title).toBe('新标题')
    expect(result.change.updatedNodeIds).toEqual(['a'])
    expect(result.change.previousTitles.a).toBe('旧标题')
    expect(result.change.previousPositions.a).toEqual({ x: 0, y: 0 })
  })

  it('keeps the original title when a node is renamed twice', () => {
    const start = { nodes: [node('a', '原始')], edges: [] }
    const result = applyCanvasBatch(start, [
      { type: 'updateTitle', nodeId: 'a', title: '第一次' },
      { type: 'updateTitle', nodeId: 'a', title: '第二次' }
    ])

    expect((result.nodes[0].data as { title: string }).title).toBe('第二次')
    expect(result.change.previousTitles.a).toBe('原始')
  })

  it('removes a node and its connected edges', () => {
    const start = {
      nodes: [node('a', 'A'), node('b', 'B')],
      edges: [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'b', target: 'a' }
      ]
    }
    const result = applyCanvasBatch(start, [{ type: 'removeNode', nodeId: 'a' }])

    expect(result.nodes.map((item) => item.id)).toEqual(['b'])
    expect(result.edges).toEqual([])
    expect(result.change.deletedNodeIds).toEqual(['a'])
    expect(result.change.deletedEdgeIds.sort()).toEqual(['e1', 'e2'])
  })

  it('adds a node and connects it', () => {
    const start = { nodes: [node('a', 'A')], edges: [] }
    const result = applyCanvasBatch(start, [
      { type: 'addNode', node: node('b', 'B', 200, 0) },
      { type: 'connect', edge: { id: 'e1', source: 'a', target: 'b' } }
    ])

    expect(result.nodes).toHaveLength(2)
    expect(result.edges).toHaveLength(1)
    expect(result.change.createdNodeIds).toEqual(['b'])
    expect(result.change.createdEdgeIds).toEqual(['e1'])
  })

  it('warns instead of throwing for a missing node', () => {
    const start = { nodes: [], edges: [] }
    const result = applyCanvasBatch(start, [
      { type: 'updateTitle', nodeId: 'missing', title: 'X' }
    ])

    expect(result.nodes).toEqual([])
    expect(result.warnings[0]).toContain('找不到节点')
  })
})
