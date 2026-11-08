import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { stageProjectExport } from '../project-export'

const roots: string[] = []

async function makeTemp(prefix: string): Promise<string> {
  const root = await fs.mkdtemp(join(tmpdir(), prefix))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true }).catch(() => undefined)
    )
  )
})

function meta() {
  return {
    schemaVersion: 1,
    id: 'project',
    name: 'Test',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    canvases: [{ id: 'canvas', name: 'Canvas', file: 'canvas-canvas.json' }],
    activeCanvasId: 'canvas'
  }
}

function canvas(secondPath: string) {
  const output = (id: string, path: string, scope: 'global' | 'project') => ({
    id,
    path,
    scope,
    kind: 'image',
    createdAt: '2026-01-01T00:00:00.000Z',
    model: 'test'
  })

  return {
    schemaVersion: 1,
    id: 'canvas',
    name: 'Canvas',
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      {
        id: 'node-1',
        type: 'cine',
        position: { x: 0, y: 0 },
        data: {
          kind: 'image',
          title: 'Global',
          status: 'done',
          templates: [],
          outputs: [output('a', '场景/global.png', 'global')]
        }
      },
      {
        id: 'node-2',
        type: 'cine',
        position: { x: 100, y: 0 },
        data: {
          kind: 'image',
          title: 'Global duplicate',
          status: 'done',
          templates: [],
          outputs: [
            output('b', '场景/global.png', 'global'),
            output('c', secondPath, 'project')
          ]
        }
      }
    ],
    edges: []
  }
}

describe('stageProjectExport', () => {
  it('copies global assets and rewrites canvas output paths', async () => {
    const projectRoot = await makeTemp('cinelab-project-')
    const libraryRoot = await makeTemp('cinelab-library-')
    const staging = await makeTemp('cinelab-staging-')

    await fs.mkdir(join(libraryRoot, '场景'), { recursive: true })
    await fs.writeFile(
      join(libraryRoot, '场景', 'global.png'),
      Buffer.from('global-image')
    )
    await fs.writeFile(
      join(projectRoot, 'project.json'),
      JSON.stringify(meta())
    )
    await fs.writeFile(
      join(projectRoot, 'canvas-canvas.json'),
      JSON.stringify(canvas('assets/img/local.png'))
    )

    const copied = await stageProjectExport(projectRoot, staging, libraryRoot)
    expect(copied).toBe(1)

    const rewritten = JSON.parse(
      await fs.readFile(join(staging, 'canvas-canvas.json'), 'utf8')
    ) as {
      nodes: Array<{
        data: {
          outputs: Array<{ path: string; scope: string }>
        }
      }>
    }

    const outputs = rewritten.nodes.flatMap((node) => node.data.outputs)
    expect(outputs[0]).toMatchObject({
      scope: 'project',
      path: expect.stringMatching(/^assets\/global\/[a-f0-9]{16}\.png$/)
    })
    expect(outputs[1]).toMatchObject({
      scope: 'project',
      path: outputs[0].path
    })
    expect(outputs[2]).toMatchObject({
      scope: 'project',
      path: 'assets/img/local.png'
    })

    const copiedPath = join(staging, outputs[0].path)
    expect((await fs.readFile(copiedPath)).toString()).toBe('global-image')
  })

  it('fails when a global asset is missing', async () => {
    const projectRoot = await makeTemp('cinelab-project-')
    const libraryRoot = await makeTemp('cinelab-library-')
    const staging = await makeTemp('cinelab-staging-')

    await fs.writeFile(
      join(projectRoot, 'project.json'),
      JSON.stringify(meta())
    )
    await fs.writeFile(
      join(projectRoot, 'canvas-canvas.json'),
      JSON.stringify(canvas('assets/img/local.png'))
    )

    await expect(
      stageProjectExport(projectRoot, staging, libraryRoot)
    ).rejects.toThrow('全局素材缺失')
  })
})
