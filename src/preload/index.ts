import { contextBridge, ipcRenderer } from 'electron'
import type { CineApi, ThemeMode } from '../shared/ipc-contract'
import type { CanvasData } from '../shared/project-schema'
import type {
  ConnectionTestInput,
  ProviderInput
} from '../shared/provider-schema'
import type { GenerateRequest, GenerationEvent } from '../shared/generation'
import type { AssetRef } from '../shared/asset-schema'
import type {
  AddToLibraryInput,
  SaveAssetInput,
  TemplateInput
} from '../shared/library-schema'

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
    reveal: (path: string) => ipcRenderer.invoke('project:reveal', path),
    rename: (path: string, name: string) =>
      ipcRenderer.invoke('project:rename', path, name),
    createCanvas: (path: string, name?: string) =>
      ipcRenderer.invoke('project:create-canvas', path, name),
    switchCanvas: (path: string, canvasId: string) =>
      ipcRenderer.invoke('project:switch-canvas', path, canvasId),
    renameCanvas: (path: string, canvasId: string, name: string) =>
      ipcRenderer.invoke('project:rename-canvas', path, canvasId, name),
    deleteCanvas: (path: string, canvasId: string) =>
      ipcRenderer.invoke('project:delete-canvas', path, canvasId),
    delete: () => ipcRenderer.invoke('project:delete')
  },
  settings: {
    listProviders: () => ipcRenderer.invoke('settings:list-providers'),
    saveProvider: (input: ProviderInput) =>
      ipcRenderer.invoke('settings:save-provider', input),
    deleteProvider: (id: string) =>
      ipcRenderer.invoke('settings:delete-provider', id),
    testConnection: (input: ConnectionTestInput) =>
      ipcRenderer.invoke('settings:test-connection', input),
    modelsConfig: () => ipcRenderer.invoke('settings:models-config'),
    openModelsFile: () => ipcRenderer.invoke('settings:open-models-file')
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
  },
  library: {
    root: () => ipcRenderer.invoke('library:root'),
    chooseRoot: () => ipcRenderer.invoke('library:choose-root'),
    resetRoot: () => ipcRenderer.invoke('library:reset-root'),
    revealRoot: () => ipcRenderer.invoke('library:reveal-root'),

    tree: () => ipcRenderer.invoke('library:tree'),
    listAssets: (folder: string) =>
      ipcRenderer.invoke('library:list-assets', folder),
    listAllAssets: () => ipcRenderer.invoke('library:list-all-assets'),
    createFolder: (parent: string, name: string) =>
      ipcRenderer.invoke('library:create-folder', parent, name),
    renameFolder: (path: string, name: string) =>
      ipcRenderer.invoke('library:rename-folder', path, name),
    deleteFolder: (path: string) =>
      ipcRenderer.invoke('library:delete-folder', path),

    importAssets: (folder: string) =>
      ipcRenderer.invoke('library:import-assets', folder),
    addAsset: (input: AddToLibraryInput) =>
      ipcRenderer.invoke('library:add-asset', input),
    renameAsset: (path: string, name: string) =>
      ipcRenderer.invoke('library:rename-asset', path, name),
    deleteAsset: (path: string) =>
      ipcRenderer.invoke('library:delete-asset', path),
    reveal: (path: string) => ipcRenderer.invoke('library:reveal', path),

    listCharacters: () => ipcRenderer.invoke('library:list-characters'),
    saveAssets: (inputs: SaveAssetInput[], folder?: string) =>
      ipcRenderer.invoke('library:save-assets', inputs, folder),    listTemplates: () => ipcRenderer.invoke('library:list-templates'),
    saveTemplate: (input: TemplateInput) =>
      ipcRenderer.invoke('library:save-template', input),
    deleteTemplate: (id: string) =>
      ipcRenderer.invoke('library:delete-template', id)
  },
  export: {
    project: (projectName: string) =>
      ipcRenderer.invoke('export:project', projectName),
    canvasPng: (projectName: string, canvasName: string) =>
      ipcRenderer.invoke('export:canvas-png', projectName, canvasName),
    asset: (relPath: string, fileName: string, scope?: 'project' | 'global') =>
      ipcRenderer.invoke('export:asset', relPath, fileName, scope),
    assets: (inputs: AssetRef[], fileName: string) =>
      ipcRenderer.invoke('export:assets', inputs, fileName)  },
  clipboard: {
    read: () => ipcRenderer.invoke('clipboard:read')
  }
}

contextBridge.exposeInMainWorld('api', api)
