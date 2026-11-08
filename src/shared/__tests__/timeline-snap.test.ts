import { describe, expect, it } from 'vitest'
import { createClip, createTimeline } from '../timeline-schema'
import { snapTargets, snapValue } from '../timeline-snap'

describe('snap', () => {
  it('snaps to the nearest target within the threshold', () => {
    expect(snapValue(995, [0, 1000], 10)).toBe(1000)
    expect(snapValue(990, [0, 1000], 10)).toBe(1000)
    expect(snapValue(985, [0, 1000], 10)).toBe(985)
  })

  it('collects zero, playhead and clip edges', () => {
    const doc = createTimeline({ id: 'tl1', name: '测试' })
    const v1 = doc.tracks[2].id
    const clip = createClip({ trackId: v1, kind: 'video', startMs: 1000, durationMs: 2000 })
    doc.clips.push(clip)

    const targets = snapTargets(doc, v1, null, 5000)
    expect(targets).toContain(0)
    expect(targets).toContain(5000)
    expect(targets).toContain(1000)
    expect(targets).toContain(3000)
  })

  it('leaves out the clip being dragged', () => {
    const doc = createTimeline({ id: 'tl1', name: '测试' })
    const v1 = doc.tracks[2].id
    const clip = createClip({ trackId: v1, kind: 'video', startMs: 1000, durationMs: 2000 })
    doc.clips.push(clip)

    const targets = snapTargets(doc, v1, clip.id, 5000)
    expect(targets).not.toContain(1000)
    expect(targets).not.toContain(3000)
  })
})
