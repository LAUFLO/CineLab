export type SkillScope = 'builtin' | 'global' | 'project'

export interface SkillFrontmatter {
  name: string
  description: string
  version?: string
  disableModelInvocation?: boolean
}

export interface SkillSummary extends SkillFrontmatter {
  scope: SkillScope
}

export interface SkillAdminEntry extends SkillSummary {
  /** 是否参与 Agent 技能列表 */
  enabled: boolean
  /** 内置技能只读 */
  editable: boolean
  /** 被更高优先级作用域的同名技能覆盖 */
  shadowedBy?: SkillScope
}

export interface SkillFileEntry {
  path: string
  size: number
  binary: boolean
}

export interface SkillFileContent extends SkillFileEntry {
  content?: string
}

export interface SkillWriteInput {
  scope: 'global' | 'project'
  name: string
  description: string
  version?: string
  body: string
}

export interface SkillOverrideInput {
  scope: SkillScope
  name: string
  enabled?: boolean
  disableModelInvocation?: boolean
}

export interface SkillReadResult {
  name: string
  scope: SkillScope
  path: string
  content: string
  truncated: boolean
  nextOffset?: number
}

export const SKILL_NAME_PATTERN = /^[a-z][a-zA-Z0-9-]{0,63}$/
export const MAX_SKILL_DESCRIPTION_LENGTH = 500
export const MAX_SKILL_BODY_BYTES = 256 * 1024
export const MAX_SKILL_REFERENCE_BYTES = 2 * 1024 * 1024
export const MAX_SKILL_PATH_LENGTH = 200

function stripQuotes(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

/**
 * 解析 SKILL.md 的 frontmatter。只支持简单 key: value，
 * 不引入 YAML 依赖；未知字段忽略。
 */
export function parseSkillMarkdown(
  source: string
): { frontmatter: SkillFrontmatter; body: string } | null {
  const text = source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  if (!text.startsWith('---\n')) return null

  const end = text.indexOf('\n---', 3)
  if (end < 0) return null

  const rawFrontmatter = text.slice(4, end)
  const body = text.slice(end + 4).replace(/^\n/, '').trim()
  const values: Record<string, string> = {}

  for (const line of rawFrontmatter.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf(':')
    if (separator <= 0) continue
    const key = trimmed.slice(0, separator).trim()
    const value = stripQuotes(trimmed.slice(separator + 1))
    if (key && value) values[key] = value
  }

  const name = values.name?.trim()
  const description = values.description?.trim()
  if (!name || !description) return null
  if (!SKILL_NAME_PATTERN.test(name)) return null
  if (description.length > MAX_SKILL_DESCRIPTION_LENGTH) return null

  const disableValue = values.disableModelInvocation?.toLowerCase()
  const disableModelInvocation =
    disableValue === 'true'
      ? true
      : disableValue === 'false'
        ? false
        : undefined

  return {
    frontmatter: {
      name,
      description,
      ...(values.version ? { version: values.version } : {}),
      ...(disableModelInvocation !== undefined
        ? { disableModelInvocation }
        : {})
    },
    body
  }
}

/**
 * 规范化技能内相对路径。拒绝绝对路径、盘符、.. 和反斜杠逃逸。
 * 只允许 SKILL.md、references/ 和 assets/ 下的文件。
 */
export function normalizeSkillPath(input?: string): string | null {
  const raw = (input?.trim() || 'SKILL.md').replace(/\\/g, '/')
  if (!raw || raw.length > MAX_SKILL_PATH_LENGTH) return null
  if (raw.startsWith('/') || /^[a-zA-Z]:/.test(raw)) return null

  const segments = raw.split('/').filter((segment) => segment.length > 0)
  if (segments.length === 0) return null
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    return null
  }
  if (segments.some((segment) => /[\u0000-\u001f]/.test(segment))) {
    return null
  }

  const path = segments.join('/')
  if (path === 'SKILL.md') return path
  if (path.startsWith('references/')) return path
  if (path.startsWith('assets/')) return path
  return null
}
