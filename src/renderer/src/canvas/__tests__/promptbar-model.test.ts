import { describe, expect, it } from 'vitest'
import type { ParamDef } from '@shared/provider-schema'
import { paramLabel } from '../promptbar-model'

function param(overrides: Partial<ParamDef>): ParamDef {
  return {
    key: 'value',
    label: '值',
    type: 'text',
    ...overrides
  }
}

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
