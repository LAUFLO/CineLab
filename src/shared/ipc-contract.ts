import type { AssetRef, AssetScope } from './asset-schema'
import type {
  CanvasData,
  ProjectMeta,
  ProjectSnapshot,
  RecentProject
} from './project-schema'
import type { ProjectTemplateId } from './project-templates'
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
import type { Preferences } from './preferences'
import type {
  FilmStudy,
  FilmStudyAutoRequest,
  FilmStudyAutoResult,
  FilmStudyExportResult,
  FilmStudyExtractRequest,
  FilmStudyExtractResult,
  FilmStudyProgress
} from './film-study'
import type {
  AddToLibraryInput,
  SaveAssetInput,
  CharacterCard,
  LibraryAsset,
  LibraryFolderNode,
  LibraryRootInfo,
  PromptTemplate,
  TemplateInput,
  ThumbCacheInfo
} from './library-schema'
import type { ModelsConfigStatus } from './models-file'
import type {
  AgentChatRequest,
  AgentEvent,
  AgentModelInfo,
  AgentProposal,
  AgentProposalDraft,
  AgentSessionSnapshot,
  AgentToolCallRequest,
  AgentToolResultInput
} from './agent'
import type { OperationBindings } from './operation-schema'
import type { TimelineDoc } from './timeline-schema'
import type { ImportedSound, SoundAsset } from './sound-schema'
import type { UpdateApi } from './update'
import type {
  AudioPeaksRequest,
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
  TrimVideoResult,
  VisionTaskEvent,
  VisionTaskRequest,
  VisionTaskStartResult
} from './media'

export type ThemeMode = 'light' | 'dark' | 'system'

export interface AppInfo {
  version: string
  platform: string
  dataDir: string
}

export interface ProjectApi {
  bootstrap(): Promise<ProjectSnapshot | null>
  create(
    name: string,
    parentDir?: string,
    templateId?: ProjectTemplateId
  ): Promise<ProjectSnapshot>
  open(path: string): Promise<ProjectSnapshot>
  saveCanvas(path: string, canvas: CanvasData): Promise<void>
  recent(): Promise<RecentProject[]>
  readCover(path: string): Promise<string | null>
  setCoverFromLocal(path: string): Promise<{ ok: boolean; canceled?: boolean }>
  setCoverFromAsset(path: string, assetPath: string): Promise<{ ok: boolean }>
  removeCover(path: string): Promise<void>
  pickCreate(templateId?: ProjectTemplateId): Promise<ProjectSnapshot | null>
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
  getOperationBindings(): Promise<OperationBindings>
  saveOperationBindings(bindings: OperationBindings): Promise<void>
  getPreferences(): Promise<Preferences>
  savePreferences(input: Preferences): Promise<Preferences>
  resetPreferences(): Promise<Preferences>
  exportPreferences(): Promise<{ path?: string; canceled?: boolean }>
  importPreferences(): Promise<Preferences | null>
  chooseProjectDir(): Promise<string | null>
  openDataDir(): Promise<void>
  onModelsChanged(callback: () => void): () => void
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
  setAssetTags(path: string, tags: string[]): Promise<string[]>
  reveal(path: string): Promise<void>

  listCharacters(): Promise<CharacterCard[]>
  saveAssets(inputs: SaveAssetInput[], folder?: string): Promise<LibraryAsset[]>

  listTemplates(): Promise<PromptTemplate[]>
  saveTemplate(input: TemplateInput): Promise<PromptTemplate>
  deleteTemplate(id: string): Promise<void>
  thumbCacheInfo(): Promise<ThumbCacheInfo>
  clearThumbCache(): Promise<ThumbCacheInfo>
}

export interface ExportResult {
  ok: boolean
  path?: string
  canceled?: boolean
  error?: string
  copiedAssets?: number
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
  assets(inputs: AssetRef[], fileName: string): Promise<ExportResult>
  concatVideos(
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
  ): Promise<ExportResult>
  pickFile(kind: 'subtitle' | 'audio'): Promise<string | null>
}

export interface MediaApi {
  splitGrid(input: GridSplitRequest): Promise<GridSplitResult>
  stitch(input: StitchRequest): Promise<StitchResult>
  extractFrame(input: ExtractFrameRequest): Promise<ExtractFrameResult>
  splitAv(input: SplitAvRequest): Promise<SplitAvResult>
  cropVideo(input: CropVideoRequest): Promise<CropVideoResult>
  probe(path: string): Promise<MediaProbe>
  exists(path: string, scope?: 'project' | 'global'): Promise<boolean>
  existsMany(
    entries: { path: string; scope: 'project' | 'global' }[]
  ): Promise<boolean[]>
  thumbnail(path: string, atSeconds?: number, kind?: 'video' | 'audio'): Promise<string | null>
  proxy(path: string): Promise<string | null>
  audioPeaks(input: AudioPeaksRequest): Promise<number[]>
  listSounds(): Promise<SoundAsset[]>
  importSound(id: string): Promise<ImportedSound>
  cropImage(input: CropImageRequest): Promise<CropImageResult>
  cropImageRect(input: CropImageRectRequest): Promise<CropImageResult>
  trimVideo(input: TrimVideoRequest): Promise<TrimVideoResult>
  removeSubtitles(input: RemoveSubtitlesRequest): Promise<RemoveSubtitlesResult>
  captureDepth(input: DepthCaptureRequest): Promise<DepthCaptureResult>
  startDepthCapture(input: DepthCaptureRequest): Promise<DepthTaskStartResult>
  cancelDepthCapture(taskId: string): Promise<void>
  onDepthCaptureEvent(callback: (event: DepthTaskEvent) => void): () => void
  startVisionTask(input: VisionTaskRequest): Promise<VisionTaskStartResult>
  cancelVisionTask(taskId: string): Promise<void>
  onVisionTaskEvent(callback: (event: VisionTaskEvent) => void): () => void
}

export interface ComponentsApi {
  status(): Promise<ComponentStatus[]>
  install(kind: ComponentKind): Promise<{ started: boolean }>
  pause(kind: ComponentKind): Promise<void>
  remove(kind: ComponentKind): Promise<void>
  onEvent(callback: (event: ComponentEvent) => void): () => void
}

export interface TimelineExportProgress {
  frame: number
  total: number
  stage: 'rendering' | 'encoding' | 'done'
}

export interface TimelineExportResult {
  ok: boolean
  path?: string
  canceled?: boolean
}

export type TimelineVideoCodec = 'h264' | 'hevc' | 'av1'

export interface TimelineExportSettings {
  codec?: TimelineVideoCodec
  crf?: number
}

export type TimelineTranscribeRequest =
  | {
      mode: 'clip'
      path: string
      scope: 'project' | 'global'
      sourceStartMs: number
      durationMs: number
      speed: number
    }
  | {
      mode: 'timeline'
      doc: TimelineDoc
    }

export interface TimelineTranscribeSegment {
  startMs: number
  durationMs: number
  text: string
}

export interface TimelineTranscribeResult {
  segments: TimelineTranscribeSegment[]
  language?: string
}

export interface TimelineTranscribeProgress {
  stage: 'extracting' | 'transcribing'
  percent: number
}

export type TimelineAnalysisKind = 'shots' | 'silences' | 'beats'

export interface TimelineAnalysisRequest {
  kind: TimelineAnalysisKind
  path: string
  scope: 'project' | 'global'
  sourceStartMs: number
  durationMs: number
  speed: number
}

export interface TimelineAnalysisMarker {
  /** 相对片段起点的毫秒 */
  atMs: number
  label: string
  durationMs?: number
  color?: string
}

export interface TimelineAnalysisResult {
  markers: TimelineAnalysisMarker[]
}

export interface TimelineSubtitleCue {
  startMs: number
  endMs: number
  text: string
}

export interface TimelineSubtitleImportResult {
  name: string
  cues: TimelineSubtitleCue[]
}

export interface TimelineApi {
  load(timelineId: string): Promise<TimelineDoc | null>
  save(timelineId: string, doc: TimelineDoc): Promise<void>
  duplicate(timelineId: string): Promise<string>
  exportVtt(doc: TimelineDoc): Promise<string>
  export(doc: TimelineDoc, settings?: TimelineExportSettings): Promise<TimelineExportResult>
  cancelExport(): Promise<void>
  onExportProgress(callback: (progress: TimelineExportProgress) => void): () => void
  transcribe(input: TimelineTranscribeRequest): Promise<TimelineTranscribeResult>
  cancelTranscribe(): Promise<void>
  onTranscribeProgress(
    callback: (progress: TimelineTranscribeProgress) => void
  ): () => void
  analyze(input: TimelineAnalysisRequest): Promise<TimelineAnalysisResult>
  importSubtitles(path?: string): Promise<TimelineSubtitleImportResult | null>
}

export interface FilmStudyApi {
  extract(input: FilmStudyExtractRequest): Promise<FilmStudyExtractResult>
  auto(input: FilmStudyAutoRequest): Promise<FilmStudyAutoResult>
  cancel(nodeId: string): Promise<void>
  load(studyId: string): Promise<FilmStudy>
  save(study: FilmStudy): Promise<FilmStudy>
  exportMarkdown(studyId: string): Promise<FilmStudyExportResult>
  exportAnalysisPackage(studyId: string): Promise<FilmStudyExportResult>
  exportBundle(studyId: string): Promise<FilmStudyExportResult>
  importAnalysis(studyId: string): Promise<FilmStudy | null>
  extractSubtitles(studyId: string): Promise<FilmStudy>
  importSubtitles(studyId: string): Promise<FilmStudy | null>
  analyze(studyId: string, modelKey: string): Promise<FilmStudy>
  contactSheet(studyId: string): Promise<GeneratedAsset>
  onProgress(callback: (progress: FilmStudyProgress) => void): () => void
}

export interface AgentApi {
  chat(input: AgentChatRequest): Promise<{ turnId: string }>
  cancel(turnId: string): Promise<void>
  toolResult(input: AgentToolResultInput): Promise<void>
  sessionLoad(): Promise<AgentSessionSnapshot>
  modelInfo(): Promise<AgentModelInfo | null>
  proposalCreate(input: AgentProposalDraft): Promise<AgentProposal>
  proposalActive(): Promise<AgentProposal | null>
  proposalSubmit(proposalId: string): Promise<AgentProposal>
  proposalCancel(proposalId: string): Promise<AgentProposal>
  onEvent(callback: (event: AgentEvent) => void): () => void
  onToolCall(callback: (call: AgentToolCallRequest) => void): () => void
}

export interface CineApi {
  app: {
    getInfo(): Promise<AppInfo>
    setTheme(theme: ThemeMode): Promise<void>
    setZoom(factor: number): Promise<void>
    onCloseRequested(callback: () => void): () => void
    confirmClose(): void
    openLogs(): Promise<void>
    log(level: 'info' | 'warn' | 'error', message: string): Promise<void>
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
  timeline: TimelineApi
  filmStudy: FilmStudyApi
  components: ComponentsApi
  export: ExportApi
  update: UpdateApi
  agent: AgentApi
}
