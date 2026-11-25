import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  MAX_WORKFLOW_BYTES,
  WORKFLOW_FOLDER,
  workflowPackageSchema,
  type WorkflowImportResult,
  type WorkflowPackage,
  type WorkflowSummary
} from '@shared/workflow-schema'
import { validateStageDoc } from '@shared/stage-schema'
import { getLibraryRoot } from './config'
import { zipDirectory } from '../export/zip'
import { extractZipSafely } from '../components/zip-extract'
import { buildWorkflowThumbnail } from '../workflows/thumbnail'

const SLUG_PATTERN = /^[^\\/:*?"<>|.]{1,80}$/

export function assertWorkflowSlug(slug: string): string {
  if (!SLUG_PATTERN.test(slug) || slug === '..') {
    throw new Error('无效的工作流目录名')
  }
  return slug
}

export function workflowSlug(name: string): string {
  const cleaned = name
    .normalize('NFKC')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 60)
  return cleaned || 'workflow'
}

async function workflowRoot(): Promise<string> {
  const root = join(await getLibraryRoot(), WORKFLOW_FOLDER)
  await fs.mkdir(root, { recursive: true })
  return root
}

async function uniqueSlug(
  root: string,
  base: string,
  ignore?: string
): Promise<string> {
  const safe = assertWorkflowSlug(workflowSlug(base))
  let candidate = safe
  let index = 2

  for (;;) {
    if (candidate === ignore) return candidate
    try {
      await fs.access(join(root, candidate))
      candidate = `${safe} (${index})`
      index += 1
    } catch {
      return candidate
    }
  }
}

function summaryFor(pkg: WorkflowPackage, slug: string): WorkflowSummary {
  return {
    slug,
    id: pkg.id,
    name: pkg.name,
    ...(pkg.description ? { description: pkg.description } : {}),
    createdAt: pkg.createdAt,
    updatedAt: pkg.updatedAt,
    meta: pkg.meta,
    thumbnail: `${WORKFLOW_FOLDER}/${slug}/thumbnail.svg`
  }
}

async function readPackage(
  root: string,
  slug: string
): Promise<WorkflowPackage | null> {
  try {
    const raw = await fs.readFile(join(root, slug, 'workflow.json'), 'utf8')
    return workflowPackageSchema.parse(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

async function writePackage(
  root: string,
  slug: string,
  pkg: WorkflowPackage,
  thumbnail: string
): Promise<void> {
  const dir = join(root, slug)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(
    join(dir, 'workflow.json'),
    `${JSON.stringify(pkg, null, 2)}\n`,
    'utf8'
  )
  await fs.writeFile(join(dir, 'thumbnail.svg'), thumbnail, 'utf8')
}

export async function listWorkflows(): Promise<WorkflowSummary[]> {
  const root = await workflowRoot()
  let entries
  try {
    entries = await fs.readdir(root, { withFileTypes: true })
  } catch {
    return []
  }

  const items: WorkflowSummary[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const pkg = await readPackage(root, entry.name)
    if (!pkg) continue
    items.push(summaryFor(pkg, entry.name))
  }

  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function readWorkflow(slug: string): Promise<WorkflowPackage> {
  const root = await workflowRoot()
  const pkg = await readPackage(root, assertWorkflowSlug(slug))
  if (!pkg) throw new Error('工作流不存在或已损坏')
  return pkg
}

export async function readWorkflowSummary(
  slug: string
): Promise<WorkflowSummary> {
  const pkg = await readWorkflow(slug)
  return summaryFor(pkg, slug)
}

export async function saveWorkflow(
  incoming: WorkflowPackage,
  thumbnail: string,
  options: { overwriteSlug?: string } = {}
): Promise<WorkflowSummary> {
  const root = await workflowRoot()
  const overwrite = options.overwriteSlug
    ? assertWorkflowSlug(options.overwriteSlug)
    : undefined

  let slug = overwrite ?? (await uniqueSlug(root, incoming.name))
  let pkg = incoming

  if (overwrite) {
    const previous = await readPackage(root, overwrite)
    if (previous) {
      pkg = {
        ...incoming,
        id: previous.id,
        createdAt: previous.createdAt
      }
    } else {
      slug = await uniqueSlug(root, incoming.name)
    }
  }

  const sizeBytes = Buffer.byteLength(JSON.stringify(pkg), 'utf8')
  const withSize: WorkflowPackage = {
    ...pkg,
    meta: { ...pkg.meta, sizeBytes }
  }

  await writePackage(root, slug, withSize, thumbnail)
  return summaryFor(withSize, slug)
}

export async function renameWorkflow(
  slug: string,
  name: string
): Promise<WorkflowSummary> {
  const root = await workflowRoot()
  const current = assertWorkflowSlug(slug)
  const pkg = await readPackage(root, current)
  if (!pkg) throw new Error('工作流不存在或已损坏')

  const trimmed = name.trim().slice(0, 60)
  if (!trimmed) throw new Error('工作流名称不能为空')

  const nextSlug = await uniqueSlug(root, trimmed, current)
  const next: WorkflowPackage = {
    ...pkg,
    name: trimmed,
    updatedAt: new Date().toISOString()
  }

  const thumbnailPath = join(root, current, 'thumbnail.svg')
  let thumbnail = ''
  try {
    thumbnail = await fs.readFile(thumbnailPath, 'utf8')
  } catch {
    thumbnail = buildWorkflowThumbnail(
      next.canvas.nodes,
      next.canvas.edges
    )
  }

  await writePackage(root, nextSlug, next, thumbnail)
  if (nextSlug !== current) {
    await fs.rm(join(root, current), { recursive: true, force: true })
  }

  return summaryFor(next, nextSlug)
}

export async function deleteWorkflow(slug: string): Promise<void> {
  const root = await workflowRoot()
  await fs.rm(join(root, assertWorkflowSlug(slug)), {
    recursive: true,
    force: true
  })
}

export async function exportWorkflowZip(
  slug: string,
  targetFile: string
): Promise<void> {
  const root = await workflowRoot()
  const dir = join(root, assertWorkflowSlug(slug))
  await fs.access(join(dir, 'workflow.json'))
  await fs.mkdir(dirname(targetFile), { recursive: true })
  await zipDirectory(dir, targetFile, { rootName: assertWorkflowSlug(slug) })
}

export async function importWorkflowZip(
  zipPath: string
): Promise<WorkflowImportResult> {
  const root = await workflowRoot()
  const temp = join(tmpdir(), `cinelab-workflow-${randomUUID()}`)
  await fs.mkdir(temp, { recursive: true })

  try {
    await extractZipSafely(zipPath, temp, {
      maxFiles: 2000,
      maxTotalBytes: MAX_WORKFLOW_BYTES
    })

    let sourceDir = temp
    try {
      await fs.access(join(temp, 'workflow.json'))
    } catch {
      const entries = await fs.readdir(temp, { withFileTypes: true })
      const nested = entries.find((entry) => entry.isDirectory())
      if (!nested) throw new Error('工作流包缺少 workflow.json')
      sourceDir = join(temp, nested.name)
      await fs.access(join(sourceDir, 'workflow.json'))
    }

    const raw = await fs.readFile(join(sourceDir, 'workflow.json'), 'utf8')
    const pkg = workflowPackageSchema.parse(JSON.parse(raw) as unknown)
    const warnings: string[] = []

    for (const [stageId, doc] of Object.entries(pkg.stages)) {
      const errors = validateStageDoc(doc)
      if (errors.length > 0) {
        delete pkg.stages[stageId]
        warnings.push(`场景 ${stageId} 校验失败，已转为占位：${errors[0]}`)
      }
    }

    const slug = await uniqueSlug(root, pkg.name)
    const targetDir = join(root, slug)
    await fs.cp(sourceDir, targetDir, { recursive: true })

    let thumbnail = buildWorkflowThumbnail(pkg.canvas.nodes, pkg.canvas.edges)
    try {
      thumbnail = await fs.readFile(join(targetDir, 'thumbnail.svg'), 'utf8')
    } catch {
      await fs.writeFile(join(targetDir, 'thumbnail.svg'), thumbnail, 'utf8')
    }

    const next: WorkflowPackage = {
      ...pkg,
      id: pkg.id || randomUUID(),
      updatedAt: new Date().toISOString()
    }
    await writePackage(root, slug, next, thumbnail)

    return { summary: summaryFor(next, slug), warnings }
  } finally {
    await fs.rm(temp, { recursive: true, force: true })
  }
}
