import { describe, expect, it } from 'vitest'
import {
  applyCanvasBatch,
  type CanvasCommandNode,
  type CanvasCommandState
} from '../canvas-commands'

function node(
  id: string,
  title: string,
  x = 0,
  y = 0,
  kind: 'text' | 'image' = 'text',
  text?: string
): CanvasCommandNode {
  return {
    id,
    type: 'cine',
    position: { x, y },
    data: {
      kind,
      title,
      status: 'idle',
      templates: [],
      ...(text !== undefined ? { text } : {})
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

  it('updates text on a text node and records the previous text', () => {
    const start: CanvasCommandState = {
      nodes: [node('a', '文本', 0, 0, 'text', '旧正文')],
      edges: []
    }
    const result = applyCanvasBatch(start, [
      { type: 'updateText', nodeId: 'a', text: '# 新正文' }
    ])

    expect((result.nodes[0].data as { text: string }).text).toBe('# 新正文')
    expect(result.change.updatedNodeIds).toEqual(['a'])
    expect(result.change.previousTexts.a).toBe('旧正文')
  })

  it('refuses to update text on a non-text node', () => {
    const start: CanvasCommandState = {
      nodes: [node('a', '图片', 0, 0, 'image')],
      edges: []
    }
    const result = applyCanvasBatch(start, [
      { type: 'updateText', nodeId: 'a', text: 'X' }
    ])

    expect(result.change.updatedNodeIds).toEqual([])
    expect(result.warnings[0]).toContain('找不到文本节点')
  })

  it('removes an edge without touching nodes', () => {
    const start = {
      nodes: [node('a', 'A'), node('b', 'B')],
      edges: [{ id: 'e1', source: 'a', target: 'b' }]
    }
    const result = applyCanvasBatch(start, [
      { type: 'removeEdge', edgeId: 'e1' }
    ])

    expect(result.edges).toEqual([])
    expect(result.nodes).toHaveLength(2)
    expect(result.change.deletedEdgeIds).toEqual(['e1'])
  })

  it('updates prompt on a generation node', () => {
    const start = { nodes: [node('a', '视频')], edges: [] }
    const result = applyCanvasBatch(start, [
      { type: 'updatePrompt', nodeId: 'a', prompt: '雨夜霓虹街道' }
    ])

    expect((result.nodes[0].data as { prompt?: string }).prompt).toBe(
      '雨夜霓虹街道'
    )
    expect(result.change.updatedNodeIds).toEqual(['a'])
  })

  it('warns when updatePrompt targets a non-cine node', () => {
    const group: CanvasCommandNode = {
      id: 'g',
      type: 'group',
      position: { x: 0, y: 0 },
      data: { title: '分组', color: 'blue' }
    }
    const result = applyCanvasBatch(
      { nodes: [group], edges: [] },
      [{ type: 'updatePrompt', nodeId: 'g', prompt: 'X' }]
    )

    expect(result.warnings[0]).toContain('找不到生成节点')
  })

  it('deselects previous nodes when adding a selected node', () => {
    const start = {
      nodes: [{ ...node('a', 'A'), selected: true }],
      edges: []
    }
    const result = applyCanvasBatch(start, [
      { type: 'addNode', node: { ...node('b', 'B', 200, 0), selected: true } }
    ])

    expect(result.nodes.find((item) => item.id === 'a')?.selected).toBe(false)
    expect(result.nodes.find((item) => item.id === 'b')?.selected).toBe(true)
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
