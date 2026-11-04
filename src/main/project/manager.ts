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

let currentProjectRoot: string | null = null

export function setCurrentProjectRoot(path: string | null): void {
  currentProjectRoot = path
}

export function getCurrentProjectRoot(): string | null {
  return currentProjectRoot
}

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
  const tmp = `${file}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`
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
  setCurrentProjectRoot(path)

  return { path, meta, canvas }
}

export async function openProject(path: string): Promise<ProjectSnapshot> {
  const projectPath = assertProjectPath(path)
  const meta = projectMetaSchema.parse(await readJson(join(projectPath, 'project.json')))

  const active =
    meta.canvases.find((canvas) => canvas.id === meta.activeCanvasId) ?? meta.canvases[0]

  const canvas = canvasDataSchema.parse(await readJson(join(projectPath, active.file)))
  await addRecent(projectPath, meta.name)
  setCurrentProjectRoot(projectPath)

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

export async function bootstrap(): Promise<ProjectSnapshot | null> {
  const recents = await readRecent()

  for (const recent of recents) {
    try {
      return await openProject(recent.path)
    } catch {
      continue
    }
  }

  return null
}

let bootstrapPromise: Promise<ProjectSnapshot | null> | null = null

export function bootstrapOnce(): Promise<ProjectSnapshot | null> {
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

export async function renameProject(
  projectPath: string,
  name: string
): Promise<ProjectMeta> {
  const path = assertProjectPath(projectPath)
  const meta = projectMetaSchema.parse(await readJson(join(path, 'project.json')))

  meta.name = sanitizeName(name)
  meta.updatedAt = new Date().toISOString()
  await writeJsonAtomic(join(path, 'project.json'), meta)
  await addRecent(path, meta.name)
  return meta
}

export async function createCanvas(
  projectPath: string,
  name?: string
): Promise<ProjectSnapshot> {
  const path = assertProjectPath(projectPath)
  const meta = projectMetaSchema.parse(await readJson(join(path, 'project.json')))
  const canvasId = randomUUID().slice(0, 8)
  const canvasName = name?.trim() || `画布 ${meta.canvases.length + 1}`
  const file = `canvas-${canvasId}.json`

  const canvas: CanvasData = {
    schemaVersion: 1,
    id: canvasId,
    name: canvasName,
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [],
    edges: []
  }

  meta.canvases.push({ id: canvasId, name: canvasName, file })
  meta.activeCanvasId = canvasId
  meta.updatedAt = new Date().toISOString()

  await writeJsonAtomic(join(path, file), canvas)
  await writeJsonAtomic(join(path, 'project.json'), meta)
  return { path, meta, canvas }
}

export async function switchCanvas(
  projectPath: string,
  canvasId: string
): Promise<ProjectSnapshot> {
  const path = assertProjectPath(projectPath)
  const meta = projectMetaSchema.parse(await readJson(join(path, 'project.json')))
  const entry = meta.canvases.find((item) => item.id === canvasId)

  if (!entry) throw new Error('找不到该画布')
  const canvas = canvasDataSchema.parse(await readJson(join(path, entry.file)))

  meta.activeCanvasId = canvasId
  meta.updatedAt = new Date().toISOString()
  await writeJsonAtomic(join(path, 'project.json'), meta)
  return { path, meta, canvas }
}

export async function renameCanvas(
  projectPath: string,
  canvasId: string,
  name: string
): Promise<ProjectMeta> {
  const path = assertProjectPath(projectPath)
  const meta = projectMetaSchema.parse(await readJson(join(path, 'project.json')))
  const entry = meta.canvases.find((item) => item.id === canvasId)

  if (!entry) throw new Error('找不到该画布')
  entry.name = name.trim() || entry.name
  meta.updatedAt = new Date().toISOString()

  const canvas = canvasDataSchema.parse(await readJson(join(path, entry.file)))
  canvas.name = entry.name

  await writeJsonAtomic(join(path, entry.file), canvas)
  await writeJsonAtomic(join(path, 'project.json'), meta)
  return meta
}

export async function deleteCanvas(
  projectPath: string,
  canvasId: string
): Promise<ProjectSnapshot> {
  const path = assertProjectPath(projectPath)
  const meta = projectMetaSchema.parse(await readJson(join(path, 'project.json')))

  if (meta.canvases.length <= 1) throw new Error('至少保留一个画布')

  const entry = meta.canvases.find((item) => item.id === canvasId)
  if (!entry) throw new Error('找不到该画布')

  meta.canvases = meta.canvases.filter((item) => item.id !== canvasId)

  if (meta.activeCanvasId === canvasId) {
    meta.activeCanvasId = meta.canvases[0].id
  }

  meta.updatedAt = new Date().toISOString()
  await fs.rm(join(path, entry.file), { force: true })
  await writeJsonAtomic(join(path, 'project.json'), meta)

  const active =
    meta.canvases.find((item) => item.id === meta.activeCanvasId) ?? meta.canvases[0]
  const canvas = canvasDataSchema.parse(await readJson(join(path, active.file)))
  return { path, meta, canvas }
}

export async function deleteProject(projectPath: string): Promise<void> {
  const path = assertProjectPath(projectPath)
  await fs.rm(path, { recursive: true, force: true })

  setCurrentProjectRoot(null)
  const recent = await readRecent()
  await writeJsonAtomic(
    recentFile(),
    recent.filter((item) => item.path !== path)
  )
}
