import { describe, expect, it } from 'vitest'
import { applyLightingPreset, resolveStageLighting } from '../stage-lighting'

describe('resolveStageLighting', () => {
  it('falls back to day lighting', () => {
    const lighting = resolveStageLighting(undefined)
    expect(lighting.background).toBe('#f5f7fa')
    expect(lighting.ambient.intensity).toBeGreaterThan(0)
  })

  it('applies manual lighting overrides', () => {
    const lighting = resolveStageLighting({
      lighting: {
        background: '#000000',
        ambient: { intensity: 2 }
      }
    })
    expect(lighting.background).toBe('#000000')
    expect(lighting.ambient.intensity).toBe(2)
  })

  it('survives missing or malformed docs', () => {
    expect(() => resolveStageLighting(undefined)).not.toThrow()
    expect(() =>
      resolveStageLighting({ lighting: null } as never)
    ).not.toThrow()
    expect(() =>
      resolveStageLighting({ lighting: 'bad' as never })
    ).not.toThrow()
  })
})

describe('applyLightingPreset', () => {
  it('uses time-of-day look as base then applies preset overrides', () => {
    const night = applyLightingPreset({ lighting: undefined }, 'night')
    expect(night.lighting?.background).toBe('#151b2b')
    expect(night.lighting?.sun?.position).toEqual([-4, 8, -3])

    const dusk = applyLightingPreset({ lighting: undefined }, 'dusk')
    expect(dusk.lighting?.background).toBe('#f3c9a4')

    const neon = applyLightingPreset({ lighting: undefined }, 'neon')
    expect(neon.lighting?.fill?.color).toBe('#ff4fa3')
  })

  it('keeps the current lighting for unknown presets', () => {
    const lighting = { background: '#123456' }
    expect(applyLightingPreset({ lighting }, 'missing')).toEqual({ lighting })
  })
})
