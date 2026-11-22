import { describe, expect, it } from 'vitest'
import type { ParamDef } from '@shared/provider-schema'
import {
  matchTitleSpans,
  paramGroupName,
  paramLabel
} from '../promptbar-model'

function param(overrides: Partial<ParamDef>): ParamDef {
  return {
    key: 'value',
    label: '值',
    type: 'text',
    ...overrides
  }
}

describe('matchTitleSpans', () => {
  const short = '视频节点 5 · 当前帧'
  const long = '视频节点 5 · 当前帧 · 提示词'

  it('prefers the longest title and ignores titles nested inside it', () => {
    const text = `根据反推出来的提示词生成图片 @${long}`
    const spans = matchTitleSpans(text, [short, long])
    expect(spans.map((span) => span.name)).toEqual([long])
  })

  it('keeps a nested title when it also appears standalone', () => {
    const text = `@${long} 再参考 ${short}`
    const spans = matchTitleSpans(text, [short, long])
    expect(spans.map((span) => span.name)).toEqual([long, short])
  })

  it('treats @ text mentions as occupied spans', () => {
    const text = `@${long}`
    const explicit = matchTitleSpans(text, [long], { prefix: '@' })
    const auto = matchTitleSpans(text, [short], {
      occupied: explicit
    })
    expect(explicit.map((span) => span.name)).toEqual([long])
    expect(auto).toEqual([])
  })

  it('matches normal titles and ignores empty or unknown names', () => {
    expect(matchTitleSpans('参考 图片节点 4', ['图片节点 4'])).toMatchObject([
      { name: '图片节点 4', start: 3, end: 9 }
    ])
    expect(matchTitleSpans('普通提示词', [])).toEqual([])
    expect(matchTitleSpans('普通提示词', [''])).toEqual([])
    expect(matchTitleSpans('普通提示词', ['参考图'])).toEqual([])
  })
})

describe('paramGroupName', () => {
  it('always gives ratio its own title', () => {
    expect(paramGroupName(param({ key: 'ratio', group: '尺寸' }))).toBe('比例')
    expect(paramGroupName(param({ key: 'aspect_ratio' }))).toBe('比例')
  })

  it('falls back to the parameter label instead of 其它', () => {
    expect(paramGroupName(param({ key: 'duration', label: '时长' }))).toBe('时长')
    expect(paramGroupName(param({ key: 'n', label: '数量' }))).toBe('数量')
  })

  it('keeps explicit groups', () => {
    expect(paramGroupName(param({ key: 'quality', group: '画质' }))).toBe('画质')
  })
})

describe('paramLabel', () => {
  it('adds seconds to duration and seconds params', () => {
    expect(paramLabel(param({ key: 'duration', type: 'number' }), 5)).toBe('5s')
    expect(paramLabel(param({ key: 'seconds', type: 'number' }), '8')).toBe('8s')
  })

  it('keeps select labels and adds P to unitless resolution values', () => {
    const resolution = param({
      key: 'resolution',
      type: 'select',
      options: [
        { value: '720p', label: '720P' },
        { value: '1080p', label: '1080P' }
      ]
    })
    expect(paramLabel(resolution, '1080p')).toBe('1080P')
    expect(paramLabel(resolution, '1080')).toBe('1080P')

    const bareResolution = param({
      key: 'resolution',
      type: 'select',
      options: [{ value: '1080', label: '1080' }]
    })
    expect(paramLabel(bareResolution, '1080')).toBe('1080P')
  })

  it('keeps aspect ratio labels unchanged', () => {
    const ratio = param({
      key: 'ratio',
      type: 'select',
      options: [{ value: '16:9', label: '16:9' }]
    })
    expect(paramLabel(ratio, '16:9')).toBe('16:9')
  })

  it('keeps text and boolean formatting', () => {
    expect(paramLabel(param({ type: 'boolean' }), true)).toBe('开')
    expect(paramLabel(param({ type: 'text' }), '自定义')).toBe('自定义')
  })
})
