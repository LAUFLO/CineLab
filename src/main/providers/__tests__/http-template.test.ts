import { describe, expect, it } from 'vitest'
import { hasLegacyKeyframeVariables } from '@shared/http-template'
import { resolveTemplateRef, type ImageRef } from '../http-template'

const refs: ImageRef[] = [
  {
    dataUrl: 'data:image/png;base64,AAAA',
    base64: 'AAAA',
    mime: 'image/png',
    role: 'firstFrame'
  },
  {
    dataUrl: 'data:image/jpeg;base64,BBBB',
    base64: 'BBBB',
    mime: 'image/jpeg',
    role: 'lastFrame'
  }
]

describe('http-template refs', () => {
  it('returns base64 for keyframe tokens', () => {
    expect(resolveTemplateRef('refs.firstFrame', refs)).toBe('AAAA')
    expect(resolveTemplateRef('refs.lastFrame', refs)).toBe('BBBB')
  })

  it('returns data URL and MIME variants', () => {
    expect(resolveTemplateRef('refs.firstFrameDataUrl', refs)).toBe(
      'data:image/png;base64,AAAA'
    )
    expect(resolveTemplateRef('refs.firstFrameMime', refs)).toBe('image/png')
    expect(resolveTemplateRef('refs.lastFrameDataUrl', refs)).toBe(
      'data:image/jpeg;base64,BBBB'
    )
    expect(resolveTemplateRef('refs.lastFrameMime', refs)).toBe('image/jpeg')
  })

  it('keeps frames as data URLs for array compatibility', () => {
    expect(resolveTemplateRef('refs.frames', refs)).toEqual([
      'data:image/png;base64,AAAA',
      'data:image/jpeg;base64,BBBB'
    ])
  })

  it('falls back to dataUrl when base64 is absent', () => {
    expect(
      resolveTemplateRef('refs.firstFrame', [
        { dataUrl: 'data:image/png;base64,LEGACY', role: 'firstFrame' }
      ])
    ).toBe('LEGACY')
  })
})

describe('legacy keyframe variable warning', () => {
  it('detects old first and last frame tokens', () => {
    expect(hasLegacyKeyframeVariables('"image": "{{refs.firstFrame}}"')).toBe(
      true
    )
    expect(hasLegacyKeyframeVariables('"image": "{{refs.lastFrame}}"')).toBe(
      true
    )
  })

  it('does not flag the new DataUrl and Mime tokens', () => {
    expect(
      hasLegacyKeyframeVariables('{{refs.firstFrameDataUrl}}')
    ).toBe(false)
    expect(hasLegacyKeyframeVariables('{{refs.firstFrameMime}}')).toBe(false)
    expect(hasLegacyKeyframeVariables('{{refs.frames}}')).toBe(false)
  })
})
