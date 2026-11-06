import type { AssetRef, AssetScope } from './asset-schema'
import type {
  CanvasData,
  ProjectMeta,
  ProjectSnapshot,
  RecentProject
} from './project-schema'
import type {
  ConnectionTestInput,
  ConnectionTestResult,
  FetchModelsResult,
  ProviderConfig,
  ProviderInput
} from './provider-schema'
import type {
  GenerateHandle,
  GenerateRequest,
  GeneratedAsset,
  GenerationEvent
} from './generation'
import type { ComponentEvent, ComponentKind, ComponentStatus } from './components'
import type {
  AddToLibraryInput,
  SaveAssetInput,
  CharacterCard,
  LibraryAsset,
  LibraryFolderNode,
  LibraryRootInfo,
  PromptTemplate,
  TemplateInput
} from './library-schema'
import type { ModelsConfigStatus } from './models-file'
import type {
  CropImageRectRequest,
  CropImageRequest,
  CropImageResult,
  CropVideoRequest,
  CropVideoResult,
  DepthCaptureRequest,
  DepthCaptureResult,
  DepthTaskEvent,
  DepthTaskStartResult,
  ExtractFrameRequest,
  ExtractFrameResult,
  GridSplitRequest,
  GridSplitResult,
  RemoveSubtitlesRequest,
  RemoveSubtitlesResult,
  MediaProbe,
  SplitAvRequest,
  SplitAvResult,
  StitchRequest,
  StitchResult,
  TrimVideoRequest,
  TrimVideoResult
} from './media'

export type ThemeMode = 'light' | 'dark' | 'system'

export interface AppInfo {
  version: string
  platform: string
  dataDir: string
}

export interface ProjectApi {
  bootstrap(): Promise<ProjectSnapshot | null>
  create(name: string, parentDir?: string): Promise<ProjectSnapshot>
  open(path: string): Promise<ProjectSnapshot>
  saveCanvas(path: string, canvas: CanvasData): Promise<void>
  recent(): Promise<RecentProject[]>
  pickCreate(): Promise<ProjectSnapshot | null>
  pickOpen(): Promise<ProjectSnapshot | null>
  reveal(path: string): Promise<void>
  rename(path: string, name: string): Promise<ProjectMeta>
  createCanvas(path: string, name?: string): Promise<ProjectSnapshot>
  switchCanvas(path: string, canvasId: string): Promise<ProjectSnapshot>
  renameCanvas(path: string, canvasId: string, name: string): Promise<ProjectMeta>
  deleteCanvas(path: string, canvasId: string): Promise<ProjectSnapshot>
  delete(): Promise<boolean>
}

export interface SettingsApi {
  listProviders(): Promise<ProviderConfig[]>
  saveProvider(input: ProviderInput): Promise<ProviderConfig>
  deleteProvider(id: string): Promise<void>
  testConnection(input: ConnectionTestInput): Promise<ConnectionTestResult>
  fetchModels(input: ConnectionTestInput): Promise<FetchModelsResult>
  modelsConfig(): Promise<ModelsConfigStatus>
  openModelsFile(): Promise<string>
}

export interface GenerateApi {
  run(request: GenerateRequest): Promise<GenerateHandle>
  cancel(runId: string): Promise<void>
  cancelAll(): Promise<void>
  onEvent(callback: (event: GenerationEvent) => void): () => void
}

export interface LibraryApi {
  root(): Promise<LibraryRootInfo>
  chooseRoot(): Promise<LibraryRootInfo | null>
  resetRoot(): Promise<LibraryRootInfo>
  revealRoot(): Promise<void>

  tree(): Promise<LibraryFolderNode[]>
  listAssets(folder: string): Promise<LibraryAsset[]>
  listAllAssets(): Promise<LibraryAsset[]>
  createFolder(parent: string, name: string): Promise<LibraryFolderNode>
  renameFolder(path: string, name: string): Promise<string>
  deleteFolder(path: string): Promise<void>

  importAssets(folder: string): Promise<LibraryAsset[]>
  addAsset(input: AddToLibraryInput): Promise<LibraryAsset>
  renameAsset(path: string, name: string): Promise<string>
  moveAsset(path: string, folder: string): Promise<string>
  deleteAsset(path: string): Promise<void>
  reveal(path: string): Promise<void>

  listCharacters(): Promise<CharacterCard[]>
  saveAssets(inputs: SaveAssetInput[], folder?: string): Promise<LibraryAsset[]>

  listTemplates(): Promise<PromptTemplate[]>
  saveTemplate(input: TemplateInput): Promise<PromptTemplate>
  deleteTemplate(id: string): Promise<void>
}

export interface ExportResult {
  ok: boolean
  path?: string
  canceled?: boolean
  error?: string
}

export type ClipboardContent =
  | { kind: 'image'; asset: GeneratedAsset }
  | { kind: 'text'; text: string }
  | null

export interface ClipboardApi {
  read(): Promise<ClipboardContent>
}

export interface ExportApi {
  project(projectName: string): Promise<ExportResult>
  canvasPng(projectName: string, canvasName: string): Promise<ExportResult>
  asset(relPath: string, fileName: string, scope?: AssetScope): Promise<ExportResult>
  assets(inputs: AssetRef[], fileName: string): Promise<ExportResult>}

export interface MediaApi {
  splitGrid(input: GridSplitRequest): Promise<GridSplitResult>
  stitch(input: StitchRequest): Promise<StitchResult>
  extractFrame(input: ExtractFrameRequest): Promise<ExtractFrameResult>
  splitAv(input: SplitAvRequest): Promise<SplitAvResult>
  cropVideo(input: CropVideoRequest): Promise<CropVideoResult>
  probe(path: string): Promise<MediaProbe>
  cropImage(input: CropImageRequest): Promise<CropImageResult>
  cropImageRect(input: CropImageRectRequest): Promise<CropImageResult>
  trimVideo(input: TrimVideoRequest): Promise<TrimVideoResult>
  removeSubtitles(input: RemoveSubtitlesRequest): Promise<RemoveSubtitlesResult>
  captureDepth(input: DepthCaptureRequest): Promise<DepthCaptureResult>
  startDepthCapture(input: DepthCaptureRequest): Promise<DepthTaskStartResult>
  cancelDepthCapture(taskId: string): Promise<void>
  onDepthCaptureEvent(callback: (event: DepthTaskEvent) => void): () => void
}

export interface ComponentsApi {
  status(): Promise<ComponentStatus[]>
  install(kind: ComponentKind): Promise<{ started: boolean }>
  pause(kind: ComponentKind): Promise<void>
  remove(kind: ComponentKind): Promise<void>
  onEvent(callback: (event: ComponentEvent) => void): () => void
}

export interface CineApi {
  app: {
    getInfo(): Promise<AppInfo>
    setTheme(theme: ThemeMode): Promise<void>
    minimize(): void
    maximize(): void
    close(): void
  }
  project: ProjectApi
  settings: SettingsApi
  generate: GenerateApi
  library: LibraryApi
  clipboard: ClipboardApi
  media: MediaApi
  components: ComponentsApi
  export: ExportApi
}
