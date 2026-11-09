import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const paths = vi.hoisted(() => ({
  app: '',
  user: ''
}))

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => paths.app,
    getPath: () => paths.user
  }
}))

import {
  createSkill,
  deleteSkill,
  listSkillAdmin,
  listSkillFiles,
  readSkillFile,
  saveSkill,
  setSkillOverride
} from '../skills-admin'
import { listSkills } from '../skills'

function manifest(
  name: string,
  description = `${name} 描述`
): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\n正文\n`
}

describe('skill admin', () => {
  let root: string

  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'cinelab-skills-'))
    paths.app = join(root, 'app')
    paths.user = join(root, 'user')
    await fs.mkdir(join(paths.app, 'resources', 'skills', 'builtin-skill'), {
      recursive: true
    })
    await fs.mkdir(join(paths.user, 'skills', 'global-skill'), {
      recursive: true
    })
    await fs.mkdir(join(root, 'project', '.cinelab', 'skills', 'project-skill'), {
      recursive: true
    })
    await fs.writeFile(
      join(paths.app, 'resources', 'skills', 'builtin-skill', 'SKILL.md'),
      manifest('builtin-skill'),
      'utf8'
    )
    await fs.writeFile(
      join(paths.user, 'skills', 'global-skill', 'SKILL.md'),
      manifest('global-skill'),
      'utf8'
    )
    await fs.writeFile(
      join(
        root,
        'project',
        '.cinelab',
        'skills',
        'project-skill',
        'SKILL.md'
      ),
      manifest('project-skill'),
      'utf8'
    )
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it('lists all three scopes with effective state', async () => {
    const entries = await listSkillAdmin(join(root, 'project'))
    expect(entries.map((entry) => entry.scope)).toEqual([
      'builtin',
      'global',
      'project'
    ])
    expect(entries[0]?.editable).toBe(false)
    expect(entries[1]?.editable).toBe(true)

    const overridden = await setSkillOverride(join(root, 'project'), {
      scope: 'global',
      name: 'global-skill',
      enabled: false,
      disableModelInvocation: true
    })
    expect(overridden.enabled).toBe(false)
    expect(overridden.disableModelInvocation).toBe(true)

    const visible = await listSkills(join(root, 'project'))
    expect(visible.some((skill) => skill.name === 'global-skill')).toBe(false)
  })

  it('marks lower scopes shadowed by the same name', async () => {
    await fs.mkdir(
      join(root, 'project', '.cinelab', 'skills', 'builtin-skill'),
      { recursive: true }
    )
    await fs.writeFile(
      join(
        root,
        'project',
        '.cinelab',
        'skills',
        'builtin-skill',
        'SKILL.md'
      ),
      manifest('builtin-skill'),
      'utf8'
    )

    const entries = await listSkillAdmin(join(root, 'project'))
    const builtin = entries.find(
      (entry) =>
        entry.scope === 'builtin' && entry.name === 'builtin-skill'
    )
    expect(builtin?.shadowedBy).toBe('project')
  })

  it('creates, reads, saves and deletes a project skill', async () => {
    const created = await createSkill(join(root, 'project'), {
      scope: 'project',
      name: 'new-skill',
      description: '新技能',
      body: '# 新技能\n\n内容'
    })
    expect(created.scope).toBe('project')

    const file = await readSkillFile(join(root, 'project'), {
      scope: 'project',
      name: 'new-skill',
      path: 'SKILL.md'
    })
    expect(file.content).toContain('# 新技能')

    const saved = await saveSkill(join(root, 'project'), {
      scope: 'project',
      name: 'new-skill',
      description: '更新后的描述',
      body: '# 更新\n\n新内容'
    })
    expect(saved.description).toBe('更新后的描述')

    await fs.writeFile(
      join(
        root,
        'project',
        '.cinelab',
        'skills',
        'new-skill',
        'references',
        'notes.md'
      ),
      '# notes',
      'utf8'
    )
    const files = await listSkillFiles(join(root, 'project'), {
      scope: 'project',
      name: 'new-skill'
    })
    expect(files.map((entry) => entry.path)).toContain('references/notes.md')

    await deleteSkill(join(root, 'project'), 'project', 'new-skill')
    await expect(
      readSkillFile(join(root, 'project'), {
        scope: 'project',
        name: 'new-skill'
      })
    ).rejects.toThrow('技能文件不存在')
  })
})
