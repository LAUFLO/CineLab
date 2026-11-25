import { describe, expect, it, vi } from 'vitest'

vi.mock('../../stage/storage', () => ({
  saveStageFile: vi.fn(async () => undefined)
}))

vi.mock('../../library/config', () => ({
  getLibraryRoot: vi.fn(async () => 'C:/library')
}))

vi.mock('../../settings/store', () => ({
  listProviders: vi.fn(async () => [
    {
      id: 'new-provider',
      name: 'Provider',
      models: [{ id: 'model-1', name: 'Model 1' }]
    }
  ])
}))

import { instantiateWorkflow } from '../instantiate'

function pkg(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    id: 'wf',
    name: '测试',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    canvas: {
      nodes: [
        {
          id: 'source',
          type: 'cine',
          position: { x: 0, y: 0 },
          data: {
            kind: 'image',
            title: '素材',
            status: 'idle',
            templates: [],
            workflowSlot: 'upload',
            refOrder: ['global:missing.png', 'global:exists.png']
          },
          style: { width: 200, height: 160 }
        },
        {
          id: 'studio',
          type: 'studio',
          position: { x: 300, y: 0 },
          data: {
            kind: 'studio',
            title: '剪辑室',
            status: 'idle',
            templates: [],
            workflowSlot: 'generate'
          },
          style: { width: 320, height: 200 }
        },
        {
          id: 'gen',
          type: 'cine',
          position: { x: 0, y: 220 },
          data: {
            kind: 'image',
            title: '生成',
            status: 'idle',
            templates: [],
            workflowSlot: 'generate',
            modelKey: 'old-provider/model-1'
          },
          style: { width: 200, height: 160 }
        }
      ],
      edges: [
        { id: 'e1', source: 'source', target: 'gen' },
        { id: 'e2', source: 'gen', target: 'studio' }
      ]
    },
    stages: {},
    meta: {
      nodeCount: 3,
      edgeCount: 2,
      generationCount: 2,
      uploadSlotCount: 1,
      missingGlobalAssets: 0,
      sizeBytes: 0
    },
    ...overrides
  }
}

describe('instantiateWorkflow', () => {
  it('重新分配节点 ID、边和 timelineId', async () => {
    const result = await instantiateWorkflow(pkg() as never, {
      projectPath: 'C:/work/Demo.cinelab'
    })

    expect(result.nodes).toHaveLength(3)
    expect(result.nodes.every((node) => node.id.startsWith('node_'))).toBe(true)
    expect(result.edges).toHaveLength(2)
    expect(result.edges.every((edge) => edge.id !== 'e1' && edge.id !== 'e2')).toBe(
      true
    )

    const studio = result.nodes.find((node) => node.type === 'studio')
    expect(studio?.data.timelineId).toMatch(/^timeline_/)
  })

  it('保留占位标记并清理缺失的全局素材', async () => {
    const result = await instantiateWorkflow(pkg() as never, {
      projectPath: 'C:/work/Demo.cinelab'
    })

    const source = result.nodes.find((node) => node.type === 'cine')
    expect(source?.data.workflowSlot).toBe('upload')
    expect(source?.data.refOrder).toBeUndefined()
    expect(
      result.warnings.some((warning) => warning.includes('missing.png'))
    ).toBe(true)
  })

  it('按模型 ID 重新匹配 modelKey', async () => {
    const result = await instantiateWorkflow(pkg() as never, {
      projectPath: 'C:/work/Demo.cinelab'
    })

    const generated = result.nodes.find(
      (node) => node.data.title === '生成'
    )
    const modelKey =
      generated && generated.type === 'cine'
        ? generated.data.modelKey
        : undefined
    expect(modelKey).toBe('new-provider/model-1')
  })
})
