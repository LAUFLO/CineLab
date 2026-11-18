import { useEffect } from 'react'
import { docDurationMs } from '@shared/timeline-layout'
import { useTimelineStore } from '../stores/timeline'
import { TimelineCanvas } from './TimelineCanvas'
import { useTimelineAudio } from './useTimelineAudio'

export function PreviewStage() {
  const doc = useTimelineStore((state) => state.doc)
  const playheadMs = useTimelineStore((state) => state.playheadMs)
  const playing = useTimelineStore((state) => state.playing)

  useEffect(() => {
    if (!playing || !doc) return
    let last = performance.now()
    let frame = 0
    const total = Math.max(docDurationMs(doc), 1)

    const tick = (now: number): void => {
      const delta = now - last
      last = now
      const state = useTimelineStore.getState()
      const next = Math.min(total, state.playheadMs + delta)
      state.setPlayhead(next)
      if (next >= total) {
        state.pause()
        return
      }
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, doc])

  useTimelineAudio(doc, playing, () => useTimelineStore.getState().playheadMs)

  if (!doc) return null

  return (
    <TimelineCanvas
      doc={doc}
      timeMs={playheadMs}
      playing={playing}
      className="block max-h-full max-w-full"
    />
  )
}
