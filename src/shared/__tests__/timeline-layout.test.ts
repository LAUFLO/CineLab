import { describe, expect, it } from 'vitest'
import { createClip, createTimeline } from '../timeline-schema'
import {
  clipsInRange,
  formatTimecode,
  msToPx,
  pxPerMs,
  pxToMs,
  rulerSteps,
  scrollLeftForAnchor,
  visibleRange
} from '../timeline-layout'

describe('time and pixels', () => {
  it('maps 100% zoom to the whole timeline', () => {
    const density = pxPerMs(10_000, 1000, 1)
    expect(msToPx(10_000, density)).toBeCloseTo(1000, 5)
    expect(pxToMs(1000, density)).toBeCloseTo(10_000, 5)
  })

  it('uses a 30 second span for an empty timeline', () => {
    const density = pxPerMs(0, 900, 1)
    expect(pxToMs(900, density)).toBeCloseTo(30_000, 5)
  })

  it('keeps the time under the mouse when zooming', () => {
    const oldDensity = pxPerMs(10_000, 1000, 1)
    const anchorMs = pxToMs(500, oldDensity)
    const nextDensity = pxPerMs(10_000, 1000, 2)
    const scrollLeft = scrollLeftForAnchor(500, anchorMs, nextDensity, 0)
    expect(pxToMs((scrollLeft + 500) / 1, nextDensity)).toBeCloseTo(anchorMs, 3)
  })
})

describe('visible range', () => {
  it('accounts for the track header inset', () => {
    const range = visibleRange(140, 860, 0.1, 140)
    expect(range.startMs).toBeCloseTo(0, 5)
    expect(range.endMs).toBeCloseTo(8600, 5)
  })

  it('filters clips outside the viewport', () => {
    const doc = createTimeline({ id: 'tl1', name: '测试' })
    const trackId = doc.tracks[2].id
    const inside = createClip({ trackId, kind: 'video', startMs: 1000, durationMs: 1000 })
    const outside = createClip({ trackId, kind: 'video', startMs: 20_000, durationMs: 1000 })
    expect(clipsInRange([inside, outside], { startMs: 0, endMs: 5000 })).toEqual([inside])
  })
})

describe('ruler', () => {
  it('moves to frame-level steps when zoomed in far enough', () => {
    const steps = rulerSteps(3, 30)
    expect(steps.frameLevel).toBe(true)
    expect(steps.majorMs).toBeCloseTo(1000 / 30, 5)
  })

  it('uses whole seconds and minutes when zoomed out', () => {
    expect(rulerSteps(0.1, 30).majorMs).toBe(1000)
    expect(rulerSteps(0.001, 30).majorMs).toBeGreaterThanOrEqual(60_000)
  })

  it('formats timecode with and without frames', () => {
    expect(formatTimecode(5000)).toBe('00:05')
    expect(formatTimecode(90_000)).toBe('01:30')
    expect(formatTimecode(3_723_000)).toBe('01:02:03')
    expect(formatTimecode(5000, 30, true)).toBe('00:00:05:00')
  })
})
