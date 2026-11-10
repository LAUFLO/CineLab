import { describe, expect, it } from 'vitest'
import {
  createClip,
  createTimeline,
  type TimelineDoc
} from '@shared/timeline-schema'
import { applyCommand } from '@shared/timeline-commands'

function videoClip(doc: TimelineDoc, width: number, height: number) {
  const track = doc.tracks.find((item) => item.kind === 'video')
  if (!track) throw new Error('no video track')
  return createClip({
    trackId: track.id,
    kind: 'video',
    startMs: 0,
    durationMs: 1000,
    media: {
      scope: 'project',
      path: 'assets/vid/a.mp4',
      kind: 'video',
      width,
      height
    }
  })
}

describe('timeline canvas ratio', () => {
  it('matches a portrait first clip', () => {
    const doc = createTimeline({ id: 't', name: 't' })
    const next = applyCommand(doc, {
      op: 'addClip',
      clip: videoClip(doc, 1080, 1920)
    })
    expect(next.video.width).toBe(1080)
    expect(next.video.height).toBe(1920)
  })

  it('matches a square first clip', () => {
    const doc = createTimeline({ id: 't', name: 't' })
    const next = applyCommand(doc, {
      op: 'addClip',
      clip: videoClip(doc, 1024, 1024)
    })
    expect(next.video.width).toBe(1080)
    expect(next.video.height).toBe(1080)
  })

  it('matches a 4:3 first clip', () => {
    const doc = createTimeline({ id: 't', name: 't' })
    const next = applyCommand(doc, {
      op: 'addClip',
      clip: videoClip(doc, 1440, 1080)
    })
    expect(next.video.width).toBe(1440)
    expect(next.video.height).toBe(1080)
  })

  it('matches a 21:9 first clip', () => {
    const doc = createTimeline({ id: 't', name: 't' })
    const next = applyCommand(doc, {
      op: 'addClip',
      clip: videoClip(doc, 2560, 1080)
    })
    expect(next.video.width).toBe(2560)
    expect(next.video.height).toBe(1080)
  })

  it('keeps 16:9 for landscape clips', () => {
    const doc = createTimeline({ id: 't', name: 't' })
    const next = applyCommand(doc, {
      op: 'addClip',
      clip: videoClip(doc, 1920, 1080)
    })
    expect(next.video.width).toBe(1920)
    expect(next.video.height).toBe(1080)
  })

  it('does not change a canvas that already has clips', () => {
    const doc = createTimeline({ id: 't', name: 't' })
    const first = applyCommand(doc, {
      op: 'addClip',
      clip: videoClip(doc, 1920, 1080)
    })
    const next = applyCommand(first, {
      op: 'addClip',
      clip: videoClip(first, 1080, 1920)
    })
    expect(next.video.width).toBe(1920)
    expect(next.video.height).toBe(1080)
  })

  it('does not override a manually chosen canvas', () => {
    const doc = createTimeline({
      id: 't',
      name: 't',
      width: 1080,
      height: 1920
    })
    const next = applyCommand(doc, {
      op: 'addClip',
      clip: videoClip(doc, 1920, 1080)
    })
    expect(next.video.width).toBe(1080)
    expect(next.video.height).toBe(1920)
  })
})
