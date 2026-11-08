import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import {
  timelineDocSchema,
  type TimelineDoc
} from '@shared/timeline-schema'

const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/

export function assertTimelineId(id: string): string {
  if (!ID_PATTERN.test(id)) throw new Error('无效的时间线 ID')
  return id
}

function timelineDir(projectRoot: string): string {
  return join(projectRoot, 'timelines')
}

function timelineFile(projectRoot: string, id: string): string {
  return join(timelineDir(projectRoot), `${assertTimelineId(id)}.json`)
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

export async function ensureTimelineDir(projectRoot: string): Promise<void> {
  await fs.mkdir(timelineDir(projectRoot), { recursive: true })
}

export async function loadTimelineFile(
  projectRoot: string,
  id: string
): Promise<TimelineDoc | null> {
  const file = timelineFile(projectRoot, id)

  try {
    const raw = await fs.readFile(file, 'utf8')
    return timelineDocSchema.parse(JSON.parse(raw) as unknown)
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return null
    }
    throw error
  }
}

export async function saveTimelineFile(
  projectRoot: string,
  id: string,
  doc: TimelineDoc
): Promise<void> {
  await ensureTimelineDir(projectRoot)
  const validated = timelineDocSchema.parse(doc)
  await writeJsonAtomic(timelineFile(projectRoot, id), validated)
}

/** 复制时间线文件并生成新 id；源文件不存在时返回新 id，由打开时创建空文档 */
export async function duplicateTimelineFile(
  projectRoot: string,
  sourceId: string
): Promise<string> {
  const source = await loadTimelineFile(projectRoot, sourceId)
  const newId = `timeline_${randomUUID()}`

  if (source) {
    await saveTimelineFile(projectRoot, newId, {
      ...source,
      id: newId,
      name: `${source.name} 副本`,
      updatedAt: new Date().toISOString()
    })
  }

  return newId
}

export async function deleteTimelineFile(
  projectRoot: string,
  id: string
): Promise<void> {
  await fs.rm(timelineFile(projectRoot, id), { force: true })
}
