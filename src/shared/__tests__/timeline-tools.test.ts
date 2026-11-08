import { describe, expect, it } from 'vitest'
import { createClip, createTimeline, type TimelineDoc } from '../timeline-schema'
import {
  buildBeatMarkerPlan,
  buildBeatSplitPlan,
  buildRemoveSilencePlan,
  buildSplitByShotsPlan
} from '../timeline-tools'

function setup(): { doc: TimelineDoc; v1: string } {
  const doc = createTimeline({ id: 'tl-tools', name: '工具测试' })
  return { doc, v1: doc.tracks[2].id }
}

function videoClip(doc: TimelineDoc, trackId: string, startMs: number, durationMs: number) {
  const clip = createClip({ trackId, kind: 'video', startMs, durationMs })
  doc.clips.push(clip)
  return clip
}

describe('buildRemoveSilencePlan', () => {
  it('shrinks ranges by padding and filters short ranges', () => {
    const { doc, v1 } = setup()
    videoClip(doc, v1, 0, 5000)

    const plan = buildRemoveSilencePlan(
      doc,
      [
        { startMs: 1000, endMs: 2000 },
        { startMs: 3000, endMs: 3400 }
      ],
      { paddingMs: 120, minDurationMs: 400 }
    )

    expect(plan.commands).toHaveLength(1)
    expect(plan.commands[0]).toEqual({
      op: 'removeRanges',
      ranges: [{ startMs: 1120, endMs: 1880 }],
      ripple: true,
      trackIds: undefined
    })
    expect(plan.removedMs).toBe(760)
  })

  it('merges overlapping ranges after padding', () => {
    const { doc, v1 } = setup()
    videoClip(doc, v1, 0, 6000)

    const plan = buildRemoveSilencePlan(
      doc,
      [
        { startMs: 1000, endMs: 2000 },
        { startMs: 1800, endMs: 2500 }
      ],
      { paddingMs: 100, minDurationMs: 100 }
    )

    expect(plan.commands[0]).toMatchObject({
      op: 'removeRanges',
      ranges: [{ startMs: 1100, endMs: 2400 }]
    })
    expect(plan.rangeCount).toBe(1)
  })

  it('clamps ranges to the timeline duration', () => {
    const { doc, v1 } = setup()
    videoClip(doc, v1, 0, 2000)

    const plan = buildRemoveSilencePlan(
      doc,
      [{ startMs: 1500, endMs: 3000 }],
      { paddingMs: 100, minDurationMs: 100 }
    )

    expect(plan.commands[0]).toMatchObject({
      op: 'removeRanges',
      ranges: [{ startMs: 1600, endMs: 2000 }]
    })
  })

  it('returns an empty plan when nothing is removable', () => {
    const { doc, v1 } = setup()
    videoClip(doc, v1, 0, 2000)

    const plan = buildRemoveSilencePlan(doc, [], {})
    expect(plan.commands).toEqual([])
    expect(plan.summary).toContain('没有检测到')
  })

  it('warns about locked tracks', () => {
    const { doc, v1 } = setup()
    doc.tracks = doc.tracks.map((track) =>
      track.id === v1 ? { ...track, locked: true } : track
    )
    videoClip(doc, v1, 0, 5000)

    const plan = buildRemoveSilencePlan(doc, [{ startMs: 1000, endMs: 3000 }])
    expect(plan.warnings.join('')).toContain('锁定')
  })

  it('includes the duration change in the summary', () => {
    const { doc, v1 } = setup()
    videoClip(doc, v1, 0, 10_000)

    const plan = buildRemoveSilencePlan(doc, [{ startMs: 1000, endMs: 3000 }])
    expect(plan.summary).toContain('删除 1 段静音')
    expect(plan.summary).toContain('00:10')
    expect(plan.summary).toContain('00:08')
  })
})

describe('buildSplitByShotsPlan', () => {
  it('builds split commands from back to front', () => {
    const { doc, v1 } = setup()
    const clip = videoClip(doc, v1, 0, 5000)
    clip.name = '测试视频'

    const plan = buildSplitByShotsPlan(doc, clip.id, [1000, 2500, 4800], {
      minShotMs: 500,
      edgePaddingMs: 100
    })

    expect(plan.commands).toEqual([
      { op: 'splitClips', clipIds: [clip.id], atMs: 2500 },
      { op: 'splitClips', clipIds: [clip.id], atMs: 1000 }
    ])
    expect(plan.summary).toContain('2 个镜头切点')
    expect(plan.summary).toContain('3 段')
  })

  it('ignores edge points and clips too close together', () => {
    const { doc, v1 } = setup()
    const clip = videoClip(doc, v1, 0, 5000)

    const plan = buildSplitByShotsPlan(doc, clip.id, [50, 1200, 1400, 4950], {
      minShotMs: 500,
      edgePaddingMs: 100
    })

    expect(plan.commands).toEqual([
      { op: 'splitClips', clipIds: [clip.id], atMs: 1200 }
    ])
  })

  it('returns an empty plan when the clip is missing', () => {
    const { doc } = setup()
    const plan = buildSplitByShotsPlan(doc, 'missing', [1000])
    expect(plan.commands).toEqual([])
  })
})

describe('buildBeatMarkerPlan', () => {
  it('creates marker commands for beat points', () => {
    const { doc, v1 } = setup()
    videoClip(doc, v1, 0, 5000)

    const plan = buildBeatMarkerPlan(doc, [0, 1000, 6000])

    expect(plan.commands).toHaveLength(2)
    expect(plan.commands[0]).toMatchObject({
      op: 'addMarker',
      marker: { atMs: 0, label: '节拍' }
    })
    expect(plan.summary).toContain('2 个节拍标记')
  })

  it('reports the marker limit', () => {
    const { doc, v1 } = setup()
    videoClip(doc, v1, 0, 5000)
    doc.markers = Array.from({ length: 500 }, (_, index) => ({
      id: `m${index}`,
      atMs: index,
      label: '节拍'
    }))

    const plan = buildBeatMarkerPlan(doc, [1000])
    expect(plan.commands).toEqual([])
    expect(plan.summary).toContain('上限')
  })
})

describe('buildBeatSplitPlan', () => {
  it('builds main-track split commands from back to front', () => {
    const { doc, v1 } = setup()
    videoClip(doc, v1, 0, 5000)

    const plan = buildBeatSplitPlan(doc, [1000, 1100, 3000, 6000])

    expect(plan.commands).toEqual([
      { op: 'splitAt', trackId: v1, atMs: 3000 },
      { op: 'splitAt', trackId: v1, atMs: 1000 }
    ])
    expect(plan.summary).toContain('2 个节拍点')
  })

  it('returns an empty plan when the track is locked', () => {
    const { doc, v1 } = setup()
    videoClip(doc, v1, 0, 5000)
    doc.tracks = doc.tracks.map((track) =>
      track.id === v1 ? { ...track, locked: true } : track
    )

    const plan = buildBeatSplitPlan(doc, [1000])
    expect(plan.commands).toEqual([])
    expect(plan.summary).toContain('锁定')
  })
})
