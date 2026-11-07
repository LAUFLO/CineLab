import { describe, expect, it } from 'vitest'
import { NODE_META, TITLE_HEIGHT } from '../canvas-schema'

describe('node metadata', () => {
  it('keeps the agreed default node widths', () => {
    expect(NODE_META.image.width).toBe(360)
    expect(NODE_META.video.width).toBe(480)
    expect(NODE_META.text.width).toBe(348)
    expect(NODE_META.audio.width).toBe(348)
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
