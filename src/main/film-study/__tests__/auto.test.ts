import { describe, expect, it } from 'vitest'
import {
  detectCuts,
  mergeToLimit,
  shotFrameTimes,
  splitByCuts,
  splitByInterval
} from '../auto'

describe('shotFrameTimes', () => {
  it('insets the first and last frame of a normal shot', () => {
    const times = shotFrameTimes({ start: 2, end: 4 })
    expect(times.first).toBeCloseTo(2.05)
    expect(times.mid).toBeCloseTo(3)
    expect(times.last).toBeCloseTo(3.92)
  })

  it('keeps the last frame inside a very short shot', () => {
    const times = shotFrameTimes({ start: 1, end: 1.1 })
    expect(times.first).toBeGreaterThanOrEqual(1)
    expect(times.last).toBeLessThanOrEqual(1.1)
    expect(times.last).toBeGreaterThanOrEqual(times.first)
  })

  it('handles a zero-length shot', () => {
    const times = shotFrameTimes({ start: 5, end: 5 })
    expect(times).toEqual({ first: 5, mid: 5, last: 5 })
  })
})

describe('auto film study shot splitting', () => {
  it('read scdet timestamps from ffmpeg stderr', () => {
    const stderr = [
      'frame=1 pts=0',
      'lavfi.scd.time: 1.2',
      'lavfi.scd.time: 3.5',
      'lavfi.scd.time: 3.5'
    ].join('\n')
    expect(detectCuts(stderr)).toEqual([1.2, 3.5, 3.5])
  })

  it('split shots by detected cuts and merge too-short gaps', () => {
    const shots = splitByCuts([0.2, 2, 4.9], 5)
    expect(shots).toHaveLength(2)
    expect(shots[0].start).toBe(0)
    expect(shots[1].end).toBe(5)
    expect(shots[1].start).toBeCloseTo(2)
  })

  it('fallback to a single shot when no cuts are detected', () => {
    expect(splitByCuts([], 4.5)).toEqual([{ start: 0, end: 4.5 }])
  })

  it('split by fixed interval', () => {
    const shots = splitByInterval(10, 2)
    expect(shots).toHaveLength(5)
    expect(shots[4]).toEqual({ start: 8, end: 10 })
  })

  it('merge adjacent shots until the limit is reached', () => {
    const shots = splitByInterval(10, 1)
    const merged = mergeToLimit(shots, 4)
    expect(merged).toHaveLength(4)
    expect(merged[0].start).toBe(0)
    expect(merged[3].end).toBe(10)
    for (let index = 1; index < merged.length; index += 1) {
      expect(merged[index].start).toBeCloseTo(merged[index - 1].end)
    }
  })
})
