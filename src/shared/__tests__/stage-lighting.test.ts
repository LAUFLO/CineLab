import { describe, expect, it } from 'vitest'
import { resolveStageLighting } from '../stage-lighting'

describe('resolveStageLighting', () => {
  it('falls back to day for an unknown timeOfDay', () => {
    const lighting = resolveStageLighting({
      world: { timeOfDay: 'noon' } as never,
      lighting: undefined
    })
    expect(lighting.background).toBe('#f5f7fa')
    expect(lighting.ambient.intensity).toBeGreaterThan(0)
  })

  it('keeps known times', () => {
    const night = resolveStageLighting({
      world: { timeOfDay: 'night' } as never,
      lighting: undefined
    })
    expect(night.background).toBe('#151b2b')
  })

  it('survives missing or malformed docs', () => {
    expect(() => resolveStageLighting(undefined)).not.toThrow()
    expect(() =>
      resolveStageLighting({ world: null, lighting: null } as never)
    ).not.toThrow()
    expect(() =>
      resolveStageLighting({
        world: { timeOfDay: 123 } as never,
        lighting: 'bad' as never
      })
    ).not.toThrow()
  })
})
