import { describe, expect, it } from 'vitest'
import {
  generatePrevisWorld,
  normalizePrevisWorldRef
} from '../previs/world-gen'

function ref(seed: number, style: 'edo' | 'modern_city' = 'edo') {
  return normalizePrevisWorldRef({
    generatorVersion: 'styled-v1',
    style,
    layout: 'street',
    density: 'medium',
    timeOfDay: 'night',
    weather: 'rain',
    seed,
    extentM: [120, 120]
  })
}

describe('generatePrevisWorld', () => {
  it('is deterministic for the same seed', () => {
    const a = generatePrevisWorld(ref(42))
    const b = generatePrevisWorld(ref(42))
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(a.buildings.length).toBeGreaterThan(0)
  })

  it('changes with the seed', () => {
    const a = generatePrevisWorld(ref(42))
    const b = generatePrevisWorld(ref(43))
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b))
  })

  it('supports every layout', () => {
    for (const layout of ['street', 'crossroad', 't_junction', 'plaza'] as const) {
      const world = generatePrevisWorld(
        normalizePrevisWorldRef({
          generatorVersion: 'styled-v1',
          style: 'modern_city',
          layout,
          density: 'low',
          seed: 7,
          extentM: [80, 80]
        })
      )
      expect(world.roads.length).toBeGreaterThan(0)
      expect(world.buildings.length).toBeGreaterThan(0)
    }
  })

  it('clamps the extent to the supported range', () => {
    const world = generatePrevisWorld(
      normalizePrevisWorldRef({
        generatorVersion: 'styled-v1',
        style: 'modern_city',
        layout: 'street',
        density: 'high',
        seed: 1,
        extentM: [500, 500]
      })
    )
    expect(world.extentM[0]).toBeLessThanOrEqual(200)
    expect(world.extentM[1]).toBeLessThanOrEqual(200)
  })
})
