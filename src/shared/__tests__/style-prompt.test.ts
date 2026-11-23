import { describe, expect, it } from 'vitest'
import { buildStyledPrompt } from '../style-prompt'
import type { StyleCard } from '../style-schema'

const style: StyleCard = {
  id: 'cyberpunk',
  name: '赛博朋克',
  category: '科幻与未来',
  cover: 'covers/cyberpunk.webp',
  prompt: '霓虹雨夜，湿地面强反射，青蓝与品红主色。',
  version: 1,
  source: 'official'
}

describe('buildStyledPrompt', () => {
  it('returns the theme unchanged without a style', () => {
    expect(buildStyledPrompt('雨夜街头', null)).toBe('雨夜街头')
  })

  it('puts the style fragment before the theme', () => {
    expect(buildStyledPrompt('雨夜街头', style)).toBe(
      '霓虹雨夜，湿地面强反射，青蓝与品红主色。\n\n雨夜街头'
    )
  })

  it('returns only the fragment when the theme is empty', () => {
    expect(buildStyledPrompt('   ', style)).toBe(
      '霓虹雨夜，湿地面强反射，青蓝与品红主色。'
    )
  })

  it('does not duplicate a fragment already present in the theme', () => {
    const theme = '霓虹雨夜，湿地面强反射，青蓝与品红主色。 雨夜街头'
    expect(buildStyledPrompt(theme, style)).toBe(theme)
  })

  it('falls back to the theme when the style has no prompt', () => {
    expect(buildStyledPrompt('雨夜街头', { ...style, prompt: '  ' })).toBe(
      '雨夜街头'
    )
  })
})
