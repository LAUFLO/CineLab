import { promises as fs, type Dirent } from 'node:fs'
import { basename, extname, join, sep } from 'node:path'
import type {
  PromptTemplate,
  TemplateInput
} from '@shared/library-schema'
import { PROMPT_FOLDER, TEMPLATE_EXT } from '@shared/library-schema'
import { getLibraryRoot } from './config'

interface TemplateFile {
  version: 1
  kind: PromptTemplate['kind']
  prompt: string
}

const NODE_KINDS = new Set<PromptTemplate['kind']>(['text', 'image', 'video', 'audio'])

function templateDir(root: string): string {
  return join(root, PROMPT_FOLDER)
}

function safeTemplatePath(root: string, relPath: string): string {
  const target = join(root, ...relPath.split('/'))
  const base = templateDir(root)
  if (target !== base && !target.startsWith(`${base}${sep}`)) {
    throw new Error('模板路径超出资产库范围')
  }
  return target
}

function sanitizeName(name: string): string {
  const trimmed = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/[. ]+$/g, '')
    .trim()

  if (!trimmed) return '未命名模板'
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(trimmed)) {
    return `${trimmed}-模板`
  }
  return trimmed.slice(0, 80)
}

async function exists(path: string): Promise<boolean> {
  return fs
    .access(path)
    .then(() => true)
    .catch(() => false)
}

function stripExt(fileName: string): string {
  return fileName.endsWith(TEMPLATE_EXT)
    ? fileName.slice(0, -TEMPLATE_EXT.length)
    : basename(fileName, extname(fileName))
}

export async function listTemplates(): Promise<PromptTemplate[]> {
  const root = await getLibraryRoot()
  const dir = templateDir(root)

  let entries: Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }

  const templates: PromptTemplate[] = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(TEMPLATE_EXT)) continue

    const absolute = join(dir, entry.name)
    try {
      const raw = JSON.parse(await fs.readFile(absolute, 'utf8')) as Partial<TemplateFile>
      const kind = NODE_KINDS.has(raw.kind as PromptTemplate['kind'])
        ? (raw.kind as PromptTemplate['kind'])
        : 'image'
      const info = await fs.stat(absolute)
      const relPath = `${PROMPT_FOLDER}/${entry.name}`

      templates.push({
        id: relPath,
        name: stripExt(entry.name),
        kind,
        prompt: typeof raw.prompt === 'string' ? raw.prompt : '',
        createdAt: info.birthtime.toISOString(),
        updatedAt: info.mtime.toISOString()
      })
    } catch {
      // 损坏的模板文件直接跳过
    }
  }

  return templates.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

export async function saveTemplate(input: TemplateInput): Promise<PromptTemplate> {
  const root = await getLibraryRoot()
  const dir = templateDir(root)
  await fs.mkdir(dir, { recursive: true })

  const name = sanitizeName(input.name.trim() || '未命名模板')
  const target = join(dir, `${name}${TEMPLATE_EXT}`)
  const previous = input.id ? safeTemplatePath(root, input.id) : null

  const payload: TemplateFile = {
    version: 1,
    kind: input.kind,
    prompt: input.prompt.trim()
  }

  if (previous && previous !== target && (await exists(previous))) {
    await fs.rm(previous, { force: true })
  }

  await fs.writeFile(target, JSON.stringify(payload, null, 2), 'utf8')
  const info = await fs.stat(target)
  const relPath = `${PROMPT_FOLDER}/${name}${TEMPLATE_EXT}`

  return {
    id: relPath,
    name,
    kind: input.kind,
    prompt: payload.prompt,
    createdAt: info.birthtime.toISOString(),
    updatedAt: info.mtime.toISOString()
  }
}

export async function deleteTemplate(id: string): Promise<void> {
  const root = await getLibraryRoot()
  if (!id.endsWith(TEMPLATE_EXT)) throw new Error('模板路径无效')

  const target = safeTemplatePath(root, id)
  await fs.rm(target, { force: true })
}
