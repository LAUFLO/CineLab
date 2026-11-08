import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FILTER,
  FILTER_PRESETS,
  canvasFilterString,
  hasActiveFilter
} from '../filters'

describe('canvasFilterString', () => {
  it('returns an empty string for the default filter', () => {
    expect(canvasFilterString(DEFAULT_FILTER)).toBe('')
    expect(canvasFilterString(undefined)).toBe('')
  })

  it('serializes active adjustments', () => {
    const value = canvasFilterString({
      ...DEFAULT_FILTER,
      brightness: 1.2,
      contrast: 1.1,
      saturation: 0.8,
      blur: 2,
      grayscale: 0.5,
      sepia: 0.3,
      hueRotate: 12,
      invert: 0.1
    })

    expect(value).toContain('brightness(1.2)')
    expect(value).toContain('contrast(1.1)')
    expect(value).toContain('saturate(0.8)')
    expect(value).toContain('blur(2px)')
    expect(value).toContain('grayscale(0.5)')
    expect(value).toContain('sepia(0.3)')
    expect(value).toContain('hue-rotate(12deg)')
    expect(value).toContain('invert(0.1)')
  })

  it('detects active filters', () => {
    expect(hasActiveFilter(DEFAULT_FILTER)).toBe(false)
    expect(hasActiveFilter({ ...DEFAULT_FILTER, vignette: 0.5 })).toBe(false)
    expect(hasActiveFilter({ ...DEFAULT_FILTER, contrast: 1.2 })).toBe(true)
  })

  it('ships usable presets', () => {
    expect(FILTER_PRESETS.length).toBeGreaterThanOrEqual(6)
    expect(FILTER_PRESETS[0].value).toEqual(DEFAULT_FILTER)
    expect(FILTER_PRESETS.some((preset) => preset.id === 'mono')).toBe(true)
  })
})
