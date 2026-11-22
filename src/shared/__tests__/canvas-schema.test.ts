import { describe, expect, it } from 'vitest'
import {
  GROUP_COLORS,
  MEDIA_FRAME_COMPACT,
  MEDIA_FRAME_STANDARD,
  NODE_META,
  TITLE_HEIGHT,
  mediaFrameNodeSize
} from '../canvas-schema'
import { groupColorSchema } from '../project-schema'

describe('node metadata', () => {
  it('keeps the agreed default node sizes', () => {
    expect(NODE_META.image.width).toBe(400)
    expect(NODE_META.video.width).toBe(400)
    expect(NODE_META.text.width).toBe(348)
    expect(NODE_META.audio.width).toBe(200)
    expect(NODE_META.audio.height).toBe(127)
  })

  it('fits media into standard and compact frames, including 21:9', () => {
    expect(mediaFrameNodeSize(1920, 1080, MEDIA_FRAME_STANDARD)).toEqual({
      width: 400,
      height: 253
    })
    expect(mediaFrameNodeSize(21, 9, MEDIA_FRAME_STANDARD)).toEqual({
      width: 400,
      height: 199
    })
    expect(mediaFrameNodeSize(1080, 1920, MEDIA_FRAME_STANDARD)).toEqual({
      width: 127,
      height: 253
    })
    expect(mediaFrameNodeSize(1024, 1024, MEDIA_FRAME_STANDARD)).toEqual({
      width: 225,
      height: 253
    })
    expect(mediaFrameNodeSize(21, 9, MEDIA_FRAME_COMPACT)).toEqual({
      width: 240,
      height: 131
    })
  })

  it('keeps the title height used by layout calculations', () => {
    expect(TITLE_HEIGHT).toBe(28)
  })

  it('provides templates for every node kind', () => {
    for (const kind of ['text', 'image', 'video', 'audio'] as const) {
      expect(NODE_META[kind].templates.length).toBeGreaterThan(0)
    }
  })
})

describe('group color schema', () => {
  it('accepts every visible and legacy group color', () => {
    for (const color of GROUP_COLORS) {
      expect(groupColorSchema.safeParse(color).success).toBe(true)
    }
    for (const legacy of ['green', 'lime'] as const) {
      expect(groupColorSchema.safeParse(legacy).success).toBe(true)
    }
    expect(groupColorSchema.safeParse('other').success).toBe(false)
  })
})
