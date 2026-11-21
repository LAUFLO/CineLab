import { describe, expect, it } from 'vitest'
import { summarizeCanvasEdge, summarizeCanvasNode } from '../canvas-summary'

describe('canvas summary', () => {
  it('keeps node identity and drops heavy data', () => {
    const summary = summarizeCanvasNode({
      id: 'n1',
      type: 'cine',
      parentId: 'g1',
      position: { x: 10, y: 20 },
      data: {
        kind: 'image',
        title: 'Hero',
        status: 'done',
        outputs: [{ path: 'assets/img/a.png' }],
        prompt: 'very long prompt'
      }
    })

    expect(summary).toEqual({
      id: 'n1',
      type: 'cine',
      kind: 'image',
      title: 'Hero',
      status: 'done',
      parentId: 'g1',
      position: { x: 10, y: 20 }
    })
    expect(summary).not.toHaveProperty('outputs')
    expect(summary).not.toHaveProperty('prompt')
  })

  it('tolerates missing fields', () => {
    expect(summarizeCanvasNode({ id: 'n2' })).toEqual({
      id: 'n2',
      type: '',
      position: { x: 0, y: 0 }
    })
    expect(summarizeCanvasEdge({})).toEqual({
      id: '',
      source: '',
      target: ''
    })
  })

  it('summarizes edges', () => {
    expect(
      summarizeCanvasEdge({ id: 'e1', source: 'a', target: 'b' })
    ).toEqual({ id: 'e1', source: 'a', target: 'b' })
  })
})
