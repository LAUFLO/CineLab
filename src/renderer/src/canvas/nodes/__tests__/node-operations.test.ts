import { describe, expect, it } from 'vitest'
import { operationsForKind } from '../node-operations'

describe('split-av operation menus', () => {
  it('offers three items on video nodes', () => {
    const op = operationsForKind('video').find((item) => item.id === 'split-av')
    expect(op?.label).toBe('分离音视频')
    expect(op?.section).toBe('video')
    expect(op?.menu?.map((item) => item.id)).toEqual([
      'av',
      'vocal',
      'background'
    ])
  })

  it('offers only stem extraction on audio nodes', () => {
    const op = operationsForKind('audio').find((item) => item.id === 'split-av')
    expect(op?.label).toBe('音频分离')
    expect(op?.section).toBe('audio')
    expect(op?.menu?.map((item) => item.id)).toEqual(['vocal', 'background'])
  })
})
