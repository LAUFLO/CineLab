import { beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = (event: unknown, ...args: unknown[]) => unknown

const state = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  installed: false,
  visionActive: false,
  transcriptionActive: false,
  installComponent: vi.fn(async () => undefined)
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: Handler) => {
      state.handlers.set(channel, handler)
    }
  }
}))

vi.mock('../../components/manifest', () => ({
  COMPONENTS: {
    'depth-runtime': { kind: 'depth-runtime' },
    'depth-model': { kind: 'depth-model' },
    'vision-models': { kind: 'vision-models' },
    'stem-model': { kind: 'stem-model' },
    'whisper-runtime': { kind: 'whisper-runtime' },
    'whisper-model': { kind: 'whisper-model' }
  }
}))

vi.mock('../../components/service', () => ({
  checkComponentUpdates: vi.fn(async () => []),
  installComponent: state.installComponent,
  isComponentInstalled: async () => state.installed,
  listComponentStatus: vi.fn(async () => []),
  pauseComponent: vi.fn(),
  removeComponent: vi.fn()
}))

vi.mock('../../media/vision-tasks', () => ({
  listVisionTasks: () =>
    state.visionActive ? [{ status: 'running' }] : []
}))
vi.mock('../../media/depth-tasks', () => ({
  listDepthTasks: () => []
}))
vi.mock('../../media/stem-tasks', () => ({
  hasActiveStemTasks: () => false
}))
vi.mock('../../timeline/transcribe', () => ({
  hasActiveTranscriptions: () => state.transcriptionActive
}))

import { registerComponentsIpc } from '../components'

registerComponentsIpc()

function install(kind: string): Promise<unknown> {
  const handler = state.handlers.get('components:install')
  if (!handler) throw new Error('components:install 未注册')
  return Promise.resolve(handler({}, kind))
}

beforeEach(() => {
  state.installed = false
  state.visionActive = false
  state.transcriptionActive = false
  state.installComponent.mockClear()
})

describe('components install guard', () => {
  it('allows a first install while a task is running', async () => {
    state.installed = false
    state.visionActive = true
    await expect(install('vision-models')).resolves.toEqual({ started: true })
    expect(state.installComponent).toHaveBeenCalledWith('vision-models')
  })

  it('blocks updating a component in use', async () => {
    state.installed = true
    state.visionActive = true
    await expect(install('vision-models')).rejects.toThrow('组件正在使用中')
    expect(state.installComponent).not.toHaveBeenCalled()
  })

  it('blocks whisper updates while transcription is running', async () => {
    state.installed = true
    state.transcriptionActive = true
    await expect(install('whisper-model')).rejects.toThrow('组件正在使用中')
    await expect(install('whisper-runtime')).rejects.toThrow('组件正在使用中')
  })

  it('allows updating an idle component', async () => {
    state.installed = true
    await expect(install('vision-models')).resolves.toEqual({ started: true })
    expect(state.installComponent).toHaveBeenCalledWith('vision-models')
  })
})
