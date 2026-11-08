import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import {
  createStageDoc,
  validateStageDoc,
  type DirectorStageDoc
} from '@shared/stage-schema'

const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/

export function assertStageId(id: string): string {
  if (!ID_PATTERN.test(id)) throw new Error('无效的场景 ID')
  return id
}

export function stageDirectory(projectRoot: string): string {
  return join(projectRoot, 'stages')
}

function stageFile(projectRoot: string, stageId: string): string {
  return join(stageDirectory(projectRoot), `${assertStageId(stageId)}.json`)
}

async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  const tmp = `${file}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`
  await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8')

  try {
    await fs.rename(tmp, file)
  } catch {
    await fs.rm(file, { force: true })
    await fs.rename(tmp, file)
  }
}

export async function ensureStageDir(projectRoot: string): Promise<void> {
  await fs.mkdir(stageDirectory(projectRoot), { recursive: true })
}

export async function createStageFile(
  projectRoot: string,
  name?: string
): Promise<DirectorStageDoc> {
  const doc = createStageDoc(
    `stage_${randomUUID()}`,
    name?.trim() || '未命名场景'
  )
  await saveStageFile(projectRoot, doc)
  return doc
}

export async function loadStageFile(
  projectRoot: string,
  stageId: string
): Promise<DirectorStageDoc | null> {
  let raw: string
  try {
    raw = await fs.readFile(stageFile(projectRoot, stageId), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }

  const parsed = JSON.parse(raw) as unknown
  const errors = validateStageDoc(parsed)
  if (errors.length > 0) {
    throw new Error(`场景文件无效：${errors[0]}`)
  }
  return parsed as DirectorStageDoc
}

export async function saveStageFile(
  projectRoot: string,
  doc: DirectorStageDoc
): Promise<void> {
  if (!doc || typeof doc !== 'object') throw new Error('场景文档无效')
  assertStageId(doc.stageId)

  const errors = validateStageDoc(doc)
  if (errors.length > 0) {
    throw new Error(`场景文档无效：${errors[0]}`)
  }

  await ensureStageDir(projectRoot)
  await writeJsonAtomic(stageFile(projectRoot, doc.stageId), {
    ...doc,
    updatedAt: new Date().toISOString()
  })
}

/** 复制场景文件并生成新 ID；源文件不存在时创建空场景 */
export async function duplicateStageFile(
  projectRoot: string,
  sourceId: string
): Promise<DirectorStageDoc> {
  const source = await loadStageFile(projectRoot, sourceId)
  const stageId = `stage_${randomUUID()}`

  if (!source) {
    const doc = createStageDoc(stageId)
    await saveStageFile(projectRoot, doc)
    return doc
  }

  const copy: DirectorStageDoc = {
    ...structuredClone(source),
    stageId,
    name: `${source.name} 副本`,
    updatedAt: new Date().toISOString()
  }
  await saveStageFile(projectRoot, copy)
  return copy
}

export async function deleteStageFile(
  projectRoot: string,
  stageId: string
): Promise<void> {
  await fs.rm(stageFile(projectRoot, stageId), { force: true })
}
