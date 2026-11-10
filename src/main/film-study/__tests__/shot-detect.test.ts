import { describe, expect, it } from 'vitest'
import {
  buildCandidateTimes,
  detectMotionPeaks,
  type DetectedCut,
  type FrameStats
} from '../shot-detect'

function makeStats(
  pixDiff: number[],
  fps = 8,
  hist?: Float32Array[]
): FrameStats {
  return {
    width: 96,
    height: 54,
    fps,
    count: pixDiff.length,
    hist:
      hist ??
      pixDiff.map(() => {
        const buckets = new Float32Array(64)
        buckets[0] = 1
        return buckets
      }),
    pixDiff,
    changed: pixDiff.map((value) => Math.min(1, value * 4)),
    luma: pixDiff.map(() => 128)
  }
}

describe('detectMotionPeaks', () => {
  it('finds local motion peaks with spacing', () => {
    const values = new Array<number>(96).fill(0.005)
    for (const frame of [16, 32, 48, 64, 80]) {
      values[frame - 1] = 0.12
      values[frame] = 0.24
      values[frame + 1] = 0.12
    }

    const peaks = detectMotionPeaks(makeStats(values))
    expect(peaks.length).toBeGreaterThanOrEqual(4)
    expect(peaks.every((peak) => peak.kind === 'motion')).toBe(true)
  })

  it('returns nothing for a still video', () => {
    const values = new Array<number>(96).fill(0.002)
    expect(detectMotionPeaks(makeStats(values))).toHaveLength(0)
  })
})

describe('buildCandidateTimes', () => {
  it('uses motion peaks when there are no hard cuts', () => {
    const motion: DetectedCut[] = [1.5, 3.2, 4.8, 6.4, 8].map((time) => ({
      time,
      kind: 'motion',
      score: 0.2
    }))

    const cuts = buildCandidateTimes(motion, 12)
    expect(cuts[0]).toBe(0)
    expect(cuts[cuts.length - 1]).toBe(12)
    expect(cuts.length).toBeGreaterThanOrEqual(5)
  })

  it('falls back to fixed intervals for continuous video', () => {
    const cuts = buildCandidateTimes([], 12)
    expect(cuts[0]).toBe(0)
    expect(cuts[cuts.length - 1]).toBe(12)
    expect(cuts.length).toBeGreaterThanOrEqual(5)
  })

  it('prefers hard cuts when available', () => {
    const hard: DetectedCut[] = [2, 5, 8].map((time) => ({
      time,
      kind: 'cut',
      score: 0.6
    }))
    const cuts = buildCandidateTimes(hard, 12)
    expect(cuts).toEqual([0, 2, 5, 8, 12])
  })

  it('drops cuts that are too close together', () => {
    const hard: DetectedCut[] = [2, 2.2, 2.4].map((time) => ({
      time,
      kind: 'cut',
      score: 0.6
    }))
    const cuts = buildCandidateTimes(hard, 12)
    expect(cuts.filter((time) => time > 0 && time < 12)).toHaveLength(1)
  })
})
