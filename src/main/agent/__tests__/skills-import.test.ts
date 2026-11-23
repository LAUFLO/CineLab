import { createWriteStream, promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import yazl from 'yazl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const paths = vi.hoisted(() => ({
  app: '',
  user: '',
  temp: ''
}))

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => paths.app,
    getPath: (name: string) =>
      name === 'temp' ? paths.temp : paths.user
  }
}))

import {
  cleanupAllSkillImports,
  discardSkillImport,
  installSkillImport,
  previewSkillImport
} from '../skills-import'
import { listSkills } from '../skills'
import { listSkillAdmin, setSkillOverride } from '../skills-admin'

function manifest(
  name: string,
  description = `${name} 描述`
): string {
  return `---\nname: ${name}\ndescription: ${description}\nversion: 1.0.0\n---\n\n# ${name}\n\n正文\n`
}

async function write(
  file: string,
  content: string
): Promise<void> {
  await fs.mkdir(dirname(file), { recursive: true })
  await fs.writeFile(file, content, 'utf8')
}

async function writeZip(
  zipPath: string,
  entries: Array<{ name: string; content?: string }>
): Promise<void> {
  const zip = new yazl.ZipFile()
  for (const entry of entries) {
    zip.addBuffer(Buffer.from(entry.content ?? ''), entry.name)
  }
  zip.end()
  await pipeline(zip.outputStream, createWriteStream(zipPath))
}

describe('skill import', () => {
  let root: string
  let project: string

  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'cinelab-skill-import-'))
    paths.app = join(root, 'app')
    paths.user = join(root, 'user')
    paths.temp = join(root, 'temp')
    project = join(root, 'project')
    await fs.mkdir(project, { recursive: true })
    await fs.mkdir(join(paths.app, 'resources', 'skills'), {
      recursive: true
    })
    await fs.mkdir(join(paths.user, 'skills'), { recursive: true })
  })

  afterEach(async () => {
    await cleanupAllSkillImports()
    await fs.rm(root, { recursive: true, force: true })
  })

  it('previews and imports a folder into global scope', async () => {
    const source = join(root, 'source')
    await write(
      join(source, 'demo-skill', 'SKILL.md'),
      manifest('demo-skill')
    )
    await write(
      join(source, 'demo-skill', 'references', 'guide.md'),
      'guide'
    )
    await write(
      join(source, 'demo-skill', 'assets', 'template.txt'),
      'asset'
    )
    await write(join(source, 'demo-skill', 'README.md'), 'ignored')

    const preview = await previewSkillImport({
      kind: 'folder',
      sourcePath: source,
      projectRoot: project
    })
    expect(preview.name).toBe('demo-skill')
    expect(preview.files.map((file) => file.path)).toEqual([
      'SKILL.md',
      'assets/template.txt',
      'references/guide.md'
    ])
    expect(preview.existingScopes).toEqual([])

    const entry = await installSkillImport({
      projectRoot: project,
      data: { token: preview.token, scope: 'global' }
    })
    expect(entry.enabled).toBe(true)
    expect(entry.scope).toBe('global')
    await expect(
      fs.readFile(
        join(paths.user, 'skills', 'demo-skill', 'SKILL.md'),
        'utf8'
      )
    ).resolves.toContain('name: demo-skill')
    expect(
      (await listSkills(project)).some((skill) => skill.name === 'demo-skill')
    ).toBe(true)
  })

  it('imports a ZIP with a single wrapper folder into project scope', async () => {
    const zipPath = join(root, 'demo.zip')
    await writeZip(zipPath, [
      {
        name: 'demo-skill/SKILL.md',
        content: manifest('zip-skill', 'ZIP 导入技能')
      },
      {
        name: 'demo-skill/references/guide.md',
        content: 'guide'
      },
      {
        name: '__MACOSX/demo-skill/._SKILL.md',
        content: 'junk'
      }
    ])

    const preview = await previewSkillImport({
      kind: 'zip',
      sourcePath: zipPath,
      projectRoot: project
    })
    expect(preview.name).toBe('zip-skill')
    expect(preview.sourceLabel).toBe('demo')

    const entry = await installSkillImport({
      projectRoot: project,
      data: { token: preview.token, scope: 'project' }
    })
    expect(entry.scope).toBe('project')
    await expect(
      fs.readFile(
        join(project, '.cinelab', 'skills', 'zip-skill', 'SKILL.md'),
        'utf8'
      )
    ).resolves.toContain('name: zip-skill')
  })

  it('rejects missing, invalid and empty SKILL.md', async () => {
    const source = join(root, 'invalid')
    await fs.mkdir(source, { recursive: true })
    await expect(
      previewSkillImport({
        kind: 'folder',
        sourcePath: source,
        projectRoot: project
      })
    ).rejects.toThrow(/SKILL\.md/)

    await write(join(source, 'SKILL.md'), '# no frontmatter')
    await expect(
      previewSkillImport({
        kind: 'folder',
        sourcePath: source,
        projectRoot: project
      })
    ).rejects.toThrow(/frontmatter/)

    await write(
      join(source, 'SKILL.md'),
      `---\nname: valid-skill\ndescription: test\n---\n`
    )
    await expect(
      previewSkillImport({
        kind: 'folder',
        sourcePath: source,
        projectRoot: project
      })
    ).rejects.toThrow(/正文不能为空/)
  })

  it('rejects unsupported scripts and unknown root files', async () => {
    const source = join(root, 'scripts-skill')
    await write(join(source, 'SKILL.md'), manifest('scripts-skill'))
    await write(join(source, 'scripts', 'run.sh'), 'echo hi')
    await expect(
      previewSkillImport({
        kind: 'folder',
        sourcePath: source,
        projectRoot: project
      })
    ).rejects.toThrow(/scripts/)

    await fs.rm(join(source, 'scripts'), { recursive: true, force: true })
    await write(join(source, 'notes.txt'), 'notes')
    await expect(
      previewSkillImport({
        kind: 'folder',
        sourcePath: source,
        projectRoot: project
      })
    ).rejects.toThrow(/根目录文件/)
  })

  it('requires explicit overwrite for an existing same-scope skill', async () => {
    const first = join(root, 'first')
    await write(join(first, 'SKILL.md'), manifest('dupe', 'first version'))
    const firstPreview = await previewSkillImport({
      kind: 'folder',
      sourcePath: first,
      projectRoot: project
    })
    await installSkillImport({
      projectRoot: project,
      data: { token: firstPreview.token, scope: 'global' }
    })

    const second = join(root, 'second')
    await write(join(second, 'SKILL.md'), manifest('dupe', 'second version'))
    const secondPreview = await previewSkillImport({
      kind: 'folder',
      sourcePath: second,
      projectRoot: project
    })
    expect(secondPreview.existingScopes).toContain('global')

    await expect(
      installSkillImport({
        projectRoot: project,
        data: { token: secondPreview.token, scope: 'global' }
      })
    ).rejects.toThrow(/同名技能/)

    await installSkillImport({
      projectRoot: project,
      data: {
        token: secondPreview.token,
        scope: 'global',
        overwrite: true
      }
    })
    await expect(
      fs.readFile(
        join(paths.user, 'skills', 'dupe', 'SKILL.md'),
        'utf8'
      )
    ).resolves.toContain('second version')
  })

  it('keeps imported skills enabled and excludes disabled ones from CineBot', async () => {
    const source = join(root, 'toggle')
    await write(join(source, 'SKILL.md'), manifest('toggle-skill'))
    const preview = await previewSkillImport({
      kind: 'folder',
      sourcePath: source,
      projectRoot: project
    })
    await installSkillImport({
      projectRoot: project,
      data: { token: preview.token, scope: 'global' }
    })

    const entries = await listSkillAdmin(project)
    expect(entries.find((entry) => entry.name === 'toggle-skill')?.enabled).toBe(
      true
    )

    await setSkillOverride(project, {
      scope: 'global',
      name: 'toggle-skill',
      enabled: false
    })
    expect(
      (await listSkills(project)).some(
        (skill) => skill.name === 'toggle-skill'
      )
    ).toBe(false)
  })

  it('discards a pending import and rejects its token', async () => {
    const source = join(root, 'discard')
    await write(join(source, 'SKILL.md'), manifest('discard-skill'))
    const preview = await previewSkillImport({
      kind: 'folder',
      sourcePath: source,
      projectRoot: project
    })
    await discardSkillImport(preview.token)
    await expect(
      installSkillImport({
        projectRoot: project,
        data: { token: preview.token, scope: 'global' }
      })
    ).rejects.toThrow(/失效/)
  })
})
