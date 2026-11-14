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

  it('keeps a shorter history for large canvases', () => {
    useCanvasStore.getState().addNode('image', { x: 0, y: 0 })
    const node = useCanvasStore.getState().nodes[0]
    useCanvasStore.setState({
      nodes: Array.from({ length: 201 }, (_, index) => ({
        ...node,
        id: `large-${index}`
      })),
      past: [],
      future: []
    })

    for (let index = 0; index < 25; index += 1) {
      useCanvasStore.getState().pushHistory()
    }

    expect(useCanvasStore.getState().past.length).toBeLessThanOrEqual(20)
  })

  it('keeps history snapshots stable across immutable updates', () => {
    const id = useCanvasStore.getState().addNode('image', { x: 0, y: 0 })
    useCanvasStore.getState().pushHistory()
    useCanvasStore.getState().patchNodeData(id, { title: 'changed' })

    useCanvasStore.getState().undo()
    expect(useCanvasStore.getState().nodes[0]?.data.title).not.toBe('changed')
  })

  it('undoes a node drag', () => {
    const id = useCanvasStore.getState().addNode('image', { x: 0, y: 0 })
    useCanvasStore.getState().pushHistory()
    useCanvasStore.getState().onNodesChange([
      { id, type: 'position', position: { x: 40, y: 60 }, dragging: false }
    ])
    expect(useCanvasStore.getState().nodes[0]?.position).toEqual({
      x: 40,
      y: 60
    })

    useCanvasStore.getState().undo()
    expect(useCanvasStore.getState().nodes[0]?.position).toEqual({
      x: 0,
      y: 0
    })
  })

  it('copies and pastes the selection', () => {
    useCanvasStore.getState().addNode('image', { x: 0, y: 0 })
    expect(useCanvasStore.getState().copySelection()).toBe(1)
    expect(useCanvasStore.getState().clipboard).not.toBeNull()

    expect(useCanvasStore.getState().pasteNodes({ x: 40, y: 40 })).toBe(1)
    expect(useCanvasStore.getState().nodes).toHaveLength(2)
  })
})
