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
    width: Number(node.style?.width ?? 360),
    height: Number(node.style?.height ?? 376)
  })
}))

import { fitNodeToMedia } from '../media-size'

function node(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'node-1',
    type: 'cine',
    position: { x: 0, y: 0 },
    data: { kind: 'image', title: '素材', status: 'done', templates: [] },
    style: { width: 360, height: 376 },
    ...overrides
  }
}

describe('fitNodeToMedia', () => {
  beforeEach(() => {
    state.nodes = [node()]
    state.resizeNode.mockReset()
    state.syncGroupBounds.mockReset()
  })

  it('fits height by the media aspect ratio while keeping width', () => {
    expect(
      fitNodeToMedia('node-1', { width: 300, height: 600 })
    ).toBe(748)
    expect(state.resizeNode).toHaveBeenCalledWith('node-1', 748)
  })

  it('clamps extremely tall media', () => {
    expect(
      fitNodeToMedia('node-1', { width: 100, height: 1000 })
    ).toBe(960)
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
