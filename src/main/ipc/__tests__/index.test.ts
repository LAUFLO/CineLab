import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  channels: [] as string[],
  registered: [] as string[]
}))

vi.mock('electron', () => ({
  app: {
    getVersion: () => '0.1.0',
    getPath: () => '/tmp'
  },
  BrowserWindow: { fromWebContents: () => null },
  ipcMain: {
    handle: (channel: string) => {
      state.channels.push(channel)
    },
    on: (channel: string) => {
      state.channels.push(channel)
    }
  },
  nativeTheme: { themeSource: '' },
  shell: { openPath: async () => undefined }
}))

vi.mock('../../logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logDirectory: () => '/tmp/logs'
}))

vi.mock('../../window', () => ({
  allowWindowClose: vi.fn()
}))

vi.mock('../project', () => ({
  registerProjectIpc: () => state.registered.push('project')
}))
vi.mock('../settings', () => ({
  registerSettingsIpc: () => state.registered.push('settings')
}))
vi.mock('../generate', () => ({
  registerGenerateIpc: () => state.registered.push('generate')
}))
vi.mock('../library', () => ({
  registerLibraryIpc: () => state.registered.push('library')
}))
vi.mock('../export', () => ({
  registerExportIpc: () => state.registered.push('export')
}))
vi.mock('../clipboard', () => ({
  registerClipboardIpc: () => state.registered.push('clipboard')
}))
vi.mock('../media', () => ({
  registerMediaIpc: () => state.registered.push('media')
}))
vi.mock('../timeline', () => ({
  registerTimelineIpc: () => state.registered.push('timeline')
}))
vi.mock('../agent', () => ({
  registerAgentIpc: () => state.registered.push('agent')
}))
vi.mock('../film-study', () => ({
  registerFilmStudyIpc: () => state.registered.push('film-study')
}))
vi.mock('../stage', () => ({
  registerStageIpc: () => state.registered.push('stage')
}))
vi.mock('../skills', () => ({
  registerSkillsIpc: () => state.registered.push('skills')
}))
vi.mock('../components', () => ({
  registerComponentsIpc: () => state.registered.push('components')
}))
vi.mock('../update', () => ({
  registerUpdateIpc: () => state.registered.push('update')
}))

import { registerIpc } from '../index'

describe('ipc registration', () => {
  it('registers every domain and the app/window channels once', () => {
    registerIpc()

    expect(new Set(state.registered).size).toBe(14)
    expect(state.channels).toEqual(
      expect.arrayContaining([
        'app:get-info',
        'app:set-theme',
        'app:set-zoom',
        'app:confirm-close',
        'app:open-logs',
        'app:log',
        'window:minimize',
        'window:maximize',
        'window:close'
      ])
    )
    expect(new Set(state.channels).size).toBe(state.channels.length)
  })
})
