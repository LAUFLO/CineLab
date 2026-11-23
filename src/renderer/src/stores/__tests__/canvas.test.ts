// @vitest-environment jsdom
import { NodeChangeset } from '@xyflow/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { FilmStudy } from '@shared/film-study'
import { useCanvasStore, type CanvasNode } from '../canvas'

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

  it('marks film-study shot outputs as asset only', () => {
    const study: FilmStudy = {
      schemaVersion: 1,
      id: 'study-1',
      sourceNodeId: 'source-1',
      sourcePath: 'source.mp4',
      sourceName: '测试拉片',
      duration: 10,
      fps: 24,
      frameInterval: 1,
      frames: [],
      segments: [],
      shots: [
        {
          index: 1,
          startTime: 0,
          endTime: 2,
          duration: 2,
          firstFrame: 'first.png',
          lastFrame: 'last.png'
        }
      ],
      scenes: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    const ids = useCanvasStore
      .getState()
      .addShotNodes(study, { x: 0, y: 0 })
    const nodes = useCanvasStore
      .getState()
      .nodes.filter((node) => ids.includes(node.id))
    const cineNodes = nodes.filter((node) => node.type === 'cine')

    expect(cineNodes).toHaveLength(3)
    expect(cineNodes.every((node) => node.data.assetOnly === true)).toBe(true)
  })

  it('normalizes legacy media nodes into standard and compact frames', () => {
    const output = (width: number, height: number) => ({
      id: `out-${width}-${height}`,
      path: 'asset.png',
      kind: 'image' as const,
      createdAt: new Date().toISOString(),
      model: '测试',
      width,
      height
    })
    const nodes = [
      {
        id: 'group-1',
        type: 'group',
        position: { x: 0, y: 0 },
        data: { title: '分组', color: 'blue' },
        style: { width: 600, height: 400 }
      },
      {
        id: 'image-1',
        type: 'cine',
        position: { x: 0, y: 0 },
        data: {
          kind: 'image',
          title: '标准图片',
          status: 'done',
          outputs: [output(1280, 720)],
          selectedOutputId: 'out-1280-720',
          templates: []
        },
        style: { width: 360, height: 231 }
      },
      {
        id: 'video-1',
        type: 'cine',
        position: { x: 0, y: 300 },
        data: {
          kind: 'video',
          title: '标准视频',
          status: 'done',
          outputs: [output(1280, 720)],
          selectedOutputId: 'out-1280-720',
          templates: []
        },
        style: { width: 480, height: 298 }
      },
      {
        id: 'image-child',
        type: 'cine',
        parentId: 'group-1',
        position: { x: 20, y: 50 },
        data: {
          kind: 'image',
          title: '组内图片',
          status: 'done',
          outputs: [output(1280, 720)],
          selectedOutputId: 'out-1280-720',
          templates: []
        },
        style: { width: 360, height: 231 }
      },
      {
        id: 'image-ultrawide',
        type: 'cine',
        position: { x: 0, y: 700 },
        data: {
          kind: 'image',
          title: '21:9',
          status: 'done',
          outputs: [output(21, 9)],
          selectedOutputId: 'out-21-9',
          templates: []
        },
        style: { width: 360, height: 150 }
      },
      {
        id: 'image-square',
        type: 'cine',
        position: { x: 0, y: 900 },
        data: {
          kind: 'image',
          title: '1:1',
          status: 'done',
          outputs: [output(1024, 1024)],
          selectedOutputId: 'out-1024-1024',
          templates: []
        },
        style: { width: 360, height: 388 }
      },
      {
        id: 'image-recovered',
        type: 'cine',
        position: { x: 0, y: 1100 },
        data: {
          kind: 'image',
          title: '旧 compact 尺寸',
          status: 'done',
          outputs: [output(1024, 1024)],
          selectedOutputId: 'out-1024-1024',
          templates: []
        },
        style: { width: 135, height: 163 }
      }
    ] as unknown as CanvasNode[]

    useCanvasStore.getState().loadCanvas(nodes, [], { x: 0, y: 0, zoom: 1 })

    const byId = new Map(
      useCanvasStore.getState().nodes.map((node) => [node.id, node])
    )
    expect(byId.get('image-1')?.style).toMatchObject({
      width: 400,
      height: 253
    })
    expect(byId.get('video-1')?.style).toMatchObject({
      width: 400,
      height: 253
    })
    expect(byId.get('image-child')?.style).toMatchObject({
      width: 240,
      height: 163
    })
    expect(byId.get('image-child')?.data.mediaFrame).toBe('compact')
    expect(byId.get('image-ultrawide')?.style).toMatchObject({
      width: 400,
      height: 199
    })
    expect(byId.get('image-square')?.style).toMatchObject({
      width: 225,
      height: 253
    })
    expect(byId.get('image-recovered')?.style).toMatchObject({
      width: 225,
      height: 253
    })
  })

  it('uses standard and compact media frames for inserted assets', () => {
    const asset = {
      id: 'asset-1',
      path: 'asset.png',
      kind: 'image' as const,
      createdAt: new Date().toISOString(),
      model: '测试',
      width: 1600,
      height: 900
    }

    const standardId = useCanvasStore
      .getState()
      .addAssetNodes('image', { x: 0, y: 0 }, [asset], '标准')[0]
    const compactId = useCanvasStore
      .getState()
      .addAssetNodes(
        'image',
        { x: 0, y: 0 },
        [asset],
        '紧凑',
        undefined,
        { columns: 1, cellWidth: 240 },
        true
      )[0]

    const byId = new Map(
      useCanvasStore.getState().nodes.map((node) => [node.id, node])
    )
    expect(byId.get(standardId)?.style).toMatchObject({
      width: 400,
      height: 253
    })
    expect(byId.get(standardId)?.data.mediaFrame).toBe('standard')
    expect(byId.get(compactId)?.style).toMatchObject({
      width: 240,
      height: 163
    })
    expect(byId.get(compactId)?.data.mediaFrame).toBe('compact')
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

  it('accepts node changes as an array', () => {
    const id = useCanvasStore.getState().addNode('image', { x: 0, y: 0 })
    useCanvasStore.getState().onNodesChange([
      { id, type: 'position', position: { x: 40, y: 60 }, dragging: false }
    ])
    expect(useCanvasStore.getState().nodes[0]?.position).toEqual({
      x: 40,
      y: 60
    })
  })

  it('accepts a NodeChangeset instance', () => {
    const id = useCanvasStore.getState().addNode('image', { x: 0, y: 0 })
    useCanvasStore
      .getState()
      .onNodesChange(
        new NodeChangeset<CanvasNode>([
          { id, type: 'position', position: { x: 24, y: 36 }, dragging: false }
        ])
      )
    expect(useCanvasStore.getState().nodes[0]?.position).toEqual({
      x: 24,
      y: 36
    })
  })

  it('keeps group nodes unselected while box selecting', () => {
    const a = useCanvasStore.getState().addNode('image', { x: 0, y: 0 })
    const b = useCanvasStore.getState().addNode('image', { x: 320, y: 0 })
    const groupId = useCanvasStore.getState().createGroupFromNodes([a, b])
    if (!groupId) throw new Error('group not created')

    useCanvasStore.getState().setBoxSelecting(true)
    useCanvasStore.getState().onNodesChange([
      { id: groupId, type: 'select', selected: true },
      { id: a, type: 'select', selected: true }
    ])

    const nodes = useCanvasStore.getState().nodes
    expect(nodes.find((node) => node.id === groupId)?.selected).toBe(false)
    expect(nodes.find((node) => node.id === a)?.selected).toBe(true)
  })

  it('pushes history when a remove change arrives', () => {
    const id = useCanvasStore.getState().addNode('image', { x: 0, y: 0 })
    const before = useCanvasStore.getState().past.length
    useCanvasStore.getState().onNodesChange([{ id, type: 'remove' }])
    expect(useCanvasStore.getState().nodes).toHaveLength(0)
    expect(useCanvasStore.getState().past.length).toBe(before + 1)
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

  it('migrates only old default audio sizes', () => {
    const oldId = useCanvasStore.getState().addNode('audio', { x: 0, y: 0 })
    const customId = useCanvasStore.getState().addNode('audio', { x: 300, y: 0 })
    const nodes = useCanvasStore.getState().nodes.map((node) => {
      if (node.id === oldId) {
        return {
          ...node,
          style: { ...node.style, width: 348, height: 248 }
        }
      }
      if (node.id === customId) {
        return {
          ...node,
          style: { ...node.style, width: 300, height: 200 }
        }
      }
      return node
    })

    useCanvasStore
      .getState()
      .loadCanvas(nodes, [], { x: 0, y: 0, zoom: 1 })

    const result = useCanvasStore.getState().nodes
    expect(result.find((node) => node.id === oldId)?.style).toMatchObject({
      width: 200,
      height: 155
    })
    expect(result.find((node) => node.id === customId)?.style).toMatchObject({
      width: 300,
      height: 200
    })
  })

  it('marks interrupted stem tasks after reload', () => {
    const id = useCanvasStore.getState().addNode('audio', { x: 0, y: 0 })
    useCanvasStore.getState().patchNodeData(id, {
      status: 'running',
      stemTaskId: 'task-1',
      stemMode: 'vocal',
      stemSourceNodeId: 'source-1',
      stemPendingIds: [id]
    })

    useCanvasStore
      .getState()
      .loadCanvas(useCanvasStore.getState().nodes, [], {
        x: 0,
        y: 0,
        zoom: 1
      })

    const node = useCanvasStore
      .getState()
      .nodes.find((entry) => entry.id === id)
    expect(node?.data.status).toBe('error')
    expect(node?.data.error).toBe('任务已中断，请重试')
    expect(node?.data.stemTaskId).toBeUndefined()
    expect(node?.data.stemMode).toBe('vocal')
  })

  it('marks operation result nodes as asset-only and preserves it after output', () => {
    const id = useCanvasStore
      .getState()
      .addPendingNodes('image', { x: 0, y: 0 }, 1, '裁剪结果')[0]
    expect(
      useCanvasStore.getState().nodes.find((node) => node.id === id)?.data
        .assetOnly
    ).toBe(true)

    useCanvasStore.getState().applyOutput(
      id,
      {
        id: 'asset-1',
        path: 'assets/img/a.png',
        kind: 'image',
        createdAt: '2026-11-22T00:00:00.000Z',
        model: '本地裁剪'
      },
      'crop'
    )
    expect(
      useCanvasStore.getState().nodes.find((node) => node.id === id)?.data
        .assetOnly
    ).toBe(true)
  })

  it('keeps creative nodes prompt-enabled after same-node edits', () => {
    const id = useCanvasStore.getState().addNode('image', { x: 0, y: 0 })
    useCanvasStore.getState().applyOutput(
      id,
      {
        id: 'asset-2',
        path: 'assets/img/b.png',
        kind: 'image',
        createdAt: '2026-11-22T00:00:00.000Z',
        model: 'test-model'
      },
      'relight'
    )
    expect(
      useCanvasStore.getState().nodes.find((node) => node.id === id)?.data
        .assetOnly
    ).toBeUndefined()
  })
})
