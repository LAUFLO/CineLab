import { contextBridge, ipcRenderer } from 'electron'
import type { CineApi, ThemeMode } from '../shared/ipc-contract'
import type { CanvasData } from '../shared/project-schema'
import type {
  ConnectionTestInput,
  ProviderInput
} from '../shared/provider-schema'
import type { GenerateRequest, GenerationEvent } from '../shared/generation'

const api: CineApi = {
  app: {
    getInfo: () => ipcRenderer.invoke('app:get-info'),
    setTheme: (theme: ThemeMode) => ipcRenderer.invoke('app:set-theme', theme),
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close')
  },
  project: {
    bootstrap: () => ipcRenderer.invoke('project:bootstrap'),
    create: (name: string, parentDir?: string) =>
      ipcRenderer.invoke('project:create', name, parentDir),
    open: (path: string) => ipcRenderer.invoke('project:open', path),
    saveCanvas: (path: string, canvas: CanvasData) =>
      ipcRenderer.invoke('project:save-canvas', path, canvas),
    recent: () => ipcRenderer.invoke('project:recent'),
    pickCreate: () => ipcRenderer.invoke('project:pick-create'),
    pickOpen: () => ipcRenderer.invoke('project:pick-open'),
    reveal: (path: string) => ipcRenderer.invoke('project:reveal', path)
  },
  settings: {
    listProviders: () => ipcRenderer.invoke('settings:list-providers'),
    saveProvider: (input: ProviderInput) =>
      ipcRenderer.invoke('settings:save-provider', input),
    deleteProvider: (id: string) =>
      ipcRenderer.invoke('settings:delete-provider', id),
    testConnection: (input: ConnectionTestInput) =>
      ipcRenderer.invoke('settings:test-connection', input)
  },
  generate: {
    run: (request: GenerateRequest) => ipcRenderer.invoke('generate:run', request),
    cancel: (runId: string) => ipcRenderer.invoke('generate:cancel', runId),
    cancelAll: () => ipcRenderer.invoke('generate:cancel-all'),
    onEvent: (callback: (event: GenerationEvent) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: GenerationEvent
      ): void => callback(payload)

      ipcRenderer.on('generation:event', listener)
      return () => {
        ipcRenderer.removeListener('generation:event', listener)
      }
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
