import { contextBridge, ipcRenderer } from 'electron'
import type { CineApi, ThemeMode } from '../shared/ipc-contract'
import type { CanvasData } from '../shared/project-schema'
import type { ProjectTemplateId } from '../shared/project-templates'
import type {
  ConnectionTestInput,
  ProviderInput
} from '../shared/provider-schema'
import type { GenerateRequest, GenerationEvent } from '../shared/generation'
import type { ComponentEvent, ComponentKind } from '../shared/components'
import type { DepthTaskEvent } from '../shared/media'
import type { UpdateStatus } from '../shared/update'
import type { AssetRef } from '../shared/asset-schema'
import type {
  AddToLibraryInput,
  SaveAssetInput,
  TemplateInput
} from '../shared/library-schema'
import type {
  CropImageRectRequest,
  CropImageRequest,
  CropVideoRequest,
  DepthCaptureRequest,
  ExtractFrameRequest,
  GridSplitRequest,
  RemoveSubtitlesRequest,
  SplitAvRequest,
  StitchRequest,
  TrimVideoRequest
} from '../shared/media'
const api: CineApi = {
  app: {
    getInfo: () => ipcRenderer.invoke('app:get-info'),
    setTheme: (theme: ThemeMode) => ipcRenderer.invoke('app:set-theme', theme),
    openLogs: () => ipcRenderer.invoke('app:open-logs'),
    log: (level: 'info' | 'warn' | 'error', message: string) =>
      ipcRenderer.invoke('app:log', level, message),
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close')
  },
  project: {
    bootstrap: () => ipcRenderer.invoke('project:bootstrap'),
    create: (name: string, parentDir?: string, templateId?: ProjectTemplateId) =>
      ipcRenderer.invoke('project:create', name, parentDir, templateId),
    open: (path: string) => ipcRenderer.invoke('project:open', path),
    saveCanvas: (path: string, canvas: CanvasData) =>
      ipcRenderer.invoke('project:save-canvas', path, canvas),
    recent: () => ipcRenderer.invoke('project:recent'),
    readCover: (path: string) => ipcRenderer.invoke('project:cover-read', path),
    setCoverFromLocal: (path: string) =>
      ipcRenderer.invoke('project:cover-set-local', path),
    setCoverFromAsset: (path: string, assetPath: string) =>
      ipcRenderer.invoke('project:cover-set-asset', path, assetPath),
    removeCover: (path: string) => ipcRenderer.invoke('project:cover-remove', path),
    pickCreate: (templateId?: ProjectTemplateId) =>
      ipcRenderer.invoke('project:pick-create', templateId),
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
    fetchModels: (input: ConnectionTestInput) =>
      ipcRenderer.invoke('settings:fetch-models', input),
    modelsConfig: () => ipcRenderer.invoke('settings:models-config'),
    openModelsFile: () => ipcRenderer.invoke('settings:open-models-file'),
    onModelsChanged: (callback: () => void) => {
      const listener = (): void => callback()
      ipcRenderer.on('settings:models-changed', listener)
      return () => ipcRenderer.removeListener('settings:models-changed', listener)
    }
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
    moveAsset: (path: string, folder: string) =>
      ipcRenderer.invoke('library:move-asset', path, folder),
    deleteAsset: (path: string) =>
      ipcRenderer.invoke('library:delete-asset', path),
    setAssetTags: (path: string, tags: string[]) =>
      ipcRenderer.invoke('library:set-asset-tags', path, tags),
    reveal: (path: string) => ipcRenderer.invoke('library:reveal', path),

    listCharacters: () => ipcRenderer.invoke('library:list-characters'),
    saveAssets: (inputs: SaveAssetInput[], folder?: string) =>
      ipcRenderer.invoke('library:save-assets', inputs, folder),    listTemplates: () => ipcRenderer.invoke('library:list-templates'),
    saveTemplate: (input: TemplateInput) =>
      ipcRenderer.invoke('library:save-template', input),
    deleteTemplate: (id: string) =>
      ipcRenderer.invoke('library:delete-template', id)
  },
  components: {
    status: () => ipcRenderer.invoke('components:status'),
    install: (kind: ComponentKind) =>
      ipcRenderer.invoke('components:install', kind),
    pause: (kind: ComponentKind) =>
      ipcRenderer.invoke('components:pause', kind),
    remove: (kind: ComponentKind) =>
      ipcRenderer.invoke('components:remove', kind),
    onEvent: (callback: (event: ComponentEvent) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: ComponentEvent
      ): void => callback(payload)

      ipcRenderer.on('components:event', listener)
      return () => {
        ipcRenderer.removeListener('components:event', listener)
      }
    }
  },
  update: {
    getState: () => ipcRenderer.invoke('update:get-state'),
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    onEvent: (callback: (status: UpdateStatus) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: UpdateStatus
      ): void => callback(payload)

      ipcRenderer.on('update:event', listener)
      return () => {
        ipcRenderer.removeListener('update:event', listener)
      }
    }
  },
  media: {
    splitGrid: (input: GridSplitRequest) =>
      ipcRenderer.invoke('media:split-grid', input),
    stitch: (input: StitchRequest) =>
      ipcRenderer.invoke('media:stitch', input),
    extractFrame: (input: ExtractFrameRequest) =>
      ipcRenderer.invoke('media:extract-frame', input),
    probe: (path: string) => ipcRenderer.invoke('media:probe', path),
    splitAv: (input: SplitAvRequest) => ipcRenderer.invoke('media:split-av', input),
    cropVideo: (input: CropVideoRequest) => ipcRenderer.invoke('media:crop-video', input),
    cropImage: (input: CropImageRequest) =>
      ipcRenderer.invoke('media:crop-image', input),
    trimVideo: (input: TrimVideoRequest) =>
      ipcRenderer.invoke('media:trim-video', input),
    cropImageRect: (input: CropImageRectRequest) =>
      ipcRenderer.invoke('media:crop-image-rect', input),
    removeSubtitles: (input: RemoveSubtitlesRequest) =>
      ipcRenderer.invoke('media:remove-subtitles', input),
    captureDepth: (input: DepthCaptureRequest) =>
      ipcRenderer.invoke('media:capture-depth', input),
    startDepthCapture: (input: DepthCaptureRequest) =>
      ipcRenderer.invoke('media:depth-capture-start', input),
    cancelDepthCapture: (taskId: string) =>
      ipcRenderer.invoke('media:depth-capture-cancel', taskId),
    onDepthCaptureEvent: (callback: (event: DepthTaskEvent) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: DepthTaskEvent
      ): void => callback(payload)

      ipcRenderer.on('depth-task:event', listener)
      return () => {
        ipcRenderer.removeListener('depth-task:event', listener)
      }
    }
  },
  export: {
    project: (projectName: string) =>
      ipcRenderer.invoke('export:project', projectName),
    canvasPng: (projectName: string, canvasName: string) =>
      ipcRenderer.invoke('export:canvas-png', projectName, canvasName),
    asset: (relPath: string, fileName: string, scope?: 'project' | 'global') =>
      ipcRenderer.invoke('export:asset', relPath, fileName, scope),
    assets: (inputs: AssetRef[], fileName: string) =>
      ipcRenderer.invoke('export:assets', inputs, fileName),
    concatVideos: (
      paths: string[],
      options?: { resolution?: '720p' | '1080p'; quality?: 'standard' | 'high' }
    ) => ipcRenderer.invoke('export:concat-videos', paths, options)
  },
  clipboard: {
    read: () => ipcRenderer.invoke('clipboard:read')
  }
}

contextBridge.exposeInMainWorld('api', api)
