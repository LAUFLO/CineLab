import { describe, expect, it } from 'vitest'
import { createClip, createTimeline } from '../timeline-schema'
import {
  HISTORY_LIMIT,
  createHistoryState,
  dispatchHistory,
  redoHistory,
  undoHistory
} from '../timeline-history'

function setup() {
  const doc = createTimeline({ id: 'tl1', name: '测试' })
  const v1 = doc.tracks[2].id
  return { doc, v1 }
}

describe('timeline history', () => {
  it('undoes and redoes a command', () => {
    const { doc, v1 } = setup()
    const clip = createClip({ trackId: v1, kind: 'video', durationMs: 1000 })

    let state = createHistoryState(doc)
    state = dispatchHistory(state, { op: 'addClip', clip })
    expect(state.doc.clips).toHaveLength(1)

    state = undoHistory(state)
    expect(state.doc.clips).toHaveLength(0)

    state = redoHistory(state)
    expect(state.doc.clips).toHaveLength(1)
  })

  it('treats a batch as one history step', () => {
    const { doc, v1 } = setup()
    const clip = createClip({ trackId: v1, kind: 'video', durationMs: 1000 })

    let state = createHistoryState(doc)
    state = dispatchHistory(state, {
      op: 'batch',
      commands: [
        { op: 'addClip', clip },
        { op: 'updateClip', clipId: clip.id, patch: { name: '镜头 1' } },
        { op: 'trimClip', clipId: clip.id, edge: 'end', deltaMs: 500 }
      ]
    })

    expect(state.doc.clips[0].durationMs).toBe(1500)
    state = undoHistory(state)
    expect(state.doc.clips).toHaveLength(0)
  })

  it('clears redo after a new edit', () => {
    const { doc, v1 } = setup()
    const a = createClip({ trackId: v1, kind: 'video', durationMs: 1000 })
    const b = createClip({ trackId: v1, kind: 'video', startMs: 1000, durationMs: 1000 })

    let state = createHistoryState(doc)
    state = dispatchHistory(state, { op: 'addClip', clip: a })
    state = undoHistory(state)
    expect(state.history.future).toHaveLength(1)

    state = dispatchHistory(state, { op: 'addClip', clip: b })
    expect(state.history.future).toHaveLength(0)
  })

  it('caps the history length', () => {
    const { doc, v1 } = setup()
    let state = createHistoryState(doc)
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) {
      const clip = createClip({ trackId: v1, kind: 'video', startMs: i * 1000, durationMs: 1000 })
      state = dispatchHistory(state, { op: 'addClip', clip })
    }
    expect(state.history.past.length).toBe(HISTORY_LIMIT)
  })
})
