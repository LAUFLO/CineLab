import { describe, expect, it } from 'vitest'
import type { StagePath, StagePathTimeKey } from '../stage-schema'
import { validateStagePath } from '../stage-schema'
import {
  actionTrackFromPath,
  atForTime,
  cameraTrackFromPath,
  mergeActionTrack,
  mergeCameraTrack,
  normalizeTimeKeys,
  scalePathTimes,
  smoothPath
} from '../stage-paths'

function makePath(overrides: Partial<StagePath> = {}): StagePath {
  return {
    id: 'path_test',
    name: '测试路径',
    kind: 'camera',
    points: [
      { position: [0, 0, 0] },
      { position: [10, 0, 0] }
    ],
    visible: true,
    smooth: 0.5,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

const timeKeys: StagePathTimeKey[] = [
  { at: 0, timeMs: 0, easing: 'linear' },
  { at: 1, timeMs: 1000, easing: 'linear' }
]

describe('stage-paths', () => {
  it('smoothPath 保留端点和闭合首点', () => {
    const points = smoothPath(
      [
        [0, 0, 0],
        [5, 0, 0],
        [10, 0, 0]
      ],
      1,
      false
    )
    expect(points[0]).toEqual([0, 0, 0])
    expect(points[points.length - 1]).toEqual([10, 0, 0])

    const closed = smoothPath(
      [
        [0, 0, 0],
        [5, 0, 0],
        [5, 0, 5]
      ],
      1,
      true
    )
    expect(closed[closed.length - 1]).toEqual([0, 0, 0])
  })

  it('normalizeTimeKeys 缺省生成起点/终点', () => {
    expect(normalizeTimeKeys(makePath(), 1000)).toEqual([
      { at: 0, timeMs: 0, easing: 'linear' },
      { at: 1, timeMs: 1000, easing: 'linear' }
    ])
  })

  it('atForTime 按段内缓动映射弧长', () => {
    const linear = atForTime(timeKeys, 500, 1000)
    expect(linear.at).toBeCloseTo(0.5)

    const easeIn = atForTime(
      [
        { at: 0, timeMs: 0, easing: 'easeIn' },
        { at: 1, timeMs: 1000, easing: 'linear' }
      ],
      500,
      1000
    )
    expect(easeIn.at).toBeLessThan(0.5)
  })

  it('cameraTrackFromPath 生成路径关键帧', () => {
    const path = makePath({ targetMode: 'ahead', lookAhead: 1 })
    const track = cameraTrackFromPath({
      path,
      camera: {
        id: 'cam',
        name: '机位',
        position: [0, 2, 5],
        target: [0, 1, 0],
        fov: 50
      },
      durationMs: 1000
    })
    expect(track.length).toBeGreaterThan(1)
    expect(track[0].position[0]).toBeCloseTo(0)
    expect(track[track.length - 1].position[0]).toBeCloseTo(10)
    expect(track.every((key) => key.source === 'path')).toBe(true)
  })

  it('mergeCameraTrack 保留手动关键帧并让手动优先', () => {
    const manual = {
      timeMs: 500,
      position: [1, 2, 3] as [number, number, number],
      target: [0, 0, 0] as [number, number, number],
      fov: 50,
      source: 'manual' as const
    }
    const generated = [
      {
        timeMs: 500,
        position: [9, 9, 9] as [number, number, number],
        target: [0, 0, 0] as [number, number, number],
        fov: 50,
        source: 'path' as const
      },
      {
        timeMs: 1000,
        position: [10, 0, 0] as [number, number, number],
        target: [0, 0, 0] as [number, number, number],
        fov: 50,
        source: 'path' as const
      }
    ]
    const merged = mergeCameraTrack([manual], generated)
    expect(merged).toHaveLength(2)
    expect(merged.find((key) => key.timeMs === 500)?.position).toEqual([1, 2, 3])
  })

  it('actionTrackFromPath 沿切线生成朝向', () => {
    const path = makePath({
      kind: 'object',
      objectId: 'obj',
      points: [
        { position: [0, 0, 0] },
        { position: [10, 0, 0] }
      ]
    })
    const track = actionTrackFromPath({
      path,
      object: {
        id: 'obj',
        type: 'human',
        name: '人物',
        transform: {
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1]
        }
      },
      durationMs: 1000
    })
    expect(track.objectId).toBe('obj')
    expect(track.keys[0].position?.[0]).toBeCloseTo(0)
    expect(track.keys[track.keys.length - 1].rotation?.[1]).toBeCloseTo(
      Math.PI / 2
    )
  })

  it('mergeActionTrack 保留姿势关键帧', () => {
    const existing = {
      objectId: 'obj',
      keys: [
        {
          timeMs: 500,
          pose: 'wave' as const
        }
      ]
    }
    const generated = {
      objectId: 'obj',
      keys: [
        {
          timeMs: 0,
          position: [0, 0, 0] as [number, number, number]
        },
        {
          timeMs: 1000,
          position: [10, 0, 0] as [number, number, number]
        }
      ]
    }
    const merged = mergeActionTrack(existing, generated)
    expect(merged.keys.some((key) => key.pose === 'wave')).toBe(true)
  })

  it('scalePathTimes 按比例缩放时间节点', () => {
    const scaled = scalePathTimes(
      [makePath({ timeKeys })],
      2000,
      1000
    )
    expect(scaled?.[0].timeKeys).toEqual([
      { at: 0, timeMs: 0, easing: 'linear' },
      { at: 1, timeMs: 500, easing: 'linear' }
    ])
  })

  it('validateStagePath 拒绝非法路径', () => {
    expect(
      validateStagePath(makePath(), 1000, new Set())[0]
    ).toBeUndefined()
    expect(
      validateStagePath(
        makePath({ points: [{ position: [0, 0, 0] }] }),
        1000,
        new Set()
      ).length
    ).toBeGreaterThan(0)
    expect(
      validateStagePath(
        makePath({ kind: 'object', objectId: 'missing' }),
        1000,
        new Set()
      ).length
    ).toBeGreaterThan(0)
  })
})
