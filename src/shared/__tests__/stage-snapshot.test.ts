import { describe, expect, it } from 'vitest'
import { buildStageSnapshot, STAGE_SNAPSHOT_MAX_CHARS } from '../stage-snapshot'
import type { DirectorStageDoc } from '../stage-schema'

function doc(objectCount = 2): DirectorStageDoc {
  return {
    stageId: 'stage-1',
    name: '测试片场',
    objects: Array.from({ length: objectCount }, (_, index) => ({
      id: `o${index}`,
      type: 'box',
      name: `对象${index}`,
      transform: {
        position: [index, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1]
      }
    })),
    cameras: [
      { id: 'c1', name: '机位1', position: [0, 1, -5], target: [0, 1, 0], fov: 50 }
    ],
    shots: [
      {
        id: 'shot-1',
        cameraId: 'c1',
        durationMs: 5000,
        aspect: '16:9',
        cameraTrack: [
          { timeMs: 0, position: [0, 1, -5], target: [0, 1, 0], fov: 50 }
        ]
      }
    ],
    background: { kind: 'color', value: '#000000' }
  } as unknown as DirectorStageDoc
}

describe('buildStageSnapshot', () => {
  it('只给对象/机位/镜头的精简字段', () => {
    const snapshot = JSON.parse(buildStageSnapshot(doc()))
    expect(snapshot.objects[0]).toMatchObject({
      id: 'o0',
      name: '对象0',
      type: 'box'
    })
    expect(snapshot.cameras[0]).toEqual({ id: 'c1', name: '机位1' })
    expect(snapshot.shots[0]).toMatchObject({ id: 'shot-1', keyframes: 1 })
    expect(snapshot.background).toBe('color')
  })

  it('没有打开导演台时返回空串', () => {
    expect(buildStageSnapshot(null)).toBe('')
    expect(buildStageSnapshot(undefined)).toBe('')
  })

  it('超限时截断并标记 truncated，且仍是合法 JSON', () => {
    const snapshot = JSON.parse(buildStageSnapshot(doc(200)))
    expect(snapshot.truncated).toBe(true)
    expect(snapshot.objects.length).toBeLessThan(100)
    expect(JSON.stringify(snapshot).length).toBeLessThanOrEqual(
      STAGE_SNAPSHOT_MAX_CHARS
    )
  })
})
