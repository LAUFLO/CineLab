import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import {
  MAX_SKILL_BODY_BYTES,
  MAX_SKILL_REFERENCE_BYTES,
  normalizeSkillPath,
  parseSkillMarkdown,
  type SkillReadResult,
  type SkillScope,
  type SkillSummary
} from '@shared/skills'
import {
  loadSkillOverrides,
  skillOverrideKey,
  type SkillOverrides
} from './skills-config'

export interface SkillLocation {
  scope: SkillScope
  directory: string
}

export function isWithin(base: string, target: string): boolean {
  const rel = relative(base, target)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

export function builtinSkillsDirectory(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'skills')
    : join(app.getAppPath(), 'resources', 'skills')
}

export function globalSkillsDirectory(): string {
  return join(app.getPath('userData'), 'skills')
}

export function projectSkillsDirectory(root: string): string {
  return join(root, '.cinelab', 'skills')
}

export function skillLocations(root: string): SkillLocation[] {
  return [
    { scope: 'builtin', directory: builtinSkillsDirectory() },
    { scope: 'global', directory: globalSkillsDirectory() },
    ...(root
      ? [{ scope: 'project' as const, directory: projectSkillsDirectory(root) }]
      : [])
  ]
}

export async function readSkillManifest(
  skillDirectory: string,
  scope: SkillScope
): Promise<SkillSummary | null> {
  try {
    const file = join(skillDirectory, 'SKILL.md')
    const info = await fs.lstat(file)
    if (!info.isFile() || info.size <= 0 || info.size > MAX_SKILL_BODY_BYTES) {
      return null
    }
    const parsed = parseSkillMarkdown(await fs.readFile(file, 'utf8'))
    if (!parsed) return null
    return {
      ...parsed.frontmatter,
      scope
    }
  } catch {
    return null
  }
}

async function scanScope(
  location: SkillLocation,
  found: Map<string, { summary: SkillSummary; directory: string }>,
  overrides: SkillOverrides
): Promise<void> {
  let entries
  try {
    entries = await fs.readdir(location.directory, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    const directory = join(location.directory, entry.name)
    const summary = await readSkillManifest(directory, location.scope)
    if (!summary) continue

    const override = overrides[skillOverrideKey(location.scope, summary.name)]
    if (override?.enabled === false) {
      // 同名高层技能即使禁用也应遮蔽低层技能，避免意外回退到内置版本
      if (location.scope !== 'builtin') found.delete(summary.name)
      continue
    }

    const effective: SkillSummary = {
      ...summary,
      ...(override?.disableModelInvocation !== undefined
        ? { disableModelInvocation: override.disableModelInvocation }
        : {})
    }
    // 后扫描的作用域覆盖前面的：project > global > builtin
    found.set(summary.name, { summary: effective, directory })
  }
}

export async function listSkills(root: string): Promise<SkillSummary[]> {
  const found = new Map<string, { summary: SkillSummary; directory: string }>()
  const overrides = await loadSkillOverrides(root)
  for (const location of skillLocations(root)) {
    await scanScope(location, found, overrides)
  }
  return [...found.values()]
    .map((item) => item.summary)
    .sort((left, right) => left.name.localeCompare(right.name))
}

async function findSkill(
  root: string,
  name: string
): Promise<{ summary: SkillSummary; directory: string } | null> {
  const skills = await listSkills(root)
  if (!skills.some((skill) => skill.name === name)) return null

  for (let index = skillLocations(root).length - 1; index >= 0; index -= 1) {
    const location = skillLocations(root)[index]
    const directory = join(location.directory, name)
    const summary = await readSkillManifest(directory, location.scope)
    if (summary?.name === name) return { summary, directory }
  }

  return null
}

export async function readSkill(input: {
  root: string
  name: string
  path?: string
  offset?: number
  limit?: number
}): Promise<SkillReadResult> {
  const skill = await findSkill(input.root, input.name)
  if (!skill) throw new Error(`找不到技能：${input.name}`)

  const relativePath = normalizeSkillPath(input.path)
  if (!relativePath) throw new Error('技能文件路径无效')

  const target = resolve(skill.directory, relativePath)
  if (!isWithin(skill.directory, target)) {
    throw new Error('技能文件路径超出技能目录')
  }

  let realDirectory: string
  let realTarget: string
  try {
    realDirectory = await fs.realpath(skill.directory)
    realTarget = await fs.realpath(target)
  } catch {
    throw new Error('技能文件不存在')
  }
  if (!isWithin(realDirectory, realTarget)) {
    throw new Error('技能文件路径超出技能目录')
  }

  const info = await fs.lstat(realTarget)
  if (!info.isFile()) throw new Error('技能路径不是文件')

  const maxBytes =
    relativePath === 'SKILL.md'
      ? MAX_SKILL_BODY_BYTES
      : MAX_SKILL_REFERENCE_BYTES
  if (info.size <= 0 || info.size > maxBytes) {
    throw new Error('技能文件为空或超过大小限制')
  }

  const raw = await fs.readFile(realTarget, 'utf8')
  let content = raw
  if (relativePath === 'SKILL.md') {
    const parsed = parseSkillMarkdown(raw)
    if (!parsed) throw new Error('SKILL.md 格式无效')
    content = parsed.body
  }

  const offset = Math.max(0, Math.min(input.offset ?? 0, content.length))
  const limit = Math.max(1, Math.min(input.limit ?? 8000, 20000))
  const slice = content.slice(offset, offset + limit)
  const nextOffset = offset + slice.length

  return {
    name: skill.summary.name,
    scope: skill.summary.scope,
    path: relativePath,
    content: slice,
    truncated: nextOffset < content.length,
    ...(nextOffset < content.length ? { nextOffset } : {})
  }
}

export async function skillCatalogPrompt(root: string): Promise<string> {
  const skills = await listSkills(root)
  if (skills.length === 0) return ''
  return [
    '可用技能（需要时用 skill_read 读取正文，不要凭名称猜测内容）：',
    ...skills.map(
      (skill) =>
        `- ${skill.name}（${skill.scope}）：${skill.description}${
          skill.disableModelInvocation ? '（只能用户显式选择）' : ''
        }`
    )
  ].join('\n')
}
