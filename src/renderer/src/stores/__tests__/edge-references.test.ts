import { describe, expect, it } from 'vitest'
import { clearEdgeReferences } from '../edge-references'

interface TestNode {
  id: string
  type?: string
  data: Record<string, unknown>
}

function node(partial: TestNode): TestNode {
  return partial
}

function edge(source: string, target: string) {
  return { source, target }
}

describe('clearEdgeReferences', () => {
  it('clears study source when the last upstream edge is removed', () => {
    const nodes = [
      node({
        id: 'study',
        type: 'cine',
        data: {
          sourceNodeId: 'video',
          sourcePath: 'a.mp4',
          sourceName: 'A'
        }
      })
    ]

    const result = clearEdgeReferences(nodes, [], [edge('video', 'study')])
    expect(result[0].data.sourceNodeId).toBeUndefined()
    expect(result[0].data.sourcePath).toBeUndefined()
    expect(result[0].data.sourceName).toBeUndefined()
  })

  it('keeps the source when another edge still links it', () => {
    const nodes = [
      node({
        id: 'study',
        type: 'cine',
        data: { sourceNodeId: 'video' }
      })
    ]

    const result = clearEdgeReferences(
      nodes,
      [edge('video', 'study')],
      [edge('video', 'study')]
    )
    expect(result[0].data.sourceNodeId).toBe('video')
  })

  it('drops studio references for disconnected sources', () => {
    const nodes = [
      node({
        id: 'studio',
        type: 'studio',
        data: { references: { video: 'out-1', other: 'out-2' } }
      })
    ]

    const result = clearEdgeReferences(nodes, [], [edge('video', 'studio')])
    expect(result[0].data.references).toEqual({ other: 'out-2' })
  })

  it('ignores unrelated edges', () => {
    const nodes = [
      node({
        id: 'study',
        type: 'cine',
        data: { sourceNodeId: 'video' }
      })
    ]

    const result = clearEdgeReferences(nodes, [], [edge('other', 'elsewhere')])
    expect(result[0]).toBe(nodes[0])
  })
})
