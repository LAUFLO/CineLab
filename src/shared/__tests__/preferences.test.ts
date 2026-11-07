import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFERENCES, normalizePreferences } from '../preferences'

describe('normalizePreferences', () => {
  it('returns defaults for empty input', () => {
    expect(normalizePreferences(undefined)).toEqual(DEFAULT_PREFERENCES)
    expect(normalizePreferences({})).toEqual(DEFAULT_PREFERENCES)
  })

  it('keeps valid values', () => {
    const preferences = normalizePreferences({
      startup: { openRecentProject: false },
      project: { autoSaveDelay: 3000 },
      canvas: {
        snapToGrid: true,
        minimapVisible: true,
        reduceMotion: true
      },
      generation: {
        defaultModels: {
          image: 'provider/image',
          video: null,
          text: 'provider/text',
          audio: null
        },
        concurrency: 4,
        notifyOnComplete: false,
        autoLink: false,
        historyLimit: 0
      }
    })

    expect(preferences.startup.openRecentProject).toBe(false)
    expect(preferences.project.autoSaveDelay).toBe(3000)
    expect(preferences.canvas).toEqual({
      snapToGrid: true,
      minimapVisible: true,
      reduceMotion: true
    })
    expect(preferences.generation.defaultModels.image).toBe('provider/image')
    expect(preferences.generation.concurrency).toBe(4)
    expect(preferences.generation.notifyOnComplete).toBe(false)
    expect(preferences.generation.autoLink).toBe(false)
    expect(preferences.generation.historyLimit).toBe(0)
  })

  it('falls back for invalid values', () => {
    const preferences = normalizePreferences({
      project: { autoSaveDelay: 123 },
      canvas: { snapToGrid: 'yes' },
      generation: {
        defaultModels: { image: 42, video: '   ' },
        concurrency: 9,
        historyLimit: 55
      }
    })

    expect(preferences.project.autoSaveDelay).toBe(
      DEFAULT_PREFERENCES.project.autoSaveDelay
    )
    expect(preferences.canvas.snapToGrid).toBe(false)
    expect(preferences.generation.defaultModels.image).toBeNull()
    expect(preferences.generation.defaultModels.video).toBeNull()
    expect(preferences.generation.concurrency).toBe(
      DEFAULT_PREFERENCES.generation.concurrency
    )
    expect(preferences.generation.historyLimit).toBe(
      DEFAULT_PREFERENCES.generation.historyLimit
    )
  })
})
