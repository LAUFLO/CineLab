import { promises as fs, type Dirent } from 'node:fs'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'
import type {
  AddToLibraryInput,
  CharacterCard,
  LibraryAsset,
  LibraryAssetKind,
  LibraryFolderNode
} from '@shared/library-schema'
import { CHARACTER_FOLDER, DEFAULT_LIBRARY_FOLDERS } from '@shared/library-schema'
import { getCurrentProjectRoot } from '../project/manager'
import { getLibraryRoot } from './config'

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'])
const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov', '.mkv'])
const AUDIO_EXT = new Set(['.mp3', '.wav', '.m4a', '.ogg', '.flac'])

function toPosix(path: string): string {
  return path.split(sep).join('/')
}

function toNative(path: string): string {
  return path.split('/').filter(Boolean).join(sep)
}

function safeJoin(root: string, relPath: string): string {
  const rootResolved = resolve(root)
  const target = resolve(rootResolved, toNative(relPath))
  if (target !== rootResolved && !target.startsWith(`${rootResolved}${sep}`)) {
    throw new Error('路径超出资产库范围')
  }
  return target
}

function isIgnored(name: string): boolean {
  if (name.startsWith('.')) return true
  if (name === 'Thumbs.db' || name === 'desktop.ini') return true
  if (name.endsWith('.prompt.json')) return true
  if (name.endsWith('.meta.json')) return true
  return false
}

function kindFromExt(ext: string): LibraryAssetKind | null {
  if (IMAGE_EXT.has(ext)) return 'image'
  if (VIDEO_EXT.has(ext)) return 'video'
  if (AUDIO_EXT.has(ext)) return 'audio'
  return null
}

function sanitizeName(name: string): string {
  const trimmed = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/[. ]+$/g, '')
    .trim()

  if (!trimmed) return '未命名'
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(trimmed)) return `${trimmed}-素材`
  return trimmed.slice(0, 80)
}

async function exists(path: string): Promise<boolean> {
  return fs
    .access(path)
    .then(() => true)
    .catch(() => false)
}

async function uniqueTarget(
  dir: string,
  name: string,
  ext: string
): Promise<{ absolute: string; fileName: string }> {
  const safe = sanitizeName(name)
  let index = 1

  for (;;) {
    const fileName = index === 1 ? `${safe}${ext}` : `${safe} (${index})${ext}`
    const absolute = join(dir, fileName)
    if (!(await exists(absolute))) return { absolute, fileName }
    index += 1
    if (index > 9999) throw new Error('同名文件过多')
  }
}

async function pathToAsset(root: string, relPath: string): Promise<LibraryAsset> {
  const absolute = safeJoin(root, relPath)
  const info = await fs.stat(absolute)
  const ext = extname(absolute).toLowerCase()
  const kind = kindFromExt(ext)

  if (!kind) throw new Error(`不支持的素材格式：${ext || '未知'}`)

  return {
    path: toPosix(relPath),
    name: basename(absolute, extname(absolute)),
    fileName: basename(absolute),
    kind,
    size: info.size,
    modifiedAt: info.mtime.toISOString()
  }
}

export async function listAssets(folder: string): Promise<LibraryAsset[]> {
  const root = await getLibraryRoot()
  const dir = safeJoin(root, folder)

  let entries: Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }

  const assets: LibraryAsset[] = []
  for (const entry of entries) {
    if (!entry.isFile() || isIgnored(entry.name)) continue
    if (!kindFromExt(extname(entry.name).toLowerCase())) continue

    const relPath = toPosix(join(toNative(folder), entry.name))
    assets.push(await pathToAsset(root, relPath))
  }

  return assets.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

async function countAssets(dir: string): Promise<number> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    return entries.filter(
      (entry) =>
        entry.isFile() &&
        !isIgnored(entry.name) &&
        Boolean(kindFromExt(extname(entry.name).toLowerCase()))
    ).length
  } catch {
    return 0
  }
}

async function walkFolders(
  root: string,
  parentPath: string,
  depth: number
): Promise<LibraryFolderNode[]> {
  if (depth > 8) return []

  const dir = safeJoin(root, parentPath)
  let entries: Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }

  const nodes: LibraryFolderNode[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || isIgnored(entry.name)) continue

    const childPath = toPosix(join(toNative(parentPath), entry.name))
    const childDir = safeJoin(root, childPath)
    const [children, assetCount] = await Promise.all([
      walkFolders(root, childPath, depth + 1),
      countAssets(childDir)
    ])

    nodes.push({
      path: childPath,
      name: entry.name,
      children,
      assetCount
    })
  }

  return nodes.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

export async function listTree(): Promise<LibraryFolderNode[]> {
  const root = await getLibraryRoot()
  return walkFolders(root, '', 0)
}

export async function listAllAssets(): Promise<LibraryAsset[]> {
  const root = await getLibraryRoot()
  const result: LibraryAsset[] = []

  const walk = async (relPath: string, depth: number): Promise<void> => {
    if (depth > 8 || result.length >= 2000) return

    const dir = safeJoin(root, relPath)
    let entries: Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (result.length >= 2000) break
      if (isIgnored(entry.name)) continue

      const childPath = toPosix(join(toNative(relPath), entry.name))
      if (entry.isDirectory()) {
        await walk(childPath, depth + 1)
      } else if (kindFromExt(extname(entry.name).toLowerCase())) {
        result.push(await pathToAsset(root, childPath))
      }
    }
  }

  await walk('', 0)
  return result.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

export async function createFolder(
  parent: string,
  name: string
): Promise<LibraryFolderNode> {
  const root = await getLibraryRoot()
  const parentDir = safeJoin(root, parent)
  const folderName = sanitizeName(name)
  const target = join(parentDir, folderName)

  if (await exists(target)) throw new Error('同名文件夹已存在')
  await fs.mkdir(target, { recursive: true })

  return {
    path: parent ? `${parent}/${folderName}` : folderName,
    name: folderName,
    children: [],
    assetCount: 0
  }
}

function assertEditableFolder(relPath: string): void {
  const normalized = relPath.replace(/^\/+|\/+$/g, '')
  if (!normalized) throw new Error('不能操作资产库根目录')
  if ((DEFAULT_LIBRARY_FOLDERS as readonly string[]).includes(normalized)) {
    throw new Error('默认文件夹不能重命名或删除')
  }
}

export async function renameFolder(relPath: string, name: string): Promise<string> {
  const root = await getLibraryRoot()
  assertEditableFolder(relPath)

  const source = safeJoin(root, relPath)
  const folderName = sanitizeName(name)
  const target = join(dirname(source), folderName)

  if (resolve(source) === resolve(target)) return relPath
  if (await exists(target)) throw new Error('同名文件夹已存在')

  await fs.rename(source, target)

  const parent = relPath.split('/').slice(0, -1).join('/')
  return parent ? `${parent}/${folderName}` : folderName
}

export async function deleteFolder(relPath: string): Promise<void> {
  const root = await getLibraryRoot()
  assertEditableFolder(relPath)

  const target = safeJoin(root, relPath)
  const entries = await fs.readdir(target)
  if (entries.length > 0) {
    throw new Error('文件夹不为空，请先清空其中的文件和子文件夹')
  }

  await fs.rmdir(target)
}

export async function importFiles(
  folder: string,
  sourcePaths: string[]
): Promise<LibraryAsset[]> {
  const root = await getLibraryRoot()
  const targetDir = safeJoin(root, folder)
  await fs.mkdir(targetDir, { recursive: true })

  const imported: LibraryAsset[] = []
  for (const sourcePath of sourcePaths) {
    const ext = extname(sourcePath).toLowerCase()
    if (!kindFromExt(ext)) continue

    const target = await uniqueTarget(
      targetDir,
      basename(sourcePath, extname(sourcePath)),
      ext
    )
    await fs.copyFile(sourcePath, target.absolute)

    const relPath = toPosix(join(toNative(folder), target.fileName))
    imported.push(await pathToAsset(root, relPath))
  }

  return imported
}

export async function addAsset(input: AddToLibraryInput): Promise<LibraryAsset> {
  const root = await getLibraryRoot()
  const sourceBase = input.scope === 'global' ? root : getCurrentProjectRoot()
  if (!sourceBase) throw new Error('没有打开的项目')

  const source = safeJoin(sourceBase, input.sourcePath)
  const ext = extname(source).toLowerCase()
  if (!kindFromExt(ext)) throw new Error('只有图片、视频或音频可以加入资产库')

  const targetDir = safeJoin(root, input.folder)
  await fs.mkdir(targetDir, { recursive: true })

  const target = await uniqueTarget(targetDir, input.name, ext)
  if (resolve(source) !== resolve(target.absolute)) {
    await fs.copyFile(source, target.absolute)
  }

  const relPath = toPosix(join(toNative(input.folder), target.fileName))
  return pathToAsset(root, relPath)
}

export async function renameAsset(relPath: string, name: string): Promise<string> {
  const root = await getLibraryRoot()
  const source = safeJoin(root, relPath)
  const ext = extname(source)
  const target = await uniqueTarget(dirname(source), name, ext)

  if (resolve(source) !== resolve(target.absolute)) {
    await fs.rename(source, target.absolute)
  }

  const folder = relPath.split('/').slice(0, -1).join('/')
  return toPosix(join(toNative(folder), target.fileName))
}

export async function moveAsset(
  relPath: string,
  folder: string
): Promise<string> {
  const root = await getLibraryRoot()
  const source = safeJoin(root, relPath)
  const info = await fs.stat(source)
  if (!info.isFile()) throw new Error('目标不是文件')

  const targetDir = safeJoin(root, folder)
  if (resolve(dirname(source)) === resolve(targetDir)) return relPath

  await fs.mkdir(targetDir, { recursive: true })

  const ext = extname(source)
  const name = basename(source, ext)
  const target = await uniqueTarget(targetDir, name, ext)
  await fs.rename(source, target.absolute)

  return folder ? `${folder}/${target.fileName}` : target.fileName
}

export async function deleteAsset(relPath: string): Promise<void> {
  const root = await getLibraryRoot()
  const target = safeJoin(root, relPath)
  const info = await fs.stat(target)
  if (!info.isFile()) throw new Error('目标不是文件')
  await fs.rm(target, { force: true })
}

export async function revealPath(relPath: string): Promise<void> {
  const { shell } = await import('electron')
  const root = await getLibraryRoot()
  const target = relPath ? safeJoin(root, relPath) : root
  shell.showItemInFolder(target)
}

async function collectImages(root: string, relPath: string): Promise<string[]> {
  const dir = safeJoin(root, relPath)
  let entries: Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }

  const result: string[] = []
  for (const entry of entries) {
    if (isIgnored(entry.name)) continue
    const childPath = toPosix(join(toNative(relPath), entry.name))

    if (entry.isDirectory()) {
      result.push(...(await collectImages(root, childPath)))
    } else if (IMAGE_EXT.has(extname(entry.name).toLowerCase())) {
      result.push(childPath)
    }
  }

  return result.sort((a, b) => a.localeCompare(b, 'zh-CN'))
}

/**
 * 「角色」文件夹的只读投影：
 * - 角色/<角色名>/ 下的图片 = 一个角色
 * - 角色/单图.png = 单图角色
 */
export async function listCharacters(): Promise<CharacterCard[]> {
  const root = await getLibraryRoot()
  const dir = safeJoin(root, CHARACTER_FOLDER)

  let entries: Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }

  const cards: CharacterCard[] = []
  for (const entry of entries) {
    if (isIgnored(entry.name)) continue

    const relPath = `${CHARACTER_FOLDER}/${entry.name}`
    const info = await fs.stat(safeJoin(root, relPath))

    if (entry.isDirectory()) {
      const images = await collectImages(root, relPath)
      if (images.length === 0) continue

      cards.push({
        id: relPath,
        name: entry.name,
        description: '',
        avatarPath: images[0],
        referencePaths: images,
        createdAt: info.birthtime.toISOString(),
        updatedAt: info.mtime.toISOString()
      })
    } else if (IMAGE_EXT.has(extname(entry.name).toLowerCase())) {
      cards.push({
        id: relPath,
        name: basename(entry.name, extname(entry.name)),
        description: '',
        avatarPath: relPath,
        referencePaths: [relPath],
        createdAt: info.birthtime.toISOString(),
        updatedAt: info.mtime.toISOString()
      })
    }
  }

  return cards.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}
