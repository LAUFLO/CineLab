import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import {
  MAX_SKILL_BODY_BYTES,
  MAX_SKILL_IMPORT_FILE_BYTES,
  MAX_SKILL_IMPORT_FILES,
  MAX_SKILL_IMPORT_TOTAL_BYTES,
  MAX_SKILL_PATH_LENGTH,
  inspectSkillMarkdown,
  normalizeSkillPath,
  type SkillAdminEntry,
  type SkillFileEntry,
  type SkillImportInstallInput,
  type SkillImportKind,
  type SkillImportPreview,
  type SkillScope
} from '@shared/skills'
import { extractZipSafely } from '../components/zip-extract'
import { isWithin, skillLocations } from './skills'
import { isBinaryPath, listSkillAdmin, setSkillOverride } from './skills-admin'

const JUNK_NAMES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini'])
const JUNK_DIRS = new Set(['__MACOSX', '.git', '.svn', '.hg'])
const ROOT_DOCS = new Set([
  'README',
  'README.md',
  'LICENSE',
  'LICENSE.md',
  'LICENSE.txt',
  'NOTICE',
  'NOTICE.md',
  'CHANGELOG.md',
  'AUTHORS'
])
const INVALID_SEGMENT = /[<>:"|?*\u0000-\u001f]/
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i

interface ValidatedSkill {
  name: string
  description: string
  version?: string
  disableModelInvocation?: boolean
  files: SkillFileEntry[]
  totalBytes: number
}

interface PendingImport {
  token: string
  tempDir: string
  skillRoot: string
}

const pendingImports = new Map<string, PendingImport>()

function isJunk(name: string): boolean {
  return (
    name.startsWith('.') ||
    JUNK_NAMES.has(name) ||
    JUNK_DIRS.has(name)
  )
}

function assertSafeSegment(segment: string): void {
  if (
    !segment ||
    segment === '.' ||
    segment === '..' ||
    INVALID_SEGMENT.test(segment) ||
    segment.endsWith('.') ||
    segment.endsWith(' ') ||
    WINDOWS_RESERVED.test(segment)
  ) {
    throw new Error(`技能文件路径无效：${segment}`)
  }
}

function safeRelativePath(input: string): string {
  const normalized = input.replace(/\\/g, '/')
  if (!normalized || normalized.length > MAX_SKILL_PATH_LENGTH) {
    throw new Error('技能文件路径无效')
  }
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
    throw new Error('技能文件路径不能是绝对路径')
  }

  const segments = normalized.split('/').filter(Boolean)
  if (segments.length === 0) throw new Error('技能文件路径无效')
  for (const segment of segments) assertSafeSegment(segment)
  return segments.join('/')
}

async function copyFolderSafely(
  source: string,
  destination: string
): Promise<void> {
  let fileCount = 0
  let totalBytes = 0

  const walk = async (relativeDir: string): Promise<void> => {
    const entries = await fs.readdir(join(source, relativeDir), {
      withFileTypes: true
    })

    for (const entry of entries) {
      if (isJunk(entry.name)) continue
      const relativePath = safeRelativePath(
        relativeDir ? `${relativeDir}/${entry.name}` : entry.name
      )
      const from = join(source, relativeDir, entry.name)
      const info = await fs.lstat(from)
      if (info.isSymbolicLink()) {
        throw new Error(`技能目录不能包含符号链接：${relativePath}`)
      }

      if (info.isDirectory()) {
        await fs.mkdir(join(destination, relativePath), { recursive: true })
        await walk(relativePath)
        continue
      }

      if (!info.isFile()) {
        throw new Error(`不支持的文件类型：${relativePath}`)
      }
      if (info.size > MAX_SKILL_IMPORT_FILE_BYTES) {
        throw new Error(`文件超过 20MB：${relativePath}`)
      }

      fileCount += 1
      totalBytes += info.size
      if (fileCount > MAX_SKILL_IMPORT_FILES) {
        throw new Error(`技能文件不能超过 ${MAX_SKILL_IMPORT_FILES} 个`)
      }
      if (totalBytes > MAX_SKILL_IMPORT_TOTAL_BYTES) {
        throw new Error('技能总大小不能超过 50MB')
      }

      await fs.mkdir(dirname(join(destination, relativePath)), {
        recursive: true
      })
      await fs.copyFile(from, join(destination, relativePath))
    }
  }

  await walk('')
}

async function hasSkillFile(directory: string): Promise<boolean> {
  try {
    const info = await fs.lstat(join(directory, 'SKILL.md'))
    return info.isFile() && !info.isSymbolicLink()
  } catch {
    return false
  }
}

async function resolveSkillRoot(base: string): Promise<string> {
  if (await hasSkillFile(base)) return base

  const entries = await fs.readdir(base, { withFileTypes: true })
  const candidates: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || isJunk(entry.name)) continue
    const directory = join(base, entry.name)
    if (await hasSkillFile(directory)) candidates.push(directory)
  }

  if (candidates.length === 1) return candidates[0]
  if (candidates.length === 0) {
    throw new Error(
      '未找到 SKILL.md；请选择技能根目录，或包含单个技能的 ZIP 压缩包'
    )
  }
  throw new Error('一次只能导入一个技能；当前来源包含多个 SKILL.md')
}

async function validateSkillRoot(root: string): Promise<ValidatedSkill> {
  const skillFile = join(root, 'SKILL.md')
  const skillInfo = await fs.lstat(skillFile).catch(() => null)
  if (!skillInfo?.isFile() || skillInfo.isSymbolicLink()) {
    throw new Error('缺少 SKILL.md')
  }
  if (skillInfo.size <= 0 || skillInfo.size > MAX_SKILL_BODY_BYTES) {
    throw new Error('SKILL.md 为空或超过 256KB')
  }

  const inspected = inspectSkillMarkdown(
    await fs.readFile(skillFile, 'utf8')
  )
  if (!inspected.ok) throw new Error(inspected.error)
  if (
    inspected.frontmatter.version &&
    (inspected.frontmatter.version.length > 100 ||
      inspected.frontmatter.version.includes('\n'))
  ) {
    throw new Error('版本号无效')
  }

  const files: SkillFileEntry[] = [
    { path: 'SKILL.md', size: skillInfo.size, binary: false }
  ]
  let fileCount = 1
  let totalBytes = skillInfo.size

  const walk = async (relativeDir: string, depth: number): Promise<void> => {
    if (depth > 4) throw new Error('技能目录层级过深')
    const entries = await fs.readdir(join(root, relativeDir), {
      withFileTypes: true
    })

    for (const entry of entries) {
      if (isJunk(entry.name)) continue
      const relativePath = safeRelativePath(
        relativeDir ? `${relativeDir}/${entry.name}` : entry.name
      )
      if (relativePath === 'SKILL.md') continue

      const absolute = join(root, relativeDir, entry.name)
      const info = await fs.lstat(absolute)
      if (info.isSymbolicLink()) {
        throw new Error(`技能目录不能包含符号链接：${relativePath}`)
      }

      if (info.isDirectory()) {
        if (!relativeDir) {
          if (entry.name === 'scripts') {
            throw new Error(
              '当前版本不支持 scripts/；导入后不会执行脚本，请移除后重试'
            )
          }
          if (entry.name !== 'references' && entry.name !== 'assets') {
            throw new Error(
              `暂不支持目录 ${entry.name}/；当前只导入 references/ 和 assets/`
            )
          }
        }
        await walk(relativePath, depth + 1)
        continue
      }

      if (!info.isFile()) {
        throw new Error(`不支持的文件类型：${relativePath}`)
      }
      if (!relativeDir) {
        if (ROOT_DOCS.has(entry.name)) continue
        throw new Error(
          `暂不支持根目录文件 ${entry.name}；请只保留 SKILL.md、references/ 和 assets/`
        )
      }
      if (!normalizeSkillPath(relativePath)) {
        throw new Error(`技能文件路径不受支持：${relativePath}`)
      }
      if (info.size > MAX_SKILL_IMPORT_FILE_BYTES) {
        throw new Error(`文件超过 20MB：${relativePath}`)
      }

      fileCount += 1
      totalBytes += info.size
      if (fileCount > MAX_SKILL_IMPORT_FILES) {
        throw new Error(`技能文件不能超过 ${MAX_SKILL_IMPORT_FILES} 个`)
      }
      if (totalBytes > MAX_SKILL_IMPORT_TOTAL_BYTES) {
        throw new Error('技能总大小不能超过 50MB')
      }

      files.push({
        path: relativePath,
        size: info.size,
        binary: isBinaryPath(relativePath)
      })
    }
  }

  await walk('', 0)
  files.sort((left, right) => {
    if (left.path === 'SKILL.md') return -1
    if (right.path === 'SKILL.md') return 1
    return left.path.localeCompare(right.path)
  })

  return {
    name: inspected.frontmatter.name,
    description: inspected.frontmatter.description,
    ...(inspected.frontmatter.version
      ? { version: inspected.frontmatter.version }
      : {}),
    ...(inspected.frontmatter.disableModelInvocation !== undefined
      ? {
          disableModelInvocation:
            inspected.frontmatter.disableModelInvocation
        }
      : {}),
    files,
    totalBytes
  }
}

async function removeTempDirectory(tempDir: string): Promise<void> {
  await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
}

function sourceLabelFor(kind: SkillImportKind, sourcePath: string): string {
  return kind === 'zip'
    ? basename(sourcePath, extname(sourcePath))
    : basename(sourcePath)
}

export async function previewSkillImport(input: {
  kind: SkillImportKind
  sourcePath: string
  projectRoot: string
}): Promise<SkillImportPreview> {
  const sourceInfo = await fs.lstat(input.sourcePath).catch(() => null)
  if (!sourceInfo) throw new Error('来源路径不存在')
  if (input.kind === 'folder' && !sourceInfo.isDirectory()) {
    throw new Error('请选择技能文件夹')
  }
  if (input.kind === 'zip') {
    if (
      !sourceInfo.isFile() ||
      extname(input.sourcePath).toLowerCase() !== '.zip'
    ) {
      throw new Error('请选择 ZIP 压缩包')
    }
  }

  const tempBase = join(app.getPath('temp'), 'cinelab-skill-import')
  await fs.mkdir(tempBase, { recursive: true })
  const tempDir = join(tempBase, randomUUID())
  await fs.mkdir(tempDir, { recursive: true })

  try {
    if (input.kind === 'zip') {
      await extractZipSafely(input.sourcePath, tempDir, {
        maxFiles: MAX_SKILL_IMPORT_FILES + 32,
        maxTotalBytes: MAX_SKILL_IMPORT_TOTAL_BYTES + 1024 * 1024
      })
    } else {
      await copyFolderSafely(input.sourcePath, tempDir)
    }

    const skillRoot = await resolveSkillRoot(tempDir)
    const validated = await validateSkillRoot(skillRoot)
    const admin = await listSkillAdmin(input.projectRoot)
    const existingScopes = [
      ...new Set(
        admin
          .filter((entry) => entry.name === validated.name)
          .map((entry) => entry.scope)
      )
    ]

    const token = randomUUID()
    pendingImports.set(token, {
      token,
      tempDir,
      skillRoot
    })

    return {
      token,
      kind: input.kind,
      sourceLabel: sourceLabelFor(input.kind, input.sourcePath),
      ...validated,
      existingScopes
    }
  } catch (error) {
    await removeTempDirectory(tempDir)
    throw error
  }
}

export async function installSkillImport(input: {
  projectRoot: string
  data: SkillImportInstallInput
}): Promise<SkillAdminEntry> {
  const pending = pendingImports.get(input.data.token)
  if (!pending) throw new Error('导入会话已失效，请重新选择技能来源')
  if (input.data.scope === 'project' && !input.projectRoot) {
    throw new Error('项目技能需要先打开项目')
  }

  const location = skillLocations(input.projectRoot).find(
    (item) => item.scope === input.data.scope
  )
  if (!location) throw new Error('目标作用域无效')

  const validated = await validateSkillRoot(pending.skillRoot)
  await fs.mkdir(location.directory, { recursive: true })
  const target = join(location.directory, validated.name)
  if (!isWithin(location.directory, target)) {
    throw new Error('技能安装路径越界')
  }

  let backup: string | null = null
  const targetExists = await fs
    .access(target)
    .then(() => true)
    .catch(() => false)
  if (targetExists) {
    if (!input.data.overwrite) {
      throw new Error('目标作用域已存在同名技能，请确认覆盖')
    }
    backup = join(
      location.directory,
      `.${validated.name}.bak-${randomUUID()}`
    )
    await fs.rename(target, backup)
  }

  const staging = join(
    location.directory,
    `.import-${validated.name}-${randomUUID()}`
  )
  try {
    await fs.mkdir(staging, { recursive: true })
    for (const file of validated.files) {
      const from = join(pending.skillRoot, file.path)
      const to = join(staging, file.path)
      await fs.mkdir(dirname(to), { recursive: true })
      await fs.copyFile(from, to)
    }
    await fs.rename(staging, target)
  } catch (error) {
    await fs
      .rm(staging, { recursive: true, force: true })
      .catch(() => undefined)
    if (backup) {
      await fs.rename(backup, target).catch(() => undefined)
    }
    throw error
  }

  if (backup) {
    await fs
      .rm(backup, { recursive: true, force: true })
      .catch(() => undefined)
  }

  pendingImports.delete(pending.token)
  await removeTempDirectory(pending.tempDir)

  return setSkillOverride(input.projectRoot, {
    scope: input.data.scope as SkillScope,
    name: validated.name,
    enabled: true
  })
}

export async function discardSkillImport(token: string): Promise<void> {
  const pending = pendingImports.get(token)
  if (!pending) return
  pendingImports.delete(token)
  await removeTempDirectory(pending.tempDir)
}

export async function cleanupAllSkillImports(): Promise<void> {
  const pending = [...pendingImports.values()]
  pendingImports.clear()
  await Promise.all(
    pending.map((entry) => removeTempDirectory(entry.tempDir))
  )
}

export async function cleanupStaleSkillImports(
  maxAgeMs = 24 * 60 * 60 * 1000
): Promise<void> {
  const base = join(app.getPath('temp'), 'cinelab-skill-import')
  let entries
  try {
    entries = await fs.readdir(base, { withFileTypes: true })
  } catch {
    return
  }

  const now = Date.now()
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const directory = join(base, entry.name)
    const info = await fs.stat(directory).catch(() => null)
    if (info && now - info.mtimeMs > maxAgeMs) {
      await removeTempDirectory(directory)
    }
  }
}
