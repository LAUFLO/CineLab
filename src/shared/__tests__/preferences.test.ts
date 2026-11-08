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
      project: {
        autoSaveDelay: 3000,
        confirmBeforeClose: false,
        defaultDir: 'D:/Projects'
      },
      canvas: {
        snapToGrid: true,
        minimapVisible: true,
        edgesVisible: false,
        reduceMotion: true,
        scrollMode: 'zoom',
        zoomOnDoubleClick: true,
        gridStyle: 'lines'
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
        autoRetry: 2,
        watermark: true,
        historyLimit: 0
      },
      updates: { checkOnStartup: false, channel: 'beta' },
      storage: { autoCleanCacheDays: 30 },
      ui: { scale: 125 },
      network: {
        proxyMode: 'manual',
        proxyUrl: 'http://127.0.0.1:7890',
        requestTimeout: 300000
      }
    })

    expect(preferences.startup.openRecentProject).toBe(false)
    expect(preferences.project.autoSaveDelay).toBe(3000)
    expect(preferences.project.confirmBeforeClose).toBe(false)
    expect(preferences.project.defaultDir).toBe('D:/Projects')
    expect(preferences.canvas).toEqual({
      snapToGrid: true,
      minimapVisible: true,
      edgesVisible: false,
      reduceMotion: true,
      scrollMode: 'zoom',
      zoomOnDoubleClick: true,
      gridStyle: 'lines'
    })
    expect(preferences.generation.defaultModels.image).toBe('provider/image')
    expect(preferences.generation.concurrency).toBe(4)
    expect(preferences.generation.notifyOnComplete).toBe(false)
    expect(preferences.generation.autoLink).toBe(false)
    expect(preferences.generation.autoRetry).toBe(2)
    expect(preferences.generation.watermark).toBe(true)
    expect(preferences.generation.historyLimit).toBe(0)
    expect(preferences.updates).toEqual({
      checkOnStartup: false,
      channel: 'beta'
    })
    expect(preferences.storage.autoCleanCacheDays).toBe(30)
    expect(preferences.ui.scale).toBe(125)
    expect(preferences.network).toEqual({
      proxyMode: 'manual',
      proxyUrl: 'http://127.0.0.1:7890',
      requestTimeout: 300000
    })
  })

  it('falls back for invalid values', () => {
    const preferences = normalizePreferences({
      project: { autoSaveDelay: 123 },
      canvas: {
        snapToGrid: 'yes',
        scrollMode: 'wheel',
        gridStyle: 'grid'
      },
      generation: {
        defaultModels: { image: 42, video: '   ' },
        concurrency: 9,
        autoRetry: 5,
        historyLimit: 55
      },
      updates: { channel: 'nightly' },
      storage: { autoCleanCacheDays: 7 },
      ui: { scale: 300 },
      network: {
        proxyMode: 'socks',
        requestTimeout: 1000
      }
    })

    expect(preferences.project.autoSaveDelay).toBe(
      DEFAULT_PREFERENCES.project.autoSaveDelay
    )
    expect(preferences.canvas.snapToGrid).toBe(false)
    expect(preferences.canvas.scrollMode).toBe(
      DEFAULT_PREFERENCES.canvas.scrollMode
    )
    expect(preferences.canvas.gridStyle).toBe(
      DEFAULT_PREFERENCES.canvas.gridStyle
    )
    expect(preferences.generation.defaultModels.image).toBeNull()
    expect(preferences.generation.defaultModels.video).toBeNull()
    expect(preferences.generation.concurrency).toBe(
      DEFAULT_PREFERENCES.generation.concurrency
    )
    expect(preferences.generation.autoRetry).toBe(
      DEFAULT_PREFERENCES.generation.autoRetry
    )
    expect(preferences.generation.historyLimit).toBe(
      DEFAULT_PREFERENCES.generation.historyLimit
    )
    expect(preferences.updates.channel).toBe(
      DEFAULT_PREFERENCES.updates.channel
    )
    expect(preferences.storage.autoCleanCacheDays).toBe(
      DEFAULT_PREFERENCES.storage.autoCleanCacheDays
    )
    expect(preferences.ui.scale).toBe(DEFAULT_PREFERENCES.ui.scale)
    expect(preferences.network.proxyMode).toBe(
      DEFAULT_PREFERENCES.network.proxyMode
    )
    expect(preferences.network.requestTimeout).toBe(
      DEFAULT_PREFERENCES.network.requestTimeout
    )
  })
})
