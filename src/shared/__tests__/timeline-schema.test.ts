import { describe, expect, it } from 'vitest'
import {
  createClip,
  createTimeline,
  mainTrackId,
  timelineDocSchema,
  timelineDurationMs
} from '../timeline-schema'

describe('timeline schema', () => {
  it('creates subtitle above video above audio', () => {
    const doc = createTimeline({ id: 'tl1', name: '测试' })
    expect(doc.tracks.map((track) => track.kind)).toEqual([
      'subtitle',
      'video',
      'video',
      'audio'
    ])
  })

  it('picks the lowest video track as the main track', () => {
    const doc = createTimeline({ id: 'tl1', name: '测试' })
    expect(mainTrackId(doc)).toBe(doc.tracks[2].id)
  })

  it('defaults image and text durations', () => {
    const doc = createTimeline({ id: 'tl1', name: '测试' })
    const trackId = doc.tracks[2].id
    expect(createClip({ trackId, kind: 'image' }).durationMs).toBe(5000)
    expect(createClip({ trackId, kind: 'text' }).durationMs).toBe(4000)
  })

  it('validates a 4K timeline', () => {
    const doc = createTimeline({ id: 'tl1', name: '测试', width: 3840, height: 2160 })
    expect(timelineDocSchema.parse(doc).video.width).toBe(3840)
  })

  it('computes duration from the last clip end', () => {
    const doc = createTimeline({ id: 'tl1', name: '测试' })
    const trackId = doc.tracks[2].id
    doc.clips.push(createClip({ trackId, kind: 'image', startMs: 1000, durationMs: 3000 }))
    expect(timelineDurationMs(doc)).toBe(4000)
  })
})
