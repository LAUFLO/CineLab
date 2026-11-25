import { describe, expect, it } from 'vitest'
import { centerCropRect, parseAspectRatio } from '../media'

describe('parseAspectRatio', () => {
  it('parses colon, slash and pixel-style separators', () => {
    expect(parseAspectRatio('16:9')).toMatchObject({ width: 16, height: 9 })
    expect(parseAspectRatio('4/5')).toMatchObject({ width: 4, height: 5 })
    expect(parseAspectRatio('4x5')).toMatchObject({ width: 4, height: 5 })
    expect(parseAspectRatio('2.35:1')).toMatchObject({
      width: 2.35,
      height: 1
    })
  })

  it('rejects invalid or extreme ratios', () => {
    expect(parseAspectRatio('')).toBeNull()
    expect(parseAspectRatio('abc')).toBeNull()
    expect(parseAspectRatio('0:9')).toBeNull()
    expect(parseAspectRatio('16:0')).toBeNull()
    expect(parseAspectRatio('100:1')).toBeNull()
  })
})

describe('centerCropRect', () => {
  it('crops to 1:1 from a landscape video', () => {
    expect(centerCropRect(1920, 1080, 1)).toEqual({
      x: 420,
      y: 0,
      width: 1080,
      height: 1080
    })
  })

  it('keeps the full frame when the ratio matches', () => {
    expect(centerCropRect(1920, 1080, 16 / 9)).toEqual({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080
    })
  })

  it('crops wide ratios and rounds height down to even', () => {
    expect(centerCropRect(1920, 1080, 2.35)).toEqual({
      x: 0,
      y: 132,
      width: 1920,
      height: 816
    })
  })

  it('crops portrait ratios and rounds width down to even', () => {
    expect(centerCropRect(1920, 1080, 9 / 16)).toEqual({
      x: 656,
      y: 0,
      width: 608,
      height: 1080
    })
  })
})
