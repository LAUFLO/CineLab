import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import type { CanvasData, ProjectMeta } from '@shared/project-schema'
import { zipDirectory } from './zip'

interface ExportResult {
  copiedAssets: number
}

function globalOutputs(canvas: CanvasData): Array<{
  node: CanvasData['nodes'][number]
  output: {
    path: string
    scope?: 'project' | 'global'
    [key: string]: unknown
  }
}> {
  const result: Array<{
    node: CanvasData['nodes'][number]
    output: {
      path: string
      scope?: 'project' | 'global'
      [key: string]: unknown
    }
  }> = []

  for (const node of canvas.nodes) {
    if (node.type !== 'cine') continue
    const outputs = Array.isArray(node.data.outputs) ? node.data.outputs : []
    for (const output of outputs) {
      if (output.scope === 'global') {
        result.push({ node, output })
      }
    }
  }

  return result
}

export async function stageProjectExport(
  projectRoot: string,
  staging: string,
  libraryRoot: string
): Promise<number> {
  let copiedAssets = 0

  await fs.cp(projectRoot, staging, {
    recursive: true,
    filter: (source) => {
      const name = basename(source)
      return name !== '.lock' && name !== '.trash'
    }
  })

  const meta = JSON.parse(
    await fs.readFile(join(staging, 'project.json'), 'utf8')
  ) as ProjectMeta
  const copied = new Map<string, string>()

  for (const entry of meta.canvases) {
    const canvasPath = join(staging, entry.file)
    const canvas = JSON.parse(
      await fs.readFile(canvasPath, 'utf8')
    ) as CanvasData

    for (const { output } of globalOutputs(canvas)) {
      const source = join(libraryRoot, output.path)
      let exists = true
      try {
        await fs.access(source)
      } catch {
        exists = false
      }
      if (!exists) {
        throw new Error(`全局素材缺失，无法导出：${output.path}`)
      }

      let localPath = copied.get(output.path)
      if (!localPath) {
        const data = await fs.readFile(source)
        const hash = createHash('sha256').update(data).digest('hex').slice(0, 16)
        const ext = extname(source).toLowerCase() || '.bin'
        localPath = `assets/global/${hash}${ext}`
        await fs.mkdir(join(staging, 'assets', 'global'), { recursive: true })
        await fs.writeFile(join(staging, localPath), data)
        copied.set(output.path, localPath)
        copiedAssets += 1
      }

      output.scope = 'project'
      output.path = localPath
    }

    await fs.writeFile(canvasPath, JSON.stringify(canvas, null, 2), 'utf8')
  }

  return copiedAssets
}

export async function exportProjectWithAssets(
  projectRoot: string,
  targetFile: string
): Promise<ExportResult> {
  const staging = await fs.mkdtemp(join(tmpdir(), 'cinelab-export-'))

  try {
    const { getLibraryRoot } = await import('../library/config')
    const copiedAssets = await stageProjectExport(
      projectRoot,
      staging,
      await getLibraryRoot()
    )

    await zipDirectory(staging, targetFile, {
      rootName: basename(projectRoot),
      ignore: ['.lock', '.trash']
    })

    return { copiedAssets }
  } finally {
    await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined)
  }
}
