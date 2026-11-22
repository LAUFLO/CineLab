import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  nodes: [] as Array<Record<string, unknown>>,
  resizeNode: vi.fn(),
  syncGroupBounds: vi.fn()
}))

vi.mock('../../stores/canvas', () => ({
  useCanvasStore: {
    getState: () => state
  },
  nodeSize: (node: { style?: { width?: number; height?: number } }) => ({
    width: Number(node.style?.width ?? 400),
    height: Number(node.style?.height ?? 428)
  })
}))

import { fitNodeToMedia } from '../media-size'

function node(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'node-1',
    type: 'cine',
    position: { x: 0, y: 0 },
    data: {
      kind: 'image',
      title: '素材',
      status: 'done',
      templates: [],
      mediaFrame: 'standard'
    },
    style: { width: 400, height: 428 },
    ...overrides
  }
}

describe('fitNodeToMedia', () => {
  beforeEach(() => {
    state.nodes = [node()]
    state.resizeNode.mockReset()
    state.syncGroupBounds.mockReset()
  })

  it('fits media into the standard 400 box while preserving aspect ratio', () => {
    expect(
      fitNodeToMedia('node-1', { width: 300, height: 600 })
    ).toBe(428)
    expect(state.resizeNode).toHaveBeenCalledWith('node-1', 428, 200)
  })

  it('fits extremely tall media without stretching', () => {
    expect(
      fitNodeToMedia('node-1', { width: 100, height: 1000 })
    ).toBe(428)
    expect(state.resizeNode).toHaveBeenCalledWith('node-1', 428, 40)
  })

  it('uses the compact 240 box for grouped media', () => {
    state.nodes = [
      node({
        data: {
          kind: 'image',
          title: '素材',
          status: 'done',
          templates: [],
          mediaFrame: 'compact'
        }
      })
    ]
    expect(
      fitNodeToMedia('node-1', { width: 1600, height: 900 })
    ).toBe(163)
    expect(state.resizeNode).toHaveBeenCalledWith('node-1', 163, 240)
  })

  it('syncs the parent group after resizing', () => {
    state.nodes = [node({ parentId: 'group-1' })]
    fitNodeToMedia('node-1', { width: 300, height: 600 })
    expect(state.syncGroupBounds).toHaveBeenCalledWith('group-1')
  })

  it('does nothing without media dimensions', () => {
    expect(fitNodeToMedia('node-1', null)).toBeNull()
    expect(state.resizeNode).not.toHaveBeenCalled()
  })
})
