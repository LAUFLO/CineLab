import { promises as fs } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import {
  MAX_SKILL_DESCRIPTION_LENGTH,
  MAX_SKILL_UPLOAD_BYTES,
  MAX_SKILL_UPLOAD_FILES,
  SKILL_NAME_PATTERN,
  normalizeSkillPath,
  parseSkillMarkdown,
  type SkillAdminEntry,
  type SkillCloneInput,
  type SkillFileContent,
  type SkillFileEntry,
  type SkillOverrideInput,
  type SkillScope,
  type SkillUploadFolder,
  type SkillUploadResult,
  type SkillWriteInput
} from '@shared/skills'
import {
  isWithin,
  projectSkillsDirectory,
  readSkillManifest,
  skillLocations
} from './skills'
import {
  loadSkillOverrides,
  removeSkillOverride,
  saveSkillOverride,
  skillOverrideKey
} from './skills-config'

const BINARY_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'bmp',
  'ico',
  'mp4',
  'webm',
  'mov',
  'mp3',
  'wav',
  'm4a',
  'zip',
  'gz',
  'pdf',
  'woff',
  'woff2',
  'ttf'
])

function isBinaryPath(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return BINARY_EXTENSIONS.has(ext)
}

function assertName(name: string): string {
  if (!SKILL_NAME_PATTERN.test(name)) {
    throw new Error('技能名称必须以小写字母开头，只包含字母、数字和连字符')
  }
  return name
}

function assertEditableScope(scope: SkillScope): asserts scope is 'global' | 'project' {
  if (scope === 'builtin') throw new Error('内置技能只读，不能修改')
}

function assertDescription(description: string): void {
  if (
    !description.trim() ||
    description.length > MAX_SKILL_DESCRIPTION_LENGTH ||
    description.includes('\n')
  ) {
    throw new Error(`描述不能为空、不能换行，最多 ${MAX_SKILL_DESCRIPTION_LENGTH} 字`)
  }
}

function assertVersion(version?: string): string | undefined {
  if (version === undefined || version.trim() === '') return undefined
  const value = version.trim()
  if (value.length > 100 || value.includes('\n')) {
    throw new Error('版本号无效')
  }
  return value
}

function locationFor(root: string, scope: SkillScope) {
  const location = skillLocations(root).find((item) => item.scope === scope)
  if (!location) throw new Error('技能作用域无效')
  return location
}

function skillDirectory(root: string, scope: SkillScope, name: string): string {
  return join(locationFor(root, scope).directory, assertName(name))
}

export function skillScopeDirectory(
  root: string,
  scope: SkillScope
): string {
  return locationFor(root, scope).directory
}

function serializeSkill(input: {
  name: string
  description: string
  version?: string
  body: string
  disableModelInvocation?: boolean
}): string {
  const lines = [
    '---',
    `name: ${input.name}`,
    `description: ${input.description.trim()}`,
    ...(input.version ? [`version: ${input.version}`] : []),
    ...(input.disableModelInvocation
      ? ['disableModelInvocation: true']
      : []),
    '---',
    '',
    input.body.trim(),
    ''
  ]
  return lines.join('\n')
}

async function writeSkillFile(file: string, content: string): Promise<void> {
  await fs.mkdir(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  await fs.writeFile(tmp, content, 'utf8')
  await fs.rename(tmp, file)
}

export async function listSkillAdmin(root: string): Promise<SkillAdminEntry[]> {
  const overrides = await loadSkillOverrides(root)
  const entries: SkillAdminEntry[] = []

  for (const location of skillLocations(root)) {
    let directories
    try {
      directories = await fs.readdir(location.directory, {
        withFileTypes: true
      })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw error
    }

    for (const entry of directories) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      const summary = await readSkillManifest(
        join(location.directory, entry.name),
        location.scope
      )
      if (!summary) continue

      const override = overrides[skillOverrideKey(location.scope, summary.name)]
      entries.push({
        ...summary,
        disableModelInvocation:
          override?.disableModelInvocation ??
          summary.disableModelInvocation ??
          false,
        enabled: override?.enabled !== false,
        editable: location.scope !== 'builtin'
      })
    }
  }

  const priority: Record<SkillScope, number> = {
    builtin: 0,
    global: 1,
    project: 2
  }
  for (const entry of entries) {
    const shadow = entries.find(
      (other) =>
        other.name === entry.name &&
        priority[other.scope] > priority[entry.scope]
    )
    if (shadow) entry.shadowedBy = shadow.scope
  }

  return entries.sort((left, right) => {
    const scopeDiff = priority[left.scope] - priority[right.scope]
    return scopeDiff !== 0
      ? scopeDiff
      : left.name.localeCompare(right.name)
  })
}

async function findAdminEntry(
  root: string,
  scope: SkillScope,
  name: string
): Promise<SkillAdminEntry | null> {
  const entries = await listSkillAdmin(root)
  return (
    entries.find(
      (entry) => entry.scope === scope && entry.name === name
    ) ?? null
  )
}

export async function createSkill(
  root: string,
  input: SkillWriteInput
): Promise<SkillAdminEntry> {
  assertEditableScope(input.scope)
  assertName(input.name)
  assertDescription(input.description)
  const version = assertVersion(input.version)
  if (input.body.length > 256 * 1024) throw new Error('技能正文超过 256KB')

  const directory = skillDirectory(root, input.scope, input.name)
  try {
    await fs.access(directory)
    throw new Error('同名技能已经存在')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }

  await fs.mkdir(join(directory, 'references'), { recursive: true })
  await fs.mkdir(join(directory, 'assets'), { recursive: true })
  await writeSkillFile(
    join(directory, 'SKILL.md'),
    serializeSkill({
      name: input.name,
      description: input.description,
      ...(version ? { version } : {}),
      body: input.body
    })
  )

  const created = await findAdminEntry(root, input.scope, input.name)
  if (!created) throw new Error('创建技能失败')
  return created
}

export async function saveSkill(
  root: string,
  input: SkillWriteInput
): Promise<SkillAdminEntry> {
  assertEditableScope(input.scope)
  assertName(input.name)
  assertDescription(input.description)
  const version = assertVersion(input.version)
  if (input.body.length > 256 * 1024) throw new Error('技能正文超过 256KB')

  const directory = skillDirectory(root, input.scope, input.name)
  const existing = await readSkillManifest(directory, input.scope)
  if (!existing) throw new Error('找不到要保存的技能')

  await writeSkillFile(
    join(directory, 'SKILL.md'),
    serializeSkill({
      name: input.name,
      description: input.description,
      ...(version ? { version } : {}),
      body: input.body,
      ...(existing.disableModelInvocation
        ? { disableModelInvocation: true }
        : {})
    })
  )

  const saved = await findAdminEntry(root, input.scope, input.name)
  if (!saved) throw new Error('保存技能失败')
  return saved
}

export async function deleteSkill(
  root: string,
  scope: SkillScope,
  name: string
): Promise<void> {
  assertEditableScope(scope)
  const directory = skillDirectory(root, scope, name)
  const parent = locationFor(root, scope).directory
  let realParent: string
  let realDirectory: string
  try {
    realParent = await fs.realpath(parent)
    realDirectory = await fs.realpath(directory)
  } catch {
    throw new Error('找不到要删除的技能')
  }
  if (!isWithin(realParent, realDirectory)) {
    throw new Error('技能目录越界')
  }
  await fs.rm(realDirectory, { recursive: true, force: true })
  await removeSkillOverride(root, scope, name)
}

export async function readSkillFile(
  root: string,
  input: { scope: SkillScope; name: string; path?: string }
): Promise<SkillFileContent> {
  const directory = skillDirectory(root, input.scope, input.name)
  const relativePath = normalizeSkillPath(input.path)
  if (!relativePath) throw new Error('技能文件路径无效')
  const target = resolve(directory, relativePath)
  if (!isWithin(directory, target)) throw new Error('技能文件路径越界')

  let realDirectory: string
  let realTarget: string
  try {
    realDirectory = await fs.realpath(directory)
    realTarget = await fs.realpath(target)
  } catch {
    throw new Error('技能文件不存在')
  }
  if (!isWithin(realDirectory, realTarget)) throw new Error('技能文件路径越界')

  const info = await fs.lstat(realTarget)
  if (!info.isFile()) throw new Error('技能路径不是文件')

  const maxBytes = relativePath === 'SKILL.md' ? 256 * 1024 : 2 * 1024 * 1024
  if (info.size <= 0 || info.size > maxBytes) {
    throw new Error('技能文件为空或超过大小限制')
  }

  const buffer = await fs.readFile(realTarget)
  const binary =
    isBinaryPath(relativePath) || buffer.subarray(0, 8192).includes(0)
  if (binary) {
    return { path: relativePath, size: info.size, binary: true }
  }

  let content = buffer.toString('utf8')
  if (relativePath === 'SKILL.md') {
    const parsed = parseSkillMarkdown(content)
    if (!parsed) throw new Error('SKILL.md 格式无效')
    content = parsed.body
  }
  return { path: relativePath, size: info.size, binary: false, content }
}

export async function listSkillFiles(
  root: string,
  input: { scope: SkillScope; name: string }
): Promise<SkillFileEntry[]> {
  const directory = skillDirectory(root, input.scope, input.name)
  const files: SkillFileEntry[] = []

  const walk = async (relativeDir: string, depth: number): Promise<void> => {
    if (depth > 4 || files.length >= 200) return
    let entries
    try {
      entries = await fs.readdir(join(directory, relativeDir), {
        withFileTypes: true
      })
    } catch {
      return
    }

    for (const entry of entries) {
      if (files.length >= 200) return
      const relativePath = relativeDir
        ? `${relativeDir}/${entry.name}`
        : entry.name
      const absolute = join(directory, relativePath)
      if (entry.isDirectory()) {
        if (relativeDir === '' && !['references', 'assets'].includes(entry.name)) {
          continue
        }
        await walk(relativePath, depth + 1)
        continue
      }
      if (!entry.isFile() || entry.isSymbolicLink()) continue
      const info = await fs.lstat(absolute)
      files.push({
        path: relativePath,
        size: info.size,
        binary: isBinaryPath(relativePath)
      })
    }
  }

  await walk('', 0)
  return files.sort((left, right) => left.path.localeCompare(right.path))
}

function assertUploadFolder(folder: string): asserts folder is SkillUploadFolder {
  if (folder !== 'references' && folder !== 'assets') {
    throw new Error('只能上传到 references 或 assets')
  }
}

function safeFileName(filePath: string): string {
  const fileName = basename(filePath)
  if (
    !fileName ||
    fileName === '.' ||
    fileName === '..' ||
    fileName.length > 200 ||
    /[\\/:*?"<>|\u0000-\u001f]/.test(fileName)
  ) {
    throw new Error(`文件名无效：${fileName}`)
  }
  return fileName
}

export async function importSkillFiles(
  root: string,
  input: {
    scope: SkillScope
    name: string
    folder: SkillUploadFolder
    files: string[]
  }
): Promise<SkillUploadResult> {
  assertEditableScope(input.scope)
  assertUploadFolder(input.folder)
  const directory = await skillDirectoryFor(root, input.scope, input.name)
  if (
    input.files.length === 0 ||
    input.files.length > MAX_SKILL_UPLOAD_FILES
  ) {
    throw new Error(`一次最多上传 ${MAX_SKILL_UPLOAD_FILES} 个文件`)
  }

  const targetDirectory = join(directory, input.folder)
  await fs.mkdir(targetDirectory, { recursive: true })
  const uploaded: string[] = []
  const overwritten: string[] = []
  let totalBytes = 0

  for (const source of input.files) {
    const fileName = safeFileName(source)
    const info = await fs.stat(source).catch(() => null)
    if (!info?.isFile()) throw new Error(`不是文件：${fileName}`)
    if (info.size <= 0) throw new Error(`文件为空：${fileName}`)
    if (info.size > MAX_SKILL_UPLOAD_BYTES) {
      throw new Error(`文件超过 20MB：${fileName}`)
    }
    totalBytes += info.size
    if (totalBytes > MAX_SKILL_UPLOAD_BYTES * 5) {
      throw new Error('单次上传总大小不能超过 100MB')
    }

    const target = join(targetDirectory, fileName)
    const relativePath = `${input.folder}/${fileName}`
    try {
      await fs.access(target)
      overwritten.push(relativePath)
    } catch {
      uploaded.push(relativePath)
    }
    await fs.copyFile(source, target)
  }

  return {
    uploaded,
    overwritten,
    files: await listSkillFiles(root, {
      scope: input.scope,
      name: input.name
    })
  }
}

export async function removeSkillFile(
  root: string,
  input: { scope: SkillScope; name: string; path: string }
): Promise<SkillFileEntry[]> {
  assertEditableScope(input.scope)
  const directory = await skillDirectoryFor(root, input.scope, input.name)
  const relativePath = normalizeSkillPath(input.path)
  if (
    !relativePath ||
    (!relativePath.startsWith('references/') &&
      !relativePath.startsWith('assets/'))
  ) {
    throw new Error('只能删除 references 或 assets 下的文件')
  }
  const target = resolve(directory, relativePath)
  if (!isWithin(directory, target)) throw new Error('技能文件路径越界')
  const info = await fs.lstat(target).catch(() => null)
  if (!info?.isFile()) throw new Error('技能文件不存在')
  await fs.rm(target, { force: true })
  return listSkillFiles(root, {
    scope: input.scope,
    name: input.name
  })
}

export async function cloneSkill(
  root: string,
  input: SkillCloneInput
): Promise<SkillAdminEntry> {
  assertEditableScope(input.targetScope)
  assertName(input.sourceName)
  const sourceDirectory = await skillDirectoryFor(
    root,
    input.sourceScope,
    input.sourceName
  )
  const targetDirectory = skillDirectory(
    root,
    input.targetScope,
    input.sourceName
  )
  try {
    await fs.access(targetDirectory)
    throw new Error('目标作用域已有同名技能')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }

  await fs.cp(sourceDirectory, targetDirectory, {
    recursive: true,
    errorOnExist: true,
    force: false
  })
  await removeSkillOverride(root, input.targetScope, input.sourceName)

  const created = await findAdminEntry(
    root,
    input.targetScope,
    input.sourceName
  )
  if (!created) throw new Error('创建技能覆盖失败')
  return created
}

export async function setSkillOverride(
  root: string,
  input: SkillOverrideInput
): Promise<SkillAdminEntry> {
  if (input.scope !== 'builtin') {
    const location = locationFor(root, input.scope)
    const manifest = await readSkillManifest(
      join(location.directory, input.name),
      input.scope
    )
    if (!manifest) throw new Error('找不到该技能')
  }

  await saveSkillOverride(root, input.scope, input.name, {
    ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    ...(input.disableModelInvocation !== undefined
      ? { disableModelInvocation: input.disableModelInvocation }
      : {})
  })

  const entry = await findAdminEntry(root, input.scope, input.name)
  if (!entry) throw new Error('技能状态已保存，但读取失败')
  return entry
}

export async function skillDirectoryFor(
  root: string,
  scope: SkillScope,
  name: string
): Promise<string> {
  const directory = skillDirectory(root, scope, name)
  const manifest = await readSkillManifest(directory, scope)
  if (!manifest) throw new Error('找不到该技能')
  return directory
}

export async function skillFileFor(
  root: string,
  input: { scope: SkillScope; name: string; path: string }
): Promise<string> {
  const directory = await skillDirectoryFor(root, input.scope, input.name)
  const relativePath = normalizeSkillPath(input.path)
  if (!relativePath) throw new Error('技能文件路径无效')
  const target = resolve(directory, relativePath)
  if (!isWithin(directory, target)) throw new Error('技能文件路径越界')
  await fs.access(target)
  return target
}

export async function ensureScopeDirectory(
  root: string,
  scope: SkillScope
): Promise<string> {
  const directory = skillScopeDirectory(root, scope)
  if (scope !== 'builtin') await fs.mkdir(directory, { recursive: true })
  return directory
}

export function projectSkillDirectory(root: string): string {
  return projectSkillsDirectory(root)
}
