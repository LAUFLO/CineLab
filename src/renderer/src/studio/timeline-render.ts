import type { TimelineDoc } from '@shared/timeline-schema'
import { createPools, renderTimeline, waitForMedia } from './renderer'

declare global {
  interface Window {
    __setTimeline?: (doc: TimelineDoc) => void
    __renderFrame?: (timeMs: number) => Promise<string>
  }
}

const canvas = document.createElement('canvas')
document.body.appendChild(canvas)
const pools = createPools()
let doc: TimelineDoc | null = null
let ctx: CanvasRenderingContext2D | null = null

window.__setTimeline = (value: TimelineDoc): void => {
  doc = value
  canvas.width = value.video.width
  canvas.height = value.video.height
  ctx = canvas.getContext('2d')
}

window.__renderFrame = async (timeMs: number): Promise<string> => {
  if (!doc || !ctx) throw new Error('timeline not ready')
  renderTimeline({ ctx, doc, timeMs, pools })
  await waitForMedia(doc, timeMs, pools)
  renderTimeline({ ctx, doc, timeMs, pools })
  return canvas.toDataURL('image/jpeg', 0.92)
}
