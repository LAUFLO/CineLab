import { describe, expect, it } from 'vitest'
import { createClip, createTimeline, mainTrackId, type TimelineDoc } from '../timeline-schema'
import {
  applyCommand,
  applyCommands,
  summarizeTimeline,
  type TimelineCommand
} from '../timeline-commands'

function setup(): { doc: TimelineDoc; subtitle: string; v1: string; a1: string } {
  const doc = createTimeline({ id: 'tl1', name: '测试' })
  return {
    doc,
    subtitle: doc.tracks[0].id,
    v1: doc.tracks[2].id,
    a1: doc.tracks[3].id
  }
}

describe('applyCommand', () => {
  it('does not mutate the input document', () => {
    const { doc, v1 } = setup()
    const clip = createClip({ trackId: v1, kind: 'video', durationMs: 2000 })
    const next = applyCommand(doc, { op: 'addClip', clip })

    expect(doc.clips).toHaveLength(0)
    expect(next.clips).toHaveLength(1)
  })

  it('adds clips in sequence with insert mode', () => {
    const { doc, v1 } = setup()
    const first = createClip({ trackId: v1, kind: 'image', durationMs: 1000 })
    const second = createClip({ trackId: v1, kind: 'image', durationMs: 2000 })

    const next = applyCommand(doc, {
      op: 'addClipsInSequence',
      clips: [first, second],
      trackId: v1,
      atMs: 0,
      mode: 'insert'
    })

    expect(next.clips.map((clip) => [clip.startMs, clip.durationMs])).toEqual([
      [0, 1000],
      [1000, 2000]
    ])
  })

  it('inserts at a cut point and pushes the tail', () => {
    const { doc, v1 } = setup()
    const source = createClip({
      trackId: v1,
      kind: 'video',
      startMs: 8914,
      durationMs: 5000
    })
    doc.clips.push(source)
    const freeze = createClip({
      trackId: v1,
      kind: 'image',
      startMs: 12244,
      durationMs: 2000
    })

    const next = applyCommand(doc, {
      op: 'addClipsInSequence',
      clips: [freeze],
      trackId: v1,
      atMs: 12244,
      mode: 'insert'
    })

    expect(
      next.clips
        .filter((clip) => clip.trackId === v1)
        .sort((a, b) => a.startMs - b.startMs)
        .map((clip) => [clip.startMs, clip.durationMs])
    ).toEqual([
      [8914, 3330],
      [12244, 2000],
      [14244, 1670]
    ])
  })

  it('applies a batch in order', () => {
    const { doc, v1 } = setup()
    const clip = createClip({ trackId: v1, kind: 'video', durationMs: 2000 })
    const commands: TimelineCommand[] = [
      { op: 'addClip', clip },
      { op: 'updateClip', clipId: clip.id, patch: { name: '镜头 1' } },
      { op: 'trimClip', clipId: clip.id, edge: 'end', deltaMs: 500 }
    ]

    const next = applyCommands(doc, commands)
    expect(next.clips).toHaveLength(1)
    expect(next.clips[0].name).toBe('镜头 1')
    expect(next.clips[0].durationMs).toBe(2500)
  })

  it('keeps clip duration in step with speed', () => {
    const { doc, v1 } = setup()
    const clip = createClip({ trackId: v1, kind: 'video', durationMs: 2000, speed: 1 })
    const next = applyCommand(
      applyCommand(doc, { op: 'addClip', clip }),
      { op: 'setClipSpeed', clipId: clip.id, speed: 2 }
    )

    expect(next.clips[0].speed).toBe(2)
    expect(next.clips[0].durationMs).toBe(1000)
  })

  it('detaches audio onto an audio track and mutes the video', () => {
    const { doc, v1 } = setup()
    const clip = createClip({
      trackId: v1,
      kind: 'video',
      durationMs: 2000,
      media: { scope: 'project', path: 'assets/vid/a.mp4', kind: 'video' }
    })

    const next = applyCommand(doc, { op: 'addClip', clip })
    const withAudio = applyCommand(next, { op: 'detachAudio', clipId: clip.id })

    const video = withAudio.clips.find((item) => item.kind === 'video')!
    const audio = withAudio.clips.find((item) => item.kind === 'audio')!
    expect(video.muted).toBe(true)
    expect(audio.durationMs).toBe(2000)
    expect(withAudio.tracks.some((track) => track.id === audio.trackId)).toBe(true)
  })

  it('refuses to remove the main track', () => {
    const { doc } = setup()
    const main = mainTrackId(doc)!
    const next = applyCommand(doc, { op: 'removeTrack', trackId: main })
    expect(next.tracks).toHaveLength(doc.tracks.length)
  })

  it('ripples when removing a main-track clip', () => {
    const { doc, v1 } = setup()
    const a = createClip({ trackId: v1, kind: 'video', startMs: 0, durationMs: 1000 })
    const b = createClip({ trackId: v1, kind: 'video', startMs: 1000, durationMs: 1000 })
    let next = applyCommand(doc, { op: 'addClips', clips: [a, b] })
    next = applyCommand(next, { op: 'removeClips', clipIds: [a.id] })

    expect(next.clips).toHaveLength(1)
    expect(next.clips[0].startMs).toBe(0)
  })

  it('summarizes the timeline for the agent', () => {
    const { doc, v1 } = setup()
    const clip = createClip({ trackId: v1, kind: 'video', startMs: 0, durationMs: 2000 })
    const next = applyCommand(doc, { op: 'addClip', clip })
    const summary = summarizeTimeline(next)

    expect(summary.durationMs).toBe(2000)
    expect(summary.clips[0]).toMatchObject({ id: clip.id, startMs: 0, durationMs: 2000 })
    expect(summary.tracks.find((track) => track.id === v1)?.clips).toBe(1)
  })
})
