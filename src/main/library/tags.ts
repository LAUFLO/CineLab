import { promises as fs } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { getLibraryRoot } from './config'
import { normalizeTags } from './tag-utils'

const TAGS_FILE = '.tags.json'

export type AssetTagMap = Record<string, string[]>

async function tagsPath(): Promise<string> {
  const root = await getLibraryRoot()
  return join(root, TAGS_FILE)
}

export async function readAssetTags(): Promise<AssetTagMap> {
  try {
    const raw = JSON.parse(await fs.readFile(await tagsPath(), 'utf8')) as unknown
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}

    const result: AssetTagMap = {}
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (!Array.isArray(value)) continue
      const tags = value
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.trim())
        .filter(Boolean)
      if (tags.length > 0) result[key] = tags
    }
    return result
  } catch {
    return {}
  }
}

async function writeAssetTags(map: AssetTagMap): Promise<void> {
  const file = await tagsPath()
  const tmp = `${file}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`
  await fs.writeFile(tmp, JSON.stringify(map, null, 2), 'utf8')

  try {
    await fs.rename(tmp, file)
  } catch {
    await fs.rm(file, { force: true })
    await fs.rename(tmp, file)
  }
}

export async function setAssetTags(
  path: string,
  tags: string[]
): Promise<string[]> {
  const map = await readAssetTags()
  const cleaned = normalizeTags(tags)

  if (cleaned.length > 0) map[path] = cleaned
  else delete map[path]

  await writeAssetTags(map)
  return cleaned
}

export async function moveAssetTags(
  oldPath: string,
  nextPath: string
): Promise<void> {
  const map = await readAssetTags()
  const tags = map[oldPath]
  if (!tags) return

  delete map[oldPath]
  map[nextPath] = tags
  await writeAssetTags(map)
}

export async function deleteAssetTags(path: string): Promise<void> {
  const map = await readAssetTags()
  if (!map[path]) return
  delete map[path]
  await writeAssetTags(map)
}

export async function deleteFolderTags(prefix: string): Promise<void> {
  const map = await readAssetTags()
  let changed = false

  for (const key of Object.keys(map)) {
    if (key === prefix || key.startsWith(`${prefix}/`)) {
      delete map[key]
      changed = true
    }
  }

  if (changed) await writeAssetTags(map)
}
