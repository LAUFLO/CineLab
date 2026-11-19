import { describe, expect, it } from 'vitest'
import type { FilmStudyShot } from '@shared/film-study-v2'
import type { FrameStats } from '../shot-detect'
import {
  analyzeProduction,
  classifyProduction,
  computeShotFeatures,
  type ShotFeatures
} from '../production'

const W = 48
const H = 27

function flat(value: number): Uint8Array {
  return new Uint8Array(W * H).fill(value)
}

function checker(): Uint8Array {
  const frame = new Uint8Array(W * H)
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      frame[y * W + x] = (x + y) % 2 === 0 ? 0 : 255
    }
  }
  return frame
}

function gradient(): Uint8Array {
  const frame = new Uint8Array(W * H)
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      frame[y * W + x] = Math.round((x / (W - 1)) * 255)
    }
  }
  return frame
}

function stats(thumbs: Uint8Array[], pixDiff: number[]): FrameStats {
  return {
    width: W * 2,
    height: H * 2,
    fps: 8,
    count: thumbs.length,
    hist: thumbs.map(() => new Float32Array(64)),
    pixDiff,
    changed: pixDiff.map((value) => Math.min(1, value * 4)),
    luma: thumbs.map(
      (frame) =>
        frame.reduce((sum, value) => sum + value, 0) / Math.max(1, frame.length)
    ),
    thumbs
  }
}

function shot(): FilmStudyShot {
  return {
    index: 1,
    startTime: 0,
    endTime: 1,
    duration: 1,
    firstFrame: 'frames/1_first.jpg',
    lastFrame: 'frames/1_last.jpg'
  }
}

function features(overrides: Partial<ShotFeatures>): ShotFeatures {
  return {
    dupRatio: 0,
    frozenRatio: 0,
    flatRatio: 0,
    grayLevels: 128,
    texture: 200,
    lumaMean: 120,
    ...overrides
  }
}

describe('computeShotFeatures', () => {
  it('sees a frozen shot', () => {
    const frame = flat(128)
    const result = computeShotFeatures(
      stats(
        [frame, frame, frame, frame, frame, frame, frame, frame],
        [0, 0, 0, 0, 0, 0, 0, 0]
      ),
      shot()
    )
    expect(result.dupRatio).toBe(1)
    expect(result.frozenRatio).toBe(1)
    expect(result.flatRatio).toBeGreaterThan(0.9)
    expect(result.grayLevels).toBe(1)
  })

  it('sees texture in a checkerboard', () => {
    const frame = checker()
    const result = computeShotFeatures(
      stats([frame, frame, frame], [0, 0.05, 0.05]),
      shot()
    )
    expect(result.flatRatio).toBeLessThan(0.2)
    expect(result.texture).toBeGreaterThan(1000)
  })
})

describe('classifyProduction', () => {
  it('labels a frozen shot as static_hold', () => {
    const result = classifyProduction(features({ dupRatio: 0.95 }))
    expect(result.label).toBe('static_hold')
    expect(result.evidence[0]).toContain('逐像素重复')
  })

  it('labels a still image with motion as still_motion', () => {
    const result = classifyProduction(
      features({ dupRatio: 0.5, frozenRatio: 0.8 })
    )
    expect(result.label).toBe('still_motion')
  })

  it('labels flat graphics as code_render', () => {
    const result = classifyProduction(
      features({
        dupRatio: 0.1,
        frozenRatio: 0.9,
        flatRatio: 0.7,
        grayLevels: 20
      })
    )
    expect(result.label).toBe('code_render')
    expect(result.material).toBe('rendered')
  })

  it('labels screenshots as screen_capture', () => {
    const result = classifyProduction(
      features({
        dupRatio: 0,
        frozenRatio: 0.1,
        flatRatio: 0.6,
        grayLevels: 80
      })
    )
    expect(result.label).toBe('screen_capture')
  })

  it('labels textured footage as live_action with low confidence', () => {
    const result = classifyProduction(
      features({ texture: 500, flatRatio: 0.1, grayLevels: 200 })
    )
    expect(result.label).toBe('live_action')
    expect(result.confidence).toBeLessThan(0.5)
    expect(result.material).toBe('real')
  })

  it('labels a smooth gradient as cg_3d', () => {
    const result = classifyProduction(
      features({ texture: 10, flatRatio: 0.1, grayLevels: 250 })
    )
    expect(result.label).toBe('cg_3d')
  })

  it('falls back to ai_video with low confidence', () => {
    const result = classifyProduction(
      features({ texture: 60, flatRatio: 0.3, grayLevels: 120 })
    )
    expect(result.label).toBe('ai_video')
    expect(result.confidence).toBeLessThan(0.5)
  })
})

describe('analyzeProduction', () => {
  it('keeps shots unchanged without frame stats', () => {
    const input = [shot()]
    expect(analyzeProduction(input, null)).toEqual(input)
  })

  it('writes production on every shot', () => {
    const frame = flat(128)
    const result = analyzeProduction(
      [shot()],
      stats(
        [frame, frame, frame, frame, frame, frame, frame, frame],
        [0, 0, 0, 0, 0, 0, 0, 0]
      )
    )
    expect(result[0].production?.label).toBe('static_hold')
    expect(result[0].production?.evidence.length).toBeGreaterThan(0)
  })
})
