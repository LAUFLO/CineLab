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
import type { OperationBindings } from '../shared/operation-schema'
import type { DepthTaskEvent } from '../shared/media'
import type { UpdateStatus } from '../shared/update'
import type { AssetRef } from '../shared/asset-schema'
import type { Preferences } from '../shared/preferences'
import type { TimelineDoc } from '../shared/timeline-schema'
import type { DirectorStageDoc } from '../shared/stage-schema'
import type { StageExportProgress } from '../shared/ipc-contract'
import type {
  FilmStudy,
  FilmStudyAutoRequest,
  FilmStudyExportResult,
  FilmStudyExtractRequest,
  FilmStudyProgress
} from '../shared/film-study'
import type {
  AddToLibraryInput,
  SaveAssetInput,
  TemplateInput
} from '../shared/library-schema'
import type {
  AudioPeaksRequest,
  CropImageRectRequest,
  CropImageRequest,
  CropVideoRequest,
  DepthCaptureRequest,
  ExtractFrameRequest,
  GridSplitRequest,
  RemoveSubtitlesRequest,
  SplitAvRequest,
  StitchRequest,
  TrimVideoRequest,
  VisionTaskEvent,
  VisionTaskRequest
} from '../shared/media'
const api: CineApi = {
  app: {
    getInfo: () => ipcRenderer.invoke('app:get-info'),
    setTheme: (theme: ThemeMode) => ipcRenderer.invoke('app:set-theme', theme),
    setZoom: (factor: number) => ipcRenderer.invoke('app:set-zoom', factor),
    onCloseRequested: (callback: () => void) => {
      const listener = (): void => callback()
      ipcRenderer.on('app:close-requested', listener)
      return () => ipcRenderer.removeListener('app:close-requested', listener)
    },
    confirmClose: () => ipcRenderer.send('app:confirm-close'),
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
    getOperationBindings: () =>
      ipcRenderer.invoke('settings:operation-bindings'),
    saveOperationBindings: (bindings: OperationBindings) =>
      ipcRenderer.invoke('settings:save-operation-bindings', bindings),
    getPreferences: () => ipcRenderer.invoke('settings:get-preferences'),
    savePreferences: (input: Preferences) =>
      ipcRenderer.invoke('settings:save-preferences', input),
    resetPreferences: () => ipcRenderer.invoke('settings:reset-preferences'),
    exportPreferences: () => ipcRenderer.invoke('settings:export-preferences'),
    importPreferences: () => ipcRenderer.invoke('settings:import-preferences'),
    chooseProjectDir: () => ipcRenderer.invoke('settings:choose-project-dir'),
    openDataDir: () => ipcRenderer.invoke('settings:open-data-dir'),
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
      ipcRenderer.invoke('library:save-assets', inputs, folder),
    listTemplates: () => ipcRenderer.invoke('library:list-templates'),
    saveTemplate: (input: TemplateInput) =>
      ipcRenderer.invoke('library:save-template', input),
    deleteTemplate: (id: string) =>
      ipcRenderer.invoke('library:delete-template', id),
    thumbCacheInfo: () => ipcRenderer.invoke('library:thumb-cache-info'),
    clearThumbCache: () => ipcRenderer.invoke('library:clear-thumb-cache')
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
    exists: (path: string, scope?: 'project' | 'global') =>
      ipcRenderer.invoke('media:exists', path, scope),
    existsMany: (entries: { path: string; scope: 'project' | 'global' }[]) =>
      ipcRenderer.invoke('media:exists-many', entries),
    thumbnail: (path: string, atSeconds?: number, kind?: 'video' | 'audio') =>
      ipcRenderer.invoke('media:thumbnail', path, atSeconds, kind),
    proxy: (path: string) => ipcRenderer.invoke('media:proxy', path),
    audioPeaks: (input: AudioPeaksRequest) =>
      ipcRenderer.invoke('media:audio-peaks', input),
    listSounds: () => ipcRenderer.invoke('media:list-sounds'),
    importSound: (id: string) => ipcRenderer.invoke('media:import-sound', id),
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
    },
    startVisionTask: (input: VisionTaskRequest) =>
      ipcRenderer.invoke('media:vision-start', input),
    cancelVisionTask: (taskId: string) =>
      ipcRenderer.invoke('media:vision-cancel', taskId),
    onVisionTaskEvent: (callback: (event: VisionTaskEvent) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: VisionTaskEvent
      ): void => callback(payload)

      ipcRenderer.on('vision-task:event', listener)
      return () => {
        ipcRenderer.removeListener('vision-task:event', listener)
      }
    }
  },
  timeline: {
    load: (timelineId: string) => ipcRenderer.invoke('timeline:load', timelineId),
    save: (timelineId: string, doc: TimelineDoc) =>
      ipcRenderer.invoke('timeline:save', timelineId, doc),
    duplicate: (timelineId: string) =>
      ipcRenderer.invoke('timeline:duplicate', timelineId),
    exportVtt: (doc: TimelineDoc) =>
      ipcRenderer.invoke('timeline:export-vtt', doc),
    export: (doc: TimelineDoc, settings?: import('../shared/ipc-contract').TimelineExportSettings) =>
      ipcRenderer.invoke('timeline:export', doc, settings),
    cancelExport: () => ipcRenderer.invoke('timeline:export-cancel'),
    onExportProgress: (callback) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        progress: import('../shared/ipc-contract').TimelineExportProgress
      ): void => callback(progress)
      ipcRenderer.on('timeline:export-progress', listener)
      return () => {
        ipcRenderer.removeListener('timeline:export-progress', listener)
      }
    },
    transcribe: (input) => ipcRenderer.invoke('timeline:transcribe', input),
    cancelTranscribe: () => ipcRenderer.invoke('timeline:transcribe-cancel'),
    onTranscribeProgress: (callback) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        progress: import('../shared/ipc-contract').TimelineTranscribeProgress
      ): void => callback(progress)
      ipcRenderer.on('timeline:transcribe-progress', listener)
      return () => {
        ipcRenderer.removeListener('timeline:transcribe-progress', listener)
      }
    },
    analyze: (input) => ipcRenderer.invoke('timeline:analyze', input),
    importSubtitles: (path?: string) =>
      ipcRenderer.invoke('timeline:import-subtitles', path)
  },
  filmStudy: {
    extract: (input: FilmStudyExtractRequest) =>
      ipcRenderer.invoke('film-study:extract', input),
    auto: (input: FilmStudyAutoRequest) =>
      ipcRenderer.invoke('film-study:auto', input),
    cancel: (nodeId: string) =>
      ipcRenderer.invoke('film-study:cancel', nodeId),
    load: (studyId: string) =>
      ipcRenderer.invoke('film-study:load', studyId),
    save: (study: FilmStudy) =>
      ipcRenderer.invoke('film-study:save', study),
    exportMarkdown: (studyId: string) =>
      ipcRenderer.invoke('film-study:export-markdown', studyId),
    exportAnalysisPackage: (studyId: string) =>
      ipcRenderer.invoke('film-study:export-analysis-package', studyId),
    exportBundle: (studyId: string) =>
      ipcRenderer.invoke('film-study:export-bundle', studyId),
    importAnalysis: (studyId: string) =>
      ipcRenderer.invoke('film-study:import-analysis', studyId),
    extractSubtitles: (studyId: string) =>
      ipcRenderer.invoke('film-study:extract-subtitles', studyId),
    importSubtitles: (studyId: string) =>
      ipcRenderer.invoke('film-study:import-subtitles', studyId),
    analyze: (studyId: string, modelKey: string) =>
      ipcRenderer.invoke('film-study:analyze', studyId, modelKey),
    contactSheet: (studyId: string) =>
      ipcRenderer.invoke('film-study:contact-sheet', studyId),
    onProgress: (callback: (progress: FilmStudyProgress) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: FilmStudyProgress
      ): void => callback(payload)

      ipcRenderer.on('film-study:progress', listener)
      return () => {
        ipcRenderer.removeListener('film-study:progress', listener)
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
      options?: {
        resolution?: '720p' | '1080p'
        quality?: 'standard' | 'high'
        subtitlePath?: string
        bgmPath?: string
        narrationPath?: string
        originalVolume?: number
        bgmVolume?: number
        narrationVolume?: number
      }
    ) => ipcRenderer.invoke('export:concat-videos', paths, options),
    pickFile: (kind: 'subtitle' | 'audio') =>
      ipcRenderer.invoke('export:pick-file', kind)
  },
  clipboard: {
    read: () => ipcRenderer.invoke('clipboard:read')
  },
  agent: {
    chat: (input) => ipcRenderer.invoke('agent:chat', input),
    cancel: (turnId) => ipcRenderer.invoke('agent:cancel', turnId),
    toolResult: (input) => ipcRenderer.invoke('agent:tool-result', input),
    confirm: (input) => ipcRenderer.invoke('agent:confirm', input),
    sessionLoad: (sessionId) =>
      ipcRenderer.invoke('agent:session-load', sessionId),
    sessionList: () => ipcRenderer.invoke('agent:session-list'),
    sessionCreate: (title) =>
      ipcRenderer.invoke('agent:session-create', title),
    sessionRename: (sessionId, title) =>
      ipcRenderer.invoke('agent:session-rename', sessionId, title),
    sessionDelete: (sessionId) =>
      ipcRenderer.invoke('agent:session-delete', sessionId),
    sessionCompact: (sessionId, modelKey) =>
      ipcRenderer.invoke('agent:session-compact', sessionId, modelKey),
    modelInfo: (modelKey) =>
      ipcRenderer.invoke('agent:model-info', modelKey),
    textModels: () => ipcRenderer.invoke('agent:text-models'),
    models: () => ipcRenderer.invoke('agent:models'),
    proposalCreate: (input) => ipcRenderer.invoke('agent:proposal-create', input),
    proposalActive: (sessionId) =>
      ipcRenderer.invoke('agent:proposal-active', sessionId),
    proposalSubmit: (proposalId) =>
      ipcRenderer.invoke('agent:proposal-submit', proposalId),
    proposalCancel: (proposalId) =>
      ipcRenderer.invoke('agent:proposal-cancel', proposalId),
    onEvent: (callback) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: import('../shared/agent').AgentEvent
      ): void => callback(payload)
      ipcRenderer.on('agent:event', listener)
      return () => {
        ipcRenderer.removeListener('agent:event', listener)
      }
    },
    onToolCall: (callback) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: import('../shared/agent').AgentToolCallRequest
      ): void => callback(payload)
      ipcRenderer.on('agent:tool-call', listener)
      return () => {
        ipcRenderer.removeListener('agent:tool-call', listener)
      }
    }
  },
  skills: {
    list: () => ipcRenderer.invoke('skills:list'),
    files: (scope, name) => ipcRenderer.invoke('skills:files', scope, name),
    readFile: (scope, name, path) =>
      ipcRenderer.invoke('skills:read-file', scope, name, path),
    create: (input) => ipcRenderer.invoke('skills:create', input),
    save: (input) => ipcRenderer.invoke('skills:save', input),
    remove: (scope, name) => ipcRenderer.invoke('skills:remove', scope, name),
    uploadFiles: (scope, name, folder) =>
      ipcRenderer.invoke('skills:upload-files', scope, name, folder),
    removeFile: (scope, name, path) =>
      ipcRenderer.invoke('skills:remove-file', scope, name, path),
    clone: (input) => ipcRenderer.invoke('skills:clone', input),
    setOverride: (input) =>
      ipcRenderer.invoke('skills:set-override', input),
    openDirectory: (scope, name) =>
      ipcRenderer.invoke('skills:open-directory', scope, name),
    openFile: (scope, name, path) =>
      ipcRenderer.invoke('skills:open-file', scope, name, path)
  },
  stage: {
    create: (name?: string) => ipcRenderer.invoke('stage:create', name),
    load: (stageId: string) => ipcRenderer.invoke('stage:load', stageId),
    save: (doc: DirectorStageDoc) => ipcRenderer.invoke('stage:save', doc),
    delete: (stageId: string) => ipcRenderer.invoke('stage:delete', stageId),
    duplicate: (stageId: string) =>
      ipcRenderer.invoke('stage:duplicate', stageId),
    capture: (input: { stageId: string; dataUrl: string }) =>
      ipcRenderer.invoke('stage:capture', input),
    exportPreview: (input: import('../shared/ipc-contract').StageExportInput) =>
      ipcRenderer.invoke('stage:export-preview', input),
    onExportProgress: (callback) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: StageExportProgress
      ): void => callback(payload)
      ipcRenderer.on('stage:export-progress', listener)
      return () => {
        ipcRenderer.removeListener('stage:export-progress', listener)
      }
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
