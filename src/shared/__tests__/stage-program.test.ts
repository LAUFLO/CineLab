import { describe, expect, it } from 'vitest'
import {
  buildProgramTimeline,
  formatTimecode,
  programAt,
  segmentShotTime
} from '../stage-program'
import {
  createStageDoc,
  type DirectorStageDoc,
  type StageProgramEntry,
  type StageShot
} from '../stage-schema'

function shot(id: string, durationMs: number): StageShot {
  return { id, cameraId: 'cam', durationMs, aspect: '16:9' }
}

function stageDoc(
  shots: StageShot[],
  entries?: StageProgramEntry[]
): DirectorStageDoc {
  const base = createStageDoc('stage_test', '测试场景')
  return {
    ...base,
    shots,
    ...(entries ? { program: { version: 1, entries } } : {})
  }
}

describe('buildProgramTimeline', () => {
  it('无 program 时按 shots 串行', () => {
    const timeline = buildProgramTimeline(
      stageDoc([shot('a', 4000), shot('b', 6000)])
    )
    expect(timeline.durationMs).toBe(10000)
    expect(
      timeline.segments.map((item) => [
        item.shotId,
        item.startMs,
        item.endMs
      ])
    ).toEqual([
      ['a', 0, 4000],
      ['b', 4000, 10000]
    ])
  })

  it('指定 startMs 时保留重叠', () => {
    const timeline = buildProgramTimeline(
      stageDoc([shot('a', 4000), shot('b', 6000)], [
        { shotId: 'a', startMs: 0 },
        { shotId: 'b', startMs: 2000 }
      ])
    )
    expect(timeline.durationMs).toBe(8000)
    expect(timeline.segments).toHaveLength(2)
    expect(timeline.segments[1]!.startMs).toBe(2000)
  })

  it('缺省 startMs 接在上一条之后', () => {
    const timeline = buildProgramTimeline(
      stageDoc(
        [shot('a', 4000), shot('b', 3000), shot('c', 2000)],
        [
          { shotId: 'a' },
          { shotId: 'b', startMs: 1000 },
          { shotId: 'c' }
        ]
      )
    )
    const third = timeline.segments.find((item) => item.shotId === 'c')
    expect(third?.startMs).toBe(4000)
    expect(timeline.durationMs).toBe(6000)
  })

  it('跳过不存在的 shotId', () => {
    const timeline = buildProgramTimeline(
      stageDoc([shot('a', 1000)], [
        { shotId: 'missing' },
        { shotId: 'a' }
      ])
    )
    expect(timeline.segments).toHaveLength(1)
    expect(timeline.durationMs).toBe(1000)
  })

  it('允许同一个 shot 复用', () => {
    const timeline = buildProgramTimeline(
      stageDoc([shot('a', 1000)], [
        { shotId: 'a' },
        { shotId: 'a' }
      ])
    )
    expect(timeline.segments).toHaveLength(2)
    expect(timeline.segments[1]!.startMs).toBe(1000)
    expect(timeline.durationMs).toBe(2000)
  })
})

describe('programAt', () => {
  const timeline = buildProgramTimeline(
    stageDoc(
      [shot('a', 4000), shot('b', 4000), shot('c', 2000)],
      [
        { shotId: 'a', startMs: 0, front: 0 },
        { shotId: 'b', startMs: 2000, front: 2 },
        { shotId: 'c', startMs: 3000, front: 1 }
      ]
    )
  )

  it('重叠时取 front 最大', () => {
    expect(programAt(timeline, 2500)?.shotId).toBe('b')
    expect(programAt(timeline, 3500)?.shotId).toBe('b')
  })

  it('front 相同时取靠后的 entry', () => {
    const equal = buildProgramTimeline(
      stageDoc([shot('a', 4000), shot('b', 4000)], [
        { shotId: 'a', startMs: 0, front: 1 },
        { shotId: 'b', startMs: 1000, front: 1 }
      ])
    )
    expect(programAt(equal, 2000)?.shotId).toBe('b')
  })

  it('处理边界与黑场', () => {
    expect(programAt(timeline, 0)?.shotId).toBe('a')
    expect(programAt(timeline, 1999)?.shotId).toBe('a')
    expect(programAt(timeline, 2000)?.shotId).toBe('b')

    const gap = buildProgramTimeline(
      stageDoc([shot('a', 1000)], [{ shotId: 'a', startMs: 500 }])
    )
    expect(programAt(gap, 0)).toBeUndefined()
    expect(programAt(gap, 500)?.shotId).toBe('a')
    expect(programAt(gap, 1500)).toBeUndefined()
  })
})

describe('segmentShotTime', () => {
  it('返回镜头内部时间', () => {
    const timeline = buildProgramTimeline(
      stageDoc([shot('a', 4000), shot('b', 4000)], [
        { shotId: 'a', startMs: 1000 },
        { shotId: 'b' }
      ])
    )
    expect(segmentShotTime(timeline, 2000)).toEqual({
      segment: expect.objectContaining({ shotId: 'a', startMs: 1000 }),
      shotTimeMs: 1000
    })
    expect(segmentShotTime(timeline, 0)).toBeUndefined()
  })
})

describe('formatTimecode', () => {
  it('按帧取整', () => {
    expect(formatTimecode(0, 24)).toBe('00:00:00:00')
    expect(formatTimecode(1000, 24)).toBe('00:00:01:00')
    expect(formatTimecode(1500, 24)).toBe('00:00:01:12')
    expect(formatTimecode(3661000, 24)).toBe('01:01:01:00')
  })
})
