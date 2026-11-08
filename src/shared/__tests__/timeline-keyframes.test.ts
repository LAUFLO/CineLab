import { describe, expect, it } from 'vitest'
import { createClip, type ClipKey } from '../timeline-schema'
import { evaluateClipKeys, volumeExpression } from '../timeline-keyframes'

function makeClip(keys: ClipKey[] = []) {
  const clip = createClip({
    trackId: 'v1',
    kind: 'video',
    startMs: 0,
    durationMs: 1000
  })
  clip.keys = keys
  return clip
}

describe('evaluateClipKeys', () => {
  it('falls back to static values without keys', () => {
    const clip = makeClip()
    clip.opacity = 0.8
    clip.volume = 0.6
    clip.transform = {
      scale: 1.2,
      offsetX: 0.1,
      offsetY: -0.2,
      rotation: 15,
      stretchX: 1,
      stretchY: 1
    }

    const value = evaluateClipKeys(clip, 500)
    expect(value.opacity).toBeCloseTo(0.8)
    expect(value.volume).toBeCloseTo(0.6)
    expect(value.scale).toBeCloseTo(1.2)
    expect(value.rotation).toBeCloseTo(15)
    expect(value.position).toEqual({ x: 0.1, y: -0.2 })
  })

  it('interpolates numbers linearly', () => {
    const clip = makeClip([
      { property: 'scale', at: 0, value: 1, ease: 'linear' },
      { property: 'scale', at: 1, value: 2, ease: 'linear' }
    ])

    expect(evaluateClipKeys(clip, 0).scale).toBeCloseTo(1)
    expect(evaluateClipKeys(clip, 500).scale).toBeCloseTo(1.5)
    expect(evaluateClipKeys(clip, 1000).scale).toBeCloseTo(2)
  })

  it('applies easing', () => {
    const clip = makeClip([
      { property: 'opacity', at: 0, value: 0, ease: 'linear' },
      { property: 'opacity', at: 1, value: 1, ease: 'ease-in' }
    ])

    expect(evaluateClipKeys(clip, 500).opacity).toBeCloseTo(0.25)
  })

  it('interpolates position objects', () => {
    const clip = makeClip([
      { property: 'position', at: 0, value: { x: 0, y: 0 }, ease: 'linear' },
      { property: 'position', at: 1, value: { x: 0.2, y: -0.4 }, ease: 'linear' }
    ])

    const value = evaluateClipKeys(clip, 500).position
    expect(value.x).toBeCloseTo(0.1)
    expect(value.y).toBeCloseTo(-0.2)
  })

  it('clamps outside the first and last keys', () => {
    const clip = makeClip([
      { property: 'rotation', at: 0.25, value: 10, ease: 'linear' },
      { property: 'rotation', at: 0.75, value: 50, ease: 'linear' }
    ])

    expect(evaluateClipKeys(clip, 0).rotation).toBeCloseTo(10)
    expect(evaluateClipKeys(clip, 1000).rotation).toBeCloseTo(50)
  })

  it('supports volume keys', () => {
    const clip = makeClip([
      { property: 'volume', at: 0, value: 0, ease: 'linear' },
      { property: 'volume', at: 1, value: 1, ease: 'linear' }
    ])

    expect(evaluateClipKeys(clip, 250).volume).toBeCloseTo(0.25)
  })

  it('builds a ffmpeg volume expression', () => {
    const clip = makeClip([
      { property: 'volume', at: 0, value: 0, ease: 'linear' },
      { property: 'volume', at: 1, value: 1, ease: 'linear' }
    ])

    const expression = volumeExpression(clip)
    expect(expression).toContain('if(lt(t,')
    expect(expression).toContain('(0+(1-0)*(t-0)/1)')
    expect(volumeExpression(makeClip())).toBeNull()
  })

  it('supports cubic bezier easing', () => {
    const clip = makeClip([
      { property: 'opacity', at: 0, value: 0, ease: 'linear' },
      {
        property: 'opacity',
        at: 1,
        value: 1,
        ease: 'bezier',
        bezier: [0, 0, 1, 1]
      }
    ])

    expect(evaluateClipKeys(clip, 500).opacity).toBeCloseTo(0.5, 2)
  })

  it('uses the default bezier curve when control points are missing', () => {
    const clip = makeClip([
      { property: 'opacity', at: 0, value: 0, ease: 'linear' },
      { property: 'opacity', at: 1, value: 1, ease: 'bezier' }
    ])

    const value = evaluateClipKeys(clip, 500).opacity
    expect(value).toBeGreaterThan(0.3)
    expect(value).toBeLessThan(0.7)
  })
})
