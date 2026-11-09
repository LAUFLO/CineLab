import { describe, expect, it } from 'vitest'
import {
  evenSize,
  stagePreviewFrameCount,
  stagePreviewSize
} from '../stage-preview'

describe('stagePreviewSize', () => {
  it('returns 720p landscape, portrait and square sizes', () => {
    expect(stagePreviewSize('16:9', '720p')).toEqual({
      width: 1280,
      height: 720
    })
    expect(stagePreviewSize('9:16', '720p')).toEqual({
      width: 720,
      height: 1280
    })
    expect(stagePreviewSize('1:1', '720p')).toEqual({
      width: 720,
      height: 720
    })
  })

  it('returns 1080p sizes', () => {
    expect(stagePreviewSize('16:9', '1080p')).toEqual({
      width: 1920,
      height: 1080
    })
    expect(stagePreviewSize('9:16', '1080p')).toEqual({
      width: 1080,
      height: 1920
    })
    expect(stagePreviewSize('1:1', '1080p')).toEqual({
      width: 1080,
      height: 1080
    })
  })

  it('keeps even dimensions', () => {
    expect(evenSize({ width: 721, height: 481 })).toEqual({
      width: 722,
      height: 482
    })
  })
})

describe('stagePreviewFrameCount', () => {
  it('computes frames from duration and fps', () => {
    expect(stagePreviewFrameCount(5000, 24)).toBe(120)
    expect(stagePreviewFrameCount(5000, 30)).toBe(150)
    expect(stagePreviewFrameCount(100, 24)).toBe(3)
  })

  it('returns at least one frame', () => {
    expect(stagePreviewFrameCount(0, 24)).toBe(1)
    expect(stagePreviewFrameCount(5000, 0)).toBe(1)
  })
})
