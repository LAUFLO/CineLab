import { describe, expect, it } from 'vitest'
import type { PromptTemplate } from '../library-schema'
import type { StyleCard } from '../style-schema'
import { expandPresetTokens, findPresetTokens } from '../prompt-preset'
import { buildStyledPrompt } from '../style-prompt'

function template(name: string, prompt: string): PromptTemplate {
  return {
    id: `提示词/${name}.prompt.json`,
    name,
    kind: 'image',
    prompt,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
}

const SNOW = template('雪夜', '雪夜电影感，冷蓝月光，湿地面反射。')
const SNOW_CINEMA = template('雪夜电影感', '雪夜电影感，35mm 胶片，低饱和冷调。')
const PORTRAIT = template('人像特写', '浅景深人像，柔和轮廓光。')

describe('findPresetTokens', () => {
  it('matches the longest preset name first', () => {
    const tokens = findPresetTokens('#雪夜电影感', [SNOW, SNOW_CINEMA])
    expect(tokens).toHaveLength(1)
    expect(tokens[0].name).toBe('雪夜电影感')
  })

  it('finds multiple tokens and keeps their positions', () => {
    const text = '开头 #雪夜 中间 #人像特写 结尾'
    const tokens = findPresetTokens(text, [SNOW, PORTRAIT])

    expect(tokens.map((token) => token.name)).toEqual(['雪夜', '人像特写'])
    expect(text.slice(tokens[0].start, tokens[0].end)).toBe('#雪夜')
    expect(text.slice(tokens[1].start, tokens[1].end)).toBe('#人像特写')
  })

  it('supports names containing spaces', () => {
    const spaced = template('雨夜 街头', '雨夜街头，霓虹反射。')
    const tokens = findPresetTokens('前景 #雨夜 街头 背景', [spaced])
    expect(tokens).toHaveLength(1)
    expect(tokens[0].name).toBe('雨夜 街头')
  })

  it('ignores unknown hashtags', () => {
    expect(findPresetTokens('#不存在 #雪夜', [SNOW])).toHaveLength(1)
  })
})

describe('expandPresetTokens', () => {
  it('expands tokens in place', () => {
    const text = '开头 #雪夜 中间 #人像特写 结尾'
    const expanded = expandPresetTokens(text, [SNOW, PORTRAIT])

    expect(expanded).toBe(
      `开头 ${SNOW.prompt} 中间 ${PORTRAIT.prompt} 结尾`
    )
  })

  it('keeps unknown tokens untouched', () => {
    expect(expandPresetTokens('#不存在', [SNOW])).toBe('#不存在')
  })

  it('returns the original text when there are no presets', () => {
    expect(expandPresetTokens('#雪夜', [])).toBe('#雪夜')
  })

  it('keeps the style fragment before expanded presets', () => {
    const style: StyleCard = {
      id: '35mm-film',
      name: '胶片感',
      category: '电影感',
      cover: '',
      prompt: '胶片颗粒，暖琥珀色调。',
      version: 1,
      source: 'official'
    }
    const prompt = buildStyledPrompt(
      expandPresetTokens('开头 #雪夜 结尾', [SNOW]),
      style
    )

    expect(prompt.startsWith(style.prompt)).toBe(true)
    expect(prompt.indexOf(style.prompt)).toBeLessThan(
      prompt.indexOf(SNOW.prompt)
    )
    expect(prompt.indexOf(SNOW.prompt)).toBeLessThan(prompt.indexOf('结尾'))
  })
})
