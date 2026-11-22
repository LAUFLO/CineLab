import { describe, expect, it } from 'vitest'
import {
  inspectSkillMarkdown,
  normalizeSkillPath,
  parseSkillMarkdown
} from '../skills'

describe('skill frontmatter', () => {
  it('parses a valid SKILL.md', () => {
    const result = parseSkillMarkdown(`---
name: my-director
description: 我的短剧导演方法
version: 1.0.0
disableModelInvocation: true
---

# 正文

步骤一`)
    expect(result?.frontmatter.name).toBe('my-director')
    expect(result?.frontmatter.description).toBe('我的短剧导演方法')
    expect(result?.frontmatter.version).toBe('1.0.0')
    expect(result?.frontmatter.disableModelInvocation).toBe(true)
    expect(result?.body).toContain('步骤一')
  })

  it('rejects missing frontmatter and invalid names', () => {
    expect(parseSkillMarkdown('# no frontmatter')).toBeNull()
    expect(
      parseSkillMarkdown(`---
name: My Director
description: test
---`)
    ).toBeNull()
    expect(
      parseSkillMarkdown(`---
name: valid
---`)
    ).toBeNull()
  })

  it('strips quoted values', () => {
    const result = parseSkillMarkdown(`---
name: "quoted-skill"
description: '带引号的描述'
---`)
    expect(result?.frontmatter.name).toBe('quoted-skill')
    expect(result?.frontmatter.description).toBe('带引号的描述')
  })
})

describe('skill import validation', () => {
  it('accepts a complete standard skill document', () => {
    const result = inspectSkillMarkdown(`---
name: imported-skill
description: 可导入的技能
version: 1.2.0
---

# 正文

步骤`)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.frontmatter.name).toBe('imported-skill')
      expect(result.frontmatter.version).toBe('1.2.0')
      expect(result.body).toContain('步骤')
    }
  })

  it('reports specific frontmatter errors', () => {
    expect(inspectSkillMarkdown('# no frontmatter')).toMatchObject({
      ok: false
    })
    expect(
      inspectSkillMarkdown(`---
name: My Skill
description: test
---

正文`)
    ).toMatchObject({ ok: false })
    expect(
      inspectSkillMarkdown(`---
name: valid
---

正文`)
    ).toMatchObject({ ok: false })
    expect(
      inspectSkillMarkdown(`---
name: valid
description: test
---`)
    ).toMatchObject({ ok: false })
    expect(
      inspectSkillMarkdown(`---
name: valid
description: |
  多行描述
---

正文`)
    ).toMatchObject({ ok: false })
  })
})

describe('skill path normalization', () => {
  it('allows SKILL.md, references and assets', () => {
    expect(normalizeSkillPath()).toBe('SKILL.md')
    expect(normalizeSkillPath('references/shot.md')).toBe('references/shot.md')
    expect(normalizeSkillPath('assets/template.txt')).toBe('assets/template.txt')
  })

  it('rejects escapes and unsupported paths', () => {
    expect(normalizeSkillPath('../secret.md')).toBeNull()
    expect(normalizeSkillPath('/etc/passwd')).toBeNull()
    expect(normalizeSkillPath('C:/secret.md')).toBeNull()
    expect(normalizeSkillPath('scripts/run.sh')).toBeNull()
    expect(normalizeSkillPath('references/../secret.md')).toBeNull()
  })
})
