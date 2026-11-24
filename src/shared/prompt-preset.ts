import type { PromptTemplate } from './library-schema'

export interface PresetToken {
  start: number
  end: number
  name: string
  template: PromptTemplate
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function tokenPattern(templates: PromptTemplate[]): RegExp | null {
  const names = [
    ...new Set(
      templates.map((template) => template.name.trim()).filter(Boolean)
    )
  ].sort((a, b) => b.length - a.length)

  if (names.length === 0) return null
  return new RegExp(`#(?:${names.map(escapeRegExp).join('|')})`, 'g')
}

/** 查找文本中的预设提示词 token，按名称最长匹配。 */
export function findPresetTokens(
  text: string,
  templates: PromptTemplate[]
): PresetToken[] {
  const pattern = tokenPattern(templates)
  if (!pattern) return []

  const byName = new Map(
    templates.map((template) => [template.name.trim(), template])
  )
  const tokens: PresetToken[] = []

  for (const match of text.matchAll(pattern)) {
    const name = match[0].slice(1)
    const template = byName.get(name)
    if (!template || match.index === undefined) continue

    tokens.push({
      start: match.index,
      end: match.index + match[0].length,
      name,
      template
    })
  }

  return tokens
}

/** 把 token 在原位置展开成预设内容；未匹配的 token 保留原文。 */
export function expandPresetTokens(
  text: string,
  templates: PromptTemplate[]
): string {
  const tokens = findPresetTokens(text, templates)
  if (tokens.length === 0) return text

  let result = ''
  let last = 0

  for (const token of tokens) {
    result += text.slice(last, token.start)
    result += token.template.prompt.trim()
    last = token.end
  }

  result += text.slice(last)
  return result
}
