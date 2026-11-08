import { describe, expect, it } from 'vitest'
import { createClip, createTimeline, type TimelineDoc } from '../timeline-schema'
import {
  closeGaps,
  insertClips,
  linkageShift,
  moveClips,
  overwriteClips,
  removeClips,
  removeRanges,
  splitClips,
  trimClip
} from '../timeline-edit'

function setup(): { doc: TimelineDoc; subtitle: string; v1: string; a1: string } {
  const doc = createTimeline({ id: 'tl1', name: '测试' })
  return {
    doc,
    subtitle: doc.tracks[0].id,
    v1: doc.tracks[2].id,
    a1: doc.tracks[3].id
  }
}

function clipAt(doc: TimelineDoc, trackId: string, startMs: number, durationMs: number) {
  const clip = createClip({ trackId, kind: 'video', startMs, durationMs })
  doc.clips.push(clip)
  return clip
}

function spans(doc: TimelineDoc, trackId: string) {
  return doc.clips
    .filter((clip) => clip.trackId === trackId)
    .sort((a, b) => a.startMs - b.startMs)
    .map((clip) => [clip.startMs, clip.durationMs])
}

describe('insert and overwrite', () => {
  it('inserts a clip and pushes later clips', () => {
    const { doc, v1 } = setup()
    clipAt(doc, v1, 0, 5000)
    const incoming = createClip({
      trackId: v1,
      kind: 'image',
      startMs: 2000,
      durationMs: 2000
    })

    insertClips(doc, v1, 2000, [incoming])

    expect(spans(doc, v1)).toEqual([
      [0, 2000],
      [2000, 2000],
      [4000, 3000]
    ])
  })

  it('rounds a fractional insert time so the split tail is pushed', () => {
    const { doc, v1 } = setup()
    clipAt(doc, v1, 0, 5000)
    const incoming = createClip({
      trackId: v1,
      kind: 'image',
      startMs: 2000,
      durationMs: 2000
    })

    insertClips(doc, v1, 2000.6, [incoming])

    expect(spans(doc, v1)).toEqual([
      [0, 2001],
      [2001, 2000],
      [4001, 2999]
    ])
  })
  it('insert splits the clip under the pointer and pushes the rest right', () => {
    const { doc, v1 } = setup()
    clipAt(doc, v1, 0, 2000)
    const incoming = createClip({ trackId: v1, kind: 'image', durationMs: 1000 })
    insertClips(doc, v1, 1000, [incoming])

    expect(spans(doc, v1)).toEqual([
      [0, 1000],
      [1000, 1000],
      [2000, 1000]
    ])
  })

  it('overwrite cuts the covered range and keeps the edges', () => {
    const { doc, v1 } = setup()
    clipAt(doc, v1, 0, 2000)
    const incoming = createClip({ trackId: v1, kind: 'image', durationMs: 1000 })
    overwriteClips(doc, v1, 500, [incoming])

    expect(spans(doc, v1)).toEqual([
      [0, 500],
      [500, 1000],
      [1500, 500]
    ])
  })
})

describe('move', () => {
  it('moves without pushing when overwriting', () => {
    const { doc, v1 } = setup()
    const a = clipAt(doc, v1, 0, 2000)
    const b = clipAt(doc, v1, 3000, 1000)
    moveClips(doc, [{ clipId: b.id, startMs: 500, trackId: v1 }], 'overwrite')

    expect(spans(doc, v1)).toEqual([
      [0, 500],
      [500, 1000],
      [1500, 500]
    ])
    expect(doc.clips.find((clip) => clip.id === a.id)).toBeTruthy()
  })

  it('pushes following clips when inserting', () => {
    const { doc, v1 } = setup()
    clipAt(doc, v1, 0, 2000)
    const b = clipAt(doc, v1, 2000, 1000)
    moveClips(doc, [{ clipId: b.id, startMs: 500, trackId: v1 }], 'insert')

    expect(spans(doc, v1)).toEqual([
      [0, 500],
      [500, 1000],
      [1500, 1500]
    ])
  })
})

describe('trim', () => {
  it('trims the tail', () => {
    const { doc, v1 } = setup()
    const a = clipAt(doc, v1, 0, 2000)
    trimClip(doc, a.id, 'end', 500)
    expect(spans(doc, v1)).toEqual([[0, 2500]])
  })

  it('trims the head and moves the source in point', () => {
    const { doc, v1 } = setup()
    const a = clipAt(doc, v1, 1000, 2000)
    trimClip(doc, a.id, 'start', 500)
    const kept = doc.clips.find((clip) => clip.id === a.id)!
    expect(kept.startMs).toBe(1500)
    expect(kept.sourceStartMs).toBe(500)
    expect(kept.durationMs).toBe(1500)
  })

  it('never trims below one frame', () => {
    const { doc, v1 } = setup()
    const a = clipAt(doc, v1, 0, 1000)
    trimClip(doc, a.id, 'end', -10000)
    expect(doc.clips[0].durationMs).toBeGreaterThan(0)
  })
})

describe('split', () => {
  it('splits a clip and keeps the source offset', () => {
    const { doc, v1 } = setup()
    const a = clipAt(doc, v1, 0, 2000)
    a.sourceStartMs = 100
    splitClips(doc, [a.id], 1000)

    expect(spans(doc, v1)).toEqual([
      [0, 1000],
      [1000, 1000]
    ])
    const tail = doc.clips.find((clip) => clip.startMs === 1000)!
    expect(tail.sourceStartMs).toBe(1100)
  })

  it('does nothing when the split point is outside the clip', () => {
    const { doc, v1 } = setup()
    const a = clipAt(doc, v1, 1000, 1000)
    splitClips(doc, [a.id], 50)
    expect(doc.clips).toHaveLength(1)
  })
})

describe('remove', () => {
  it('leaves a gap without ripple', () => {
    const { doc, v1 } = setup()
    const a = clipAt(doc, v1, 0, 1000)
    clipAt(doc, v1, 1000, 1000)
    removeClips(doc, [a.id], false)
    expect(spans(doc, v1)).toEqual([[1000, 1000]])
  })

  it('closes the gap with ripple', () => {
    const { doc, v1 } = setup()
    const a = clipAt(doc, v1, 0, 1000)
    clipAt(doc, v1, 1000, 1000)
    removeClips(doc, [a.id], true)
    expect(spans(doc, v1)).toEqual([[0, 1000]])
  })
})

describe('gaps', () => {
  it('closes every gap on a track', () => {
    const { doc, v1 } = setup()
    clipAt(doc, v1, 0, 1000)
    clipAt(doc, v1, 2000, 1000)
    clipAt(doc, v1, 4000, 500)
    closeGaps(doc, v1)
    expect(spans(doc, v1)).toEqual([
      [0, 1000],
      [1000, 1000],
      [2000, 500]
    ])
  })
})

describe('removeRanges', () => {
  it('cuts ranges and closes gaps on all tracks', () => {
    const { doc, v1, a1, subtitle } = setup()
    clipAt(doc, v1, 0, 5000)
    doc.clips.push(
      createClip({ trackId: a1, kind: 'audio', startMs: 0, durationMs: 5000 }),
      createClip({ trackId: subtitle, kind: 'text', startMs: 0, durationMs: 5000 })
    )

    removeRanges(doc, [{ startMs: 1000, endMs: 2000 }], true)

    expect(spans(doc, v1)).toEqual([
      [0, 1000],
      [1000, 3000]
    ])
    expect(spans(doc, a1)).toEqual([
      [0, 1000],
      [1000, 3000]
    ])
    expect(spans(doc, subtitle)).toEqual([
      [0, 1000],
      [1000, 3000]
    ])
  })

  it('handles multiple ranges from the back', () => {
    const { doc, v1 } = setup()
    clipAt(doc, v1, 0, 5000)

    removeRanges(
      doc,
      [
        { startMs: 1000, endMs: 2000 },
        { startMs: 3000, endMs: 3500 }
      ],
      true
    )

    expect(spans(doc, v1)).toEqual([
      [0, 1000],
      [1000, 1000],
      [2000, 1500]
    ])
  })

  it('keeps locked tracks untouched', () => {
    const { doc, v1, a1 } = setup()
    clipAt(doc, v1, 0, 5000)
    doc.clips.push(
      createClip({ trackId: a1, kind: 'audio', startMs: 0, durationMs: 5000 })
    )
    doc.tracks = doc.tracks.map((track) =>
      track.id === v1 ? { ...track, locked: true } : track
    )

    removeRanges(doc, [{ startMs: 1000, endMs: 2000 }], true)

    expect(spans(doc, v1)).toEqual([[0, 5000]])
    expect(spans(doc, a1)).toEqual([
      [0, 1000],
      [1000, 3000]
    ])
  })

  it('can leave gaps when ripple is false', () => {
    const { doc, v1 } = setup()
    clipAt(doc, v1, 0, 5000)

    removeRanges(doc, [{ startMs: 1000, endMs: 2000 }], false)

    expect(spans(doc, v1)).toEqual([
      [0, 1000],
      [2000, 3000]
    ])
  })
})

describe('linkage', () => {
  it('moves subtitle clips that ride on a main-track clip', () => {
    const { doc, v1, subtitle } = setup()
    const main = clipAt(doc, v1, 0, 2000)
    const caption = createClip({ trackId: subtitle, kind: 'text', startMs: 500, durationMs: 1000 })
    doc.clips.push(caption)
    linkageShift(doc, main, 500)
    expect(caption.startMs).toBe(1000)
  })

  it('does not move clips outside the main clip', () => {
    const { doc, v1, subtitle } = setup()
    const main = clipAt(doc, v1, 0, 2000)
    const outside = createClip({ trackId: subtitle, kind: 'text', startMs: 3000, durationMs: 1000 })
    doc.clips.push(outside)
    linkageShift(doc, main, 500)
    expect(outside.startMs).toBe(3000)
  })

  it('shifts dependents when moving a main-track clip', () => {
    const { doc, v1, subtitle } = setup()
    const main = clipAt(doc, v1, 0, 2000)
    const caption = createClip({
      trackId: subtitle,
      kind: 'text',
      startMs: 500,
      durationMs: 1000
    })
    doc.clips.push(caption)
    moveClips(doc, [{ clipId: main.id, startMs: 1000, trackId: v1 }])

    expect(caption.startMs).toBe(1500)
  })

  it('removes dependents when deleting a main-track clip', () => {
    const { doc, v1, subtitle } = setup()
    const main = clipAt(doc, v1, 0, 2000)
    const caption = createClip({
      trackId: subtitle,
      kind: 'text',
      startMs: 500,
      durationMs: 1000
    })
    doc.clips.push(caption)
    removeClips(doc, [main.id])

    expect(doc.clips).toHaveLength(0)
  })

  it('keeps dependents when linkage is disabled', () => {
    const { doc, v1, subtitle } = setup()
    doc.linkage = false
    const main = clipAt(doc, v1, 0, 2000)
    const caption = createClip({
      trackId: subtitle,
      kind: 'text',
      startMs: 500,
      durationMs: 1000
    })
    doc.clips.push(caption)
    removeClips(doc, [main.id])

    expect(doc.clips).toHaveLength(1)
  })
})
