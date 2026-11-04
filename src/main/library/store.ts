import { createHash, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import type {
  CharacterCard,
  CharacterInput,
  LibraryMaterial,
  MaterialKind,
  PromptTemplate,
  TemplateInput
} from '@shared/library-schema'
import { getCurrentProjectRoot } from '../project/manager'

interface CharacterFile {
  version: 1
  characters: CharacterCard[]
}

interface MaterialFile {
  version: 1
  materials: LibraryMaterial[]
}

interface TemplateFile {
  version: 1
  templates: PromptTemplate[]
}

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])
const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov'])
const AUDIO_EXT = new Set(['.mp3', '.wav', '.m4a', '.ogg'])

function projectRoot(): string {
  const root = getCurrentProjectRoot()
  if (!root) throw new Error('没有打开的项目')
  return root
}

function libraryFile(name: 'characters' | 'materials' | 'templates'): string {
  return join(projectRoot(), 'library', `${name}.json`)
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  await fs.mkdir(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')

  try {
    await fs.rename(tmp, file)
  } catch {
    await fs.rm(file, { force: true })
    await fs.rename(tmp, file)
  }
}

function kindFromExt(ext: string): MaterialKind | null {
  if (IMAGE_EXT.has(ext)) return 'image'
  if (VIDEO_EXT.has(ext)) return 'video'
  if (AUDIO_EXT.has(ext)) return 'audio'
  return null
}

export async function listCharacters(): Promise<CharacterCard[]> {
  const data = await readJson<CharacterFile>(libraryFile('characters'), {
    version: 1,
    characters: []
  })
  return Array.isArray(data.characters) ? data.characters : []
}

export async function saveCharacter(input: CharacterInput): Promise<CharacterCard> {
  const list = await listCharacters()
  const now = new Date().toISOString()
  const existing = input.id ? list.find((item) => item.id === input.id) : undefined
  const referencePaths = input.referencePaths.filter((path) => path.startsWith('library/'))

  const card: CharacterCard = {
    id: existing?.id ?? randomUUID(),
    name: input.name.trim() || '未命名角色',
    description: input.description.trim(),
    avatarPath: referencePaths[0] ?? existing?.avatarPath,
    referencePaths,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  }

  const next = existing
    ? list.map((item) => (item.id === card.id ? card : item))
    : [...list, card]

  await writeJsonAtomic(libraryFile('characters'), { version: 1, characters: next })
  return card
}

export async function deleteCharacter(id: string): Promise<void> {
  const list = await listCharacters()
  await writeJsonAtomic(libraryFile('characters'), {
    version: 1,
    characters: list.filter((item) => item.id !== id)
  })
}

export async function ingestLibraryFile(
  sourcePath: string,
  folder: 'characters' | 'materials'
): Promise<string> {
  const ext = extname(sourcePath).toLowerCase()
  const kind = kindFromExt(ext)
  if (!kind) throw new Error(`不支持的素材格式：${ext || '未知'}`)

  const data = await fs.readFile(sourcePath)
  const hash = createHash('sha256').update(data).digest('hex').slice(0, 24)
  const relativePath = `library/${folder}/${hash}${ext}`
  const absolutePath = join(projectRoot(), relativePath)

  try {
    await fs.access(absolutePath)
  } catch {
    await fs.mkdir(dirname(absolutePath), { recursive: true })
    await fs.writeFile(absolutePath, data)
  }

  return relativePath
}

export async function listMaterials(): Promise<LibraryMaterial[]> {
  const data = await readJson<MaterialFile>(libraryFile('materials'), {
    version: 1,
    materials: []
  })
  return Array.isArray(data.materials) ? data.materials : []
}

export async function importMaterials(sourcePaths: string[]): Promise<LibraryMaterial[]> {
  const list = await listMaterials()
  const imported: LibraryMaterial[] = []

  for (const sourcePath of sourcePaths) {
    const ext = extname(sourcePath).toLowerCase()
    const kind = kindFromExt(ext)
    if (!kind) continue

    const relativePath = await ingestLibraryFile(sourcePath, 'materials')
    const existing = list.find((item) => item.path === relativePath)

    if (existing) {
      imported.push(existing)
      continue
    }

    const material: LibraryMaterial = {
      id: randomUUID(),
      name: basename(sourcePath, extname(sourcePath)),
      path: relativePath,
      kind,
      createdAt: new Date().toISOString()
    }

    list.push(material)
    imported.push(material)
  }

  await writeJsonAtomic(libraryFile('materials'), { version: 1, materials: list })
  return imported
}

export async function deleteMaterial(id: string): Promise<void> {
  const list = await listMaterials()
  await writeJsonAtomic(libraryFile('materials'), {
    version: 1,
    materials: list.filter((item) => item.id !== id)
  })
}

export async function listTemplates(): Promise<PromptTemplate[]> {
  const data = await readJson<TemplateFile>(libraryFile('templates'), {
    version: 1,
    templates: []
  })
  return Array.isArray(data.templates) ? data.templates : []
}

export async function saveTemplate(input: TemplateInput): Promise<PromptTemplate> {
  const list = await listTemplates()
  const now = new Date().toISOString()
  const existing = input.id ? list.find((item) => item.id === input.id) : undefined

  const template: PromptTemplate = {
    id: existing?.id ?? randomUUID(),
    name: input.name.trim() || '未命名模板',
    kind: input.kind,
    prompt: input.prompt.trim(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  }

  const next = existing
    ? list.map((item) => (item.id === template.id ? template : item))
    : [...list, template]

  await writeJsonAtomic(libraryFile('templates'), { version: 1, templates: next })
  return template
}

export async function deleteTemplate(id: string): Promise<void> {
  const list = await listTemplates()
  await writeJsonAtomic(libraryFile('templates'), {
    version: 1,
    templates: list.filter((item) => item.id !== id)
  })
}
