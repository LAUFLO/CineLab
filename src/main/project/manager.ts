import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  canvasDataSchema,
  projectMetaSchema,
  type CanvasData,
  type ProjectMeta,
  type ProjectSnapshot,
  type RecentProject
} from '@shared/project-schema'

const PROJECT_EXT = '.cinelab'

export function defaultProjectsDir(): string {
  return join(app.getPath('documents'), 'CineLab')
}

function recentFile(): string {
  return join(app.getPath('userData'), 'recent-projects.json')
}

async function readJson(file: string): Promise<unknown> {
  const text = await fs.readFile(file, 'utf8')
  return JSON.parse(text) as unknown
}

async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  const tmp = `${file}.${process.pid}.tmp`
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')

  try {
    await fs.rename(tmp, file)
  } catch {
    await fs.rm(file, { force: true })
    await fs.rename(tmp, file)
  }
}

function assertProjectPath(path: string): string {
  const resolved = resolve(path)
  if (!resolved.endsWith(PROJECT_EXT)) {
    throw new Error('不是有效的 CineLab 项目文件夹')
  }
  return resolved
}

function sanitizeName(name: string): string {
  const trimmed = name.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
  return trimmed.length > 0 ? trimmed.slice(0, 80) : '未命名项目'
}

export async function readRecent(): Promise<RecentProject[]> {
  try {
    const raw = await readJson(recentFile())
    if (!Array.isArray(raw)) return []

    return raw
      .filter(
        (item): item is RecentProject =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as RecentProject).path === 'string' &&
          typeof (item as RecentProject).name === 'string'
      )
      .slice(0, 10)
  } catch {
    return []
  }
}

async function addRecent(path: string, name: string): Promise<void> {
  const list = await readRecent()
  const next: RecentProject[] = [
    { path, name, lastOpenedAt: new Date().toISOString() },
    ...list.filter((item) => item.path !== path)
  ].slice(0, 10)

  await fs.mkdir(dirname(recentFile()), { recursive: true })
  await writeJsonAtomic(recentFile(), next)
}

export async function createProject(
  name: string,
  parentDir?: string
): Promise<ProjectSnapshot> {
  const safeName = sanitizeName(name)
  const parent = parentDir ? resolve(parentDir) : defaultProjectsDir()
  await fs.mkdir(parent, { recursive: true })

  const folder = safeName.endsWith(PROJECT_EXT) ? safeName : `${safeName}${PROJECT_EXT}`
  const path = assertProjectPath(join(parent, folder))

  const exists = await fs
    .access(join(path, 'project.json'))
    .then(() => true)
    .catch(() => false)
  if (exists) {
    throw new Error('该位置已存在 CineLab 项目')
  }

  await fs.mkdir(path, { recursive: true })

  const now = new Date().toISOString()
  const canvasId = randomUUID().slice(0, 8)

  const meta: ProjectMeta = {
    schemaVersion: 1,
    id: randomUUID(),
    name: safeName.endsWith(PROJECT_EXT) ? safeName.slice(0, -PROJECT_EXT.length) : safeName,
    createdAt: now,
    updatedAt: now,
    canvases: [{ id: canvasId, name: '画布 1', file: `canvas-${canvasId}.json` }],
    activeCanvasId: canvasId
  }

  const canvas: CanvasData = {
    schemaVersion: 1,
    id: canvasId,
    name: '画布 1',
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [],
    edges: []
  }

  for (const dir of ['assets/img', 'assets/vid', 'assets/aud', 'assets/thumb', 'exports']) {
    await fs.mkdir(join(path, dir), { recursive: true })
  }

  await writeJsonAtomic(join(path, 'project.json'), meta)
  await writeJsonAtomic(join(path, meta.canvases[0].file), canvas)
  await addRecent(path, meta.name)

  return { path, meta, canvas }
}

export async function openProject(path: string): Promise<ProjectSnapshot> {
  const projectPath = assertProjectPath(path)
  const meta = projectMetaSchema.parse(await readJson(join(projectPath, 'project.json')))

  const active =
    meta.canvases.find((canvas) => canvas.id === meta.activeCanvasId) ?? meta.canvases[0]

  const canvas = canvasDataSchema.parse(await readJson(join(projectPath, active.file)))
  await addRecent(projectPath, meta.name)

  return { path: projectPath, meta, canvas }
}

export async function saveCanvas(projectPath: string, canvas: CanvasData): Promise<void> {
  const path = assertProjectPath(projectPath)
  const meta = projectMetaSchema.parse(await readJson(join(path, 'project.json')))

  const entry = meta.canvases.find((item) => item.id === canvas.id)
  if (!entry) {
    throw new Error('画布不属于当前项目')
  }

  const validated = canvasDataSchema.parse(canvas)
  await writeJsonAtomic(join(path, entry.file), validated)

  meta.updatedAt = new Date().toISOString()
  await writeJsonAtomic(join(path, 'project.json'), meta)
}

export async function bootstrap(): Promise<ProjectSnapshot> {
  const recents = await readRecent()

  for (const recent of recents) {
    try {
      return await openProject(recent.path)
    } catch {
      continue
    }
  }

  const fallback = join(defaultProjectsDir(), '未命名项目.cinelab')
  try {
    return await openProject(fallback)
  } catch {
    return createProject('未命名项目')
  }
}

let bootstrapPromise: Promise<ProjectSnapshot> | null = null

export function bootstrapOnce(): Promise<ProjectSnapshot> {
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrap().finally(() => {
      bootstrapPromise = null
    })
  }
  return bootstrapPromise
}

export function projectNameFromPath(path: string): string {
  return basename(path).replace(PROJECT_EXT, '')
}
