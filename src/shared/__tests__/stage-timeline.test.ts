import { describe, expect, it } from 'vitest'
import { easingProgress, sampleCameraTrack } from '../stage-timeline'
import type { CameraKeyframe, StageCamera } from '../stage-schema'

const camera: StageCamera = {
  id: 'cam_1',
  name: '机位 1',
  position: [0, 2, 6],
  target: [0, 1, 0],
  fov: 50
}

function key(
  timeMs: number,
  position: [number, number, number],
  target: [number, number, number] = [0, 1, 0],
  fov = 50,
  easing: CameraKeyframe['easing'] = 'linear'
): CameraKeyframe {
  return { timeMs, position, target, fov, easing }
}

describe('easingProgress', () => {
  it('keeps linear values unchanged', () => {
    expect(easingProgress(0)).toBe(0)
    expect(easingProgress(0.5)).toBe(0.5)
    expect(easingProgress(1)).toBe(1)
  })

  it('clamps out of range values', () => {
    expect(easingProgress(-1)).toBe(0)
    expect(easingProgress(2)).toBe(1)
  })

  it('produces expected easing curves', () => {
    expect(easingProgress(0.5, 'easeIn')).toBe(0.125)
    expect(easingProgress(0.5, 'easeOut')).toBe(0.875)
    expect(easingProgress(0.5, 'easeInOut')).toBe(0.5)
  })
})

describe('sampleCameraTrack', () => {
  it('falls back to the camera without keyframes', () => {
    expect(
      sampleCameraTrack(camera, { durationMs: 5000, cameraTrack: [] }, 2500)
    ).toEqual({
      position: [0, 2, 6],
      target: [0, 1, 0],
      fov: 50
    })
  })

  it('returns the only keyframe', () => {
    expect(
      sampleCameraTrack(
        camera,
        {
          durationMs: 5000,
          cameraTrack: [key(1000, [1, 2, 3], [0, 0, 0], 40)]
        },
        4000
      )
    ).toEqual({ position: [1, 2, 3], target: [0, 0, 0], fov: 40 })
  })

  it('interpolates position, target and fov', () => {
    const sample = sampleCameraTrack(
      camera,
      {
        durationMs: 5000,
        cameraTrack: [
          key(0, [0, 0, 0], [0, 0, 0], 40),
          key(2000, [2, 4, 6], [2, 2, 2], 60)
        ]
      },
      1000
    )
    expect(sample).toEqual({
      position: [1, 2, 3],
      target: [1, 1, 1],
      fov: 50
    })
  })

  it('clamps before the first and after the last keyframe', () => {
    const track = [key(1000, [1, 0, 0]), key(3000, [3, 0, 0])]
    expect(
      sampleCameraTrack(camera, { durationMs: 5000, cameraTrack: track }, 0)
        .position
    ).toEqual([1, 0, 0])
    expect(
      sampleCameraTrack(camera, { durationMs: 5000, cameraTrack: track }, 5000)
        .position
    ).toEqual([3, 0, 0])
  })

  it('applies the easing of the starting keyframe', () => {
    const track = [
      key(0, [0, 0, 0], [0, 0, 0], 50, 'easeIn'),
      key(1000, [1, 0, 0], [0, 0, 0], 50)
    ]
    expect(
      sampleCameraTrack(camera, { durationMs: 1000, cameraTrack: track }, 500)
        .position[0]
    ).toBeCloseTo(0.125)
  })

  it('handles unsorted keyframes', () => {
    const track = [key(1000, [2, 0, 0]), key(0, [0, 0, 0])]
    expect(
      sampleCameraTrack(camera, { durationMs: 1000, cameraTrack: track }, 500)
        .position[0]
    ).toBe(1)
  })
})
