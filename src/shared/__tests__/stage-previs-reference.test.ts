import { describe, expect, it } from 'vitest'
import {
  buildStageStructureJson,
  STAGE_PREVIS_REFERENCE_PROMPT
} from '../stage-previs-reference'
import type { DirectorStageDoc } from '../stage-schema'

function doc(): DirectorStageDoc {
  return {
    id: 'stage_1',
    name: '测试片场',
    objects: [
      {
        id: 'o1',
        type: 'human',
        name: '主角',
        transform: {
          position: [1, 0, 2],
          rotation: [0, Math.PI / 2, 0],
          scale: [1, 1, 1]
        },
        visible: true
      }
    ],
    cameras: [
      {
        id: 'c1',
        name: '主机位',
        position: [0, 1.6, -5],
        target: [0, 1, 0],
        fov: 50
      }
    ],
    shots: [
      {
        id: 's1',
        cameraId: 'c1',
        durationMs: 5000,
        aspect: '16:9',
        cameraTrack: [
          { timeMs: 0, position: [0, 1.6, -5], target: [0, 1, 0], fov: 50 }
        ],
        actionTracks: []
      }
    ],
    program: { version: 1, entries: [{ shotId: 's1' }] },
    background: { kind: 'color', value: '#000000' }
  } as unknown as DirectorStageDoc
}

describe('buildStageStructureJson', () => {
  it('包含机位、对象朝向、镜头顺序与关键帧', () => {
    const parsed = JSON.parse(buildStageStructureJson(doc()))
    expect(parsed.objects[0]).toMatchObject({ name: '主角', facing: 'left' })
    expect(parsed.cameras[0]!.id).toBe('c1')
    expect(parsed.shots[0]).toMatchObject({ order: 1, durationMs: 5000 })
    expect(parsed.shots[0]!.cameraTrack).toHaveLength(1)
  })
})

describe('STAGE_PREVIS_REFERENCE_PROMPT', () => {
  it('强调保持站位与镜头运动不变', () => {
    expect(STAGE_PREVIS_REFERENCE_PROMPT).toContain('人物位置')
    expect(STAGE_PREVIS_REFERENCE_PROMPT).toContain('镜头运动方向')
  })
})
