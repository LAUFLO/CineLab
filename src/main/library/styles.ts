import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'
import {
  STYLE_CATEGORIES,
  styleFolderName,
  styleNameKey,
  validateStyleName,
  validateStylePrompt,
  type StyleCard,
  type StyleSaveInput
} from '@shared/style-schema'
import { getLibraryRoot } from './config'

export const STYLE_FOLDER = '风格'
const STYLE_META = 'style.json'
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'])

interface StyleMeta {
  name: string
  category: string
  prompt: string
  cover: string
  version: number
  updatedAt?: string
}

function isStyleCategory(value: string): boolean {
  return (STYLE_CATEGORIES as readonly string[]).includes(value)
}

/** 官方风格随应用分发：开发期读 docs/style-library，打包后读 resources/styles。 */
export function officialStylesRoot(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'styles')
    : join(app.getAppPath(), 'docs/style-library')
}

async function existingOfficialRoot(): Promise<string | null> {
  const candidates = [
    officialStylesRoot(),
    join(process.cwd(), 'docs/style-library')
  ]

  for (const dir of candidates) {
    try {
      await fs.access(join(dir, 'styles.json'))
      return dir
    } catch {
      // 继续尝试下一个候选目录
    }
  }

  return null
}

async function listOfficialStyles(): Promise<StyleCard[]> {
  const root = await existingOfficialRoot()
  if (!root) return []

  try {
    const raw = JSON.parse(
      await fs.readFile(join(root, 'styles.json'), 'utf8')
    ) as unknown
    if (!Array.isArray(raw)) return []

    return raw
      .filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === 'object'
      )
      .map((item) => ({
        id: String(item.id ?? ''),
        name: String(item.name ?? ''),
        category: String(item.category ?? ''),
        cover: String(item.cover ?? ''),
        prompt: String(item.prompt ?? ''),
        version: Number(item.version ?? 1),
        source: 'official' as const
      }))
      .filter(
        (item) =>
          item.id &&
          item.name &&
          item.prompt &&
          isStyleCategory(item.category)
      )
  } catch {
    return []
  }
}

async function readFirstImage(dir: string): Promise<string | null> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (IMAGE_EXT.has(extname(entry.name).toLowerCase())) return entry.name
  }
  return null
}

async function listUserStyles(): Promise<StyleCard[]> {
  const libraryRoot = await getLibraryRoot()
  const dir = join(libraryRoot, STYLE_FOLDER)

  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }

  const styles: StyleCard[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const styleDir = join(dir, entry.name)
    let meta: Partial<StyleMeta>
    try {
      meta = JSON.parse(
        await fs.readFile(join(styleDir, STYLE_META), 'utf8')
      ) as Partial<StyleMeta>
    } catch {
      continue
    }

    const name = String(meta.name ?? '').trim()
    const category = String(meta.category ?? '').trim()
    const prompt = String(meta.prompt ?? '').trim()
    if (!name || !prompt || !isStyleCategory(category)) continue

    const configuredCover = String(meta.cover ?? '').trim()
    const coverFile =
      configuredCover && IMAGE_EXT.has(extname(configuredCover).toLowerCase())
        ? configuredCover
        : await readFirstImage(styleDir)
    if (!coverFile) continue

    styles.push({
      id: `${STYLE_FOLDER}/${entry.name}`,
      name,
      category,
      cover: `${STYLE_FOLDER}/${entry.name}/${coverFile}`,
      prompt,
      version: Number(meta.version ?? 1),
      source: 'user'
    })
  }

  return styles.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

export async function listStyles(): Promise<StyleCard[]> {
  const [official, user] = await Promise.all([
    listOfficialStyles(),
    listUserStyles()
  ])
  return [...official, ...user]
}

async function findUserStyle(id: string): Promise<StyleCard | null> {
  const styles = await listUserStyles()
  return styles.find((style) => style.id === id) ?? null
}

async function uniqueStyleFolder(
  root: string,
  base: string
): Promise<string> {
  const safe = styleFolderName(base) || 'style'
  let candidate = safe
  let index = 2

  for (;;) {
    try {
      await fs.access(join(root, STYLE_FOLDER, candidate))
      candidate = `${safe}-${index}`
      index += 1
    } catch {
      return candidate
    }
  }
}

async function replaceCover(
  styleDir: string,
  sourcePath: string
): Promise<string> {
  const extension = extname(sourcePath).toLowerCase()
  if (!IMAGE_EXT.has(extension)) {
    throw new Error('封面必须是 png、jpg、jpeg、webp、gif 或 bmp 图片')
  }

  const entries = await fs.readdir(styleDir, { withFileTypes: true })
  for (const entry of entries) {
    if (
      entry.isFile() &&
      entry.name.startsWith('cover.') &&
      entry.name !== `cover${extension}`
    ) {
      await fs.rm(join(styleDir, entry.name), { force: true })
    }
  }

  const coverFile = `cover${extension}`
  const data = await fs.readFile(sourcePath)
  await fs.writeFile(join(styleDir, coverFile), data)
  return coverFile
}

async function writeMeta(styleDir: string, meta: StyleMeta): Promise<void> {
  await fs.writeFile(
    join(styleDir, STYLE_META),
    JSON.stringify(meta, null, 2),
    'utf8'
  )
}

export async function saveStyle(input: StyleSaveInput): Promise<StyleCard> {
  const name = input.name.trim()
  const prompt = input.prompt.trim()
  const category = input.category.trim()

  const nameError = validateStyleName(name)
  if (nameError) throw new Error(nameError)

  const promptError = validateStylePrompt(prompt)
  if (promptError) throw new Error(promptError)

  if (!isStyleCategory(category)) {
    throw new Error('请选择有效的风格分类')
  }

  const existing = input.id ? await findUserStyle(input.id) : null
  if (input.id && !existing) {
    throw new Error('只能编辑自定义风格')
  }

  const allStyles = await listStyles()
  const key = styleNameKey(name)
  const duplicate = allStyles.find(
    (style) => styleNameKey(style.name) === key && style.id !== input.id
  )
  if (duplicate) {
    throw new Error(
      duplicate.source === 'official'
        ? `与官方风格「${duplicate.name}」重名`
        : `与自定义风格「${duplicate.name}」重名`
    )
  }

  const libraryRoot = await getLibraryRoot()
  const stylesRoot = join(libraryRoot, STYLE_FOLDER)
  await fs.mkdir(stylesRoot, { recursive: true })

  if (existing) {
    const folder = existing.id.slice(STYLE_FOLDER.length + 1)
    const styleDir = join(stylesRoot, folder)
    const previousVersion = existing.version || 1
    const coverFile = input.coverSourcePath
      ? await replaceCover(styleDir, input.coverSourcePath)
      : existing.cover.slice(existing.cover.lastIndexOf('/') + 1)

    await writeMeta(styleDir, {
      name,
      category,
      prompt,
      cover: coverFile,
      version: previousVersion + 1,
      updatedAt: new Date().toISOString()
    })

    return {
      id: existing.id,
      name,
      category,
      cover: `${STYLE_FOLDER}/${folder}/${coverFile}`,
      prompt,
      version: previousVersion + 1,
      source: 'user'
    }
  }

  if (!input.coverSourcePath) {
    throw new Error('新建风格需要上传一张封面图片')
  }

  const folder = await uniqueStyleFolder(libraryRoot, name)
  const styleDir = join(stylesRoot, folder)
  await fs.mkdir(styleDir, { recursive: true })
  const coverFile = await replaceCover(styleDir, input.coverSourcePath)
  await writeMeta(styleDir, {
    name,
    category,
    prompt,
    cover: coverFile,
    version: 1,
    updatedAt: new Date().toISOString()
  })

  return {
    id: `${STYLE_FOLDER}/${folder}`,
    name,
    category,
    cover: `${STYLE_FOLDER}/${folder}/${coverFile}`,
    prompt,
    version: 1,
    source: 'user'
  }
}

export async function deleteStyle(id: string): Promise<void> {
  if (!id.startsWith(`${STYLE_FOLDER}/`)) {
    throw new Error('只能删除自定义风格')
  }

  const libraryRoot = await getLibraryRoot()
  const stylesRoot = resolve(libraryRoot, STYLE_FOLDER)
  const target = resolve(libraryRoot, id)
  const prefix = stylesRoot.endsWith(sep) ? stylesRoot : `${stylesRoot}${sep}`

  if (!target.startsWith(prefix)) {
    throw new Error('无效的风格路径')
  }

  await fs.rm(target, { recursive: true, force: true })
}
