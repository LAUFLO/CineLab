// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { useCanvasStore } from '../canvas'

const reset = (): void => {
  useCanvasStore.setState({
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    hydrated: false,
    past: [],
    future: [],
    clipboard: null,
    boxSelecting: false
  })
}

describe('canvas store', () => {
  beforeEach(reset)

  it('adds nodes, connects them, and removes the node edges', () => {
    const store = useCanvasStore.getState()
    const source = store.addNode('image', { x: 0, y: 0 })
    const target = store.addNode('image', { x: 320, y: 0 })

    useCanvasStore.getState().onConnect({ source, target })
    expect(useCanvasStore.getState().edges).toHaveLength(1)

    useCanvasStore.getState().removeNode(source)
    expect(useCanvasStore.getState().nodes).toHaveLength(1)
    expect(useCanvasStore.getState().edges).toHaveLength(0)
  })

  it('groups and ungroups selected nodes', () => {
    const store = useCanvasStore.getState()
    const a = store.addNode('image', { x: 0, y: 0 })
    const b = store.addNode('image', { x: 320, y: 0 })

    const groupId = useCanvasStore.getState().createGroupFromNodes([a, b])
    expect(groupId).toBeTruthy()
    expect(
      useCanvasStore.getState().nodes.some((node) => node.type === 'group')
    ).toBe(true)

    useCanvasStore.getState().ungroup(groupId as string)
    expect(
      useCanvasStore.getState().nodes.some((node) => node.type === 'group')
    ).toBe(false)
  })

  it('undoes and redoes node creation', () => {
    useCanvasStore.getState().addNode('image', { x: 0, y: 0 })
    expect(useCanvasStore.getState().nodes).toHaveLength(1)
    expect(useCanvasStore.getState().past.length).toBeGreaterThan(0)

    useCanvasStore.getState().undo()
    expect(useCanvasStore.getState().nodes).toHaveLength(0)

    useCanvasStore.getState().redo()
    expect(useCanvasStore.getState().nodes).toHaveLength(1)
  })

  it('copies and pastes the selection', () => {
    useCanvasStore.getState().addNode('image', { x: 0, y: 0 })
    expect(useCanvasStore.getState().copySelection()).toBe(1)
    expect(useCanvasStore.getState().clipboard).not.toBeNull()

    expect(useCanvasStore.getState().pasteNodes({ x: 40, y: 40 })).toBe(1)
    expect(useCanvasStore.getState().nodes).toHaveLength(2)
  })
})
