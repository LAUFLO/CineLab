import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'

export interface SkillOverride {
  enabled?: boolean
  disableModelInvocation?: boolean
}

export type SkillOverrides = Record<string, SkillOverride>

interface SkillsConfigFile {
  version: 1
  skills: SkillOverrides
}

export function skillOverrideKey(
  scope: string,
  name: string
): string {
  return `${scope}:${name}`
}

function globalConfigFile(): string {
  return join(app.getPath('userData'), 'skills-config.json')
}

function projectConfigFile(root: string): string {
  return join(root, '.cinelab', 'skills-config.json')
}

async function readConfigFile(file: string): Promise<SkillOverrides> {
  try {
    const raw = await fs.readFile(file, 'utf8')
    const parsed = JSON.parse(raw) as Partial<SkillsConfigFile>
    if (!parsed || typeof parsed !== 'object' || !parsed.skills) return {}
    const result: SkillOverrides = {}
    for (const [key, value] of Object.entries(parsed.skills)) {
      if (!value || typeof value !== 'object') continue
      const entry: SkillOverride = {}
      if (typeof value.enabled === 'boolean') entry.enabled = value.enabled
      if (typeof value.disableModelInvocation === 'boolean') {
        entry.disableModelInvocation = value.disableModelInvocation
      }
      if (Object.keys(entry).length > 0) result[key] = entry
    }
    return result
  } catch {
    return {}
  }
}

async function writeConfigFile(
  file: string,
  overrides: SkillOverrides
): Promise<void> {
  await fs.mkdir(dirname(file), { recursive: true })
  const data: SkillsConfigFile = { version: 1, skills: overrides }
  const tmp = `${file}.${process.pid}.tmp`
  await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  await fs.rename(tmp, file)
}

/** 合并全局与项目覆盖；项目配置优先 */
export async function loadSkillOverrides(root: string): Promise<SkillOverrides> {
  const [globalConfig, projectConfig] = await Promise.all([
    readConfigFile(globalConfigFile()),
    root ? readConfigFile(projectConfigFile(root)) : Promise.resolve({})
  ])
  return { ...globalConfig, ...projectConfig }
}

export async function saveSkillOverride(
  root: string,
  scope: string,
  name: string,
  patch: SkillOverride
): Promise<void> {
  if (scope === 'project' && !root) {
    throw new Error('项目技能需要先打开项目')
  }
  const file =
    scope === 'project' ? projectConfigFile(root) : globalConfigFile()
  const current = await readConfigFile(file)
  const key = skillOverrideKey(scope, name)
  const next: SkillOverride = { ...(current[key] ?? {}), ...patch }

  for (const field of ['enabled', 'disableModelInvocation'] as const) {
    if (next[field] === undefined) delete next[field]
  }

  if (Object.keys(next).length === 0) {
    delete current[key]
  } else {
    current[key] = next
  }
  await writeConfigFile(file, current)
}

export async function removeSkillOverride(
  root: string,
  scope: string,
  name: string
): Promise<void> {
  await saveSkillOverride(root, scope, name, {
    enabled: undefined,
    disableModelInvocation: undefined
  })
}
