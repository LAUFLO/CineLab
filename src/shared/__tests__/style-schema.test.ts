import { describe, expect, it } from 'vitest'
import {
  styleFolderName,
  styleNameKey,
  validateStyleName,
  validateStylePrompt
} from '../style-schema'

describe('styleNameKey', () => {
  it('ignores width, case and whitespace', () => {
    expect(styleNameKey('  My Style ')).toBe('mystyle')
    expect(styleNameKey('ＭＹ　ＳＴＹＬＥ')).toBe('mystyle')
  })

  it('keeps Chinese names comparable', () => {
    expect(styleNameKey(' 赛博 朋克 ')).toBe('赛博朋克')
  })
})

describe('validateStyleName', () => {
  it('rejects empty names', () => {
    expect(validateStyleName('   ')).toBe('风格名称不能为空')
  })

  it('rejects illegal filesystem characters', () => {
    expect(validateStyleName('a/b')).toContain('不能包含')
  })

  it('rejects names over 30 characters', () => {
    expect(validateStyleName('风'.repeat(31))).toContain('30')
  })

  it('accepts normal Chinese and English names', () => {
    expect(validateStyleName('赛博朋克')).toBeNull()
    expect(validateStyleName('Cinematic')).toBeNull()
  })
})

describe('validateStylePrompt', () => {
  it('requires a prompt', () => {
    expect(validateStylePrompt(' ')).toBe('风格提示词不能为空')
  })

  it('limits prompt length', () => {
    expect(validateStylePrompt('风'.repeat(301))).toContain('300')
  })
})

describe('styleFolderName', () => {
  it('replaces illegal characters and trims dots', () => {
    expect(styleFolderName(' ..My/Style:01.. ')).toBe('My-Style-01')
  })
})
