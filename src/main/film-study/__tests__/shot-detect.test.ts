import { describe, expect, it } from 'vitest'
import {
  buildCandidateTimes,
  detectGradualTransitions,
  detectMotionPeaks,
  type DetectedCut,
  type FrameStats
} from '../shot-detect'

const THUMB_W = 48
const THUMB_H = 27

function frame(value: number): Uint8Array {
  return new Uint8Array(THUMB_W * THUMB_H).fill(value)
}

function blend(a: Uint8Array, b: Uint8Array, alpha: number): Uint8Array {
  const out = new Uint8Array(a.length)
  for (let index = 0; index < a.length; index += 1) {
    out[index] = Math.round(alpha * a[index] + (1 - alpha) * b[index])
  }
  return out
}

function wipe(
  a: Uint8Array,
  b: Uint8Array,
  edge: number
): Uint8Array {
  const out = new Uint8Array(a.length)
  for (let y = 0; y < THUMB_H; y += 1) {
    for (let x = 0; x < THUMB_W; x += 1) {
      const index = y * THUMB_W + x
      out[index] = x < edge ? b[index] : a[index]
    }
  }
  return out
}

function gradualStats(
  thumbs: Uint8Array[],
  pixDiff: number[],
  luma: number[],
  fps = 8
): FrameStats {
  return {
    width: THUMB_W * 2,
    height: THUMB_H * 2,
    fps,
    count: thumbs.length,
    hist: thumbs.map(() => new Float32Array(64)),
    pixDiff,
    changed: pixDiff.map((value) => Math.min(1, value * 4)),
    luma,
    thumbs
  }
}

describe('detectGradualTransitions', () => {
  const black = frame(0)
  const white = frame(255)

  it('detects a dissolve between two shots', () => {
    const stats = gradualStats(
      [
        black,
        black,
        blend(black, white, 0.75),
        blend(black, white, 0.5),
        blend(black, white, 0.25),
        white,
        white
      ],
      [0, 0, 0.06, 0.06, 0.06, 0, 0],
      [0, 0, 64, 128, 191, 255, 255]
    )
    const out = detectGradualTransitions(stats)
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('dissolve')
    expect(out[0].start).toBeCloseTo(1 / 8)
    expect(out[0].end).toBeCloseTo(5 / 8)
  })

  it('detects a wipe moving across the frame', () => {
    const stats = gradualStats(
      [
        black,
        black,
        wipe(black, white, 16),
        wipe(black, white, 32),
        wipe(black, white, 48),
        white,
        white
      ],
      [0, 0, 0.08, 0.08, 0.08, 0, 0],
      [0, 0, 85, 170, 255, 255, 255]
    )
    const out = detectGradualTransitions(stats)
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('wipe')
  })

  it('detects a flash to white', () => {
    const stats = gradualStats(
      [black, black, frame(180), frame(255), frame(180), black, black],
      [0, 0, 0.06, 0.06, 0.06, 0, 0],
      [0, 0, 180, 255, 180, 0, 0]
    )
    const out = detectGradualTransitions(stats)
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('flash')
  })

  it('ignores a hard cut', () => {
    const stats = gradualStats(
      [black, black, white, white],
      [0, 0.9, 0, 0],
      [0, 0, 255, 255]
    )
    expect(detectGradualTransitions(stats)).toEqual([])
  })

  it('returns nothing without thumbs', () => {
    const stats = gradualStats(
      [black, black, white, white],
      [0, 0.06, 0.06, 0],
      [0, 0, 255, 255]
    )
    delete (stats as Partial<FrameStats>).thumbs
    expect(detectGradualTransitions(stats)).toEqual([])
  })
})

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
