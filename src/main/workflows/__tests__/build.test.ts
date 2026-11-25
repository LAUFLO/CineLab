import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../stage/storage', () => ({
  loadStageFile: vi.fn(async () => null),
  saveStageFile: vi.fn(async () => undefined)
}))

import { buildWorkflow } from '../build'

function cineNode(overrides: Record<string, unknown> = {}) {
  return {
    id: 'node-1',
    type: 'cine',
    position: { x: 120, y: 80 },
    data: {
      kind: 'image',
      title: '图片 1',
      status: 'done',
      templates: [],
      assetOnly: true,
      outputs: [
        {
          id: 'out-1',
          path: 'assets/img/a.png',
          kind: 'image',
          createdAt: '2026-01-01T00:00:00.000Z',
          model: '本地上传'
        }
      ],
      selectedOutputId: 'out-1',
      ...overrides
    },
    style: { width: 200, height: 180 }
  }
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    name: '测试工作流',
    nodes: [cineNode()],
    edges: [],
    projectPath: 'C:/work/Demo.cinelab',
    ...overrides
  }
}

describe('buildWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('把本地上传素材节点标记为 upload 占位并清空输出', async () => {
    const { package: pkg } = await buildWorkflow(input() as never)
    const node = pkg.canvas.nodes[0]

    expect(node?.data).toMatchObject({
      workflowSlot: 'upload',
      status: 'idle'
    })
    expect(node?.data).not.toHaveProperty('outputs')
    expect(node?.data).not.toHaveProperty('selectedOutputId')
    expect(node?.position).toEqual({ x: 0, y: 0 })
  })

  it('把生成节点标记为 generate 占位并保留配置', async () => {
    const { package: pkg } = await buildWorkflow(
      input({
        nodes: [
          cineNode({
            assetOnly: false,
            prompt: '一只猫',
            modelKey: 'provider/model',
            params: { ratio: '1:1' },
            outputs: [
              {
                id: 'out-2',
                path: 'assets/img/b.png',
                kind: 'image',
                createdAt: '2026-01-01T00:00:00.000Z',
                model: 'seedream'
              }
            ]
          })
        ]
      }) as never
    )

    expect(pkg.canvas.nodes[0]?.data).toMatchObject({
      workflowSlot: 'generate',
      prompt: '一只猫',
      modelKey: 'provider/model',
      params: { ratio: '1:1' }
    })
    expect(pkg.canvas.nodes[0]?.data).not.toHaveProperty('outputs')
  })

  it('拒绝循环连接', async () => {
    const a = { ...cineNode(), id: 'a' }
    const b = { ...cineNode(), id: 'b' }
    const edges = [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'b', target: 'a' }
    ]

    await expect(
      buildWorkflow(input({ nodes: [a, b], edges }) as never)
    ).rejects.toThrow('循环连接')
  })

  it('自动补齐 video-op 的源节点', async () => {
    const source = { ...cineNode(), id: 'src' }
    const videoOp = {
      id: 'op',
      type: 'video-op',
      position: { x: 400, y: 80 },
      data: {
        kind: 'video-op',
        title: '视频操作',
        status: 'idle',
        operation: 'shot-retake',
        sourceNodeId: 'src',
        templates: []
      }
    }

    const { package: pkg } = await buildWorkflow(
      input({
        nodes: [source, videoOp],
        selectedIds: ['op']
      }) as never
    )

    expect(pkg.canvas.nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining(['src', 'op'])
    )
    expect(pkg.canvas.nodes.find((node) => node.id === 'op')?.data).toMatchObject({
      sourceNodeId: 'src'
    })
  })
})
