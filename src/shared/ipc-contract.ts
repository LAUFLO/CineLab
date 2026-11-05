import type {
  CanvasData,
  ProjectMeta,
  ProjectSnapshot,
  RecentProject
} from './project-schema'
import type {
  ConnectionTestInput,
  ConnectionTestResult,
  ProviderConfig,
  ProviderInput
} from './provider-schema'
import type {
  GenerateHandle,
  GenerateRequest,
  GeneratedAsset,
  GenerationEvent
} from './generation'
import type {
  CharacterCard,
  CharacterInput,
  LibraryMaterial,
  PromptTemplate,
  TemplateInput
} from './library-schema'
import type { ModelsConfigStatus } from './models-file'

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
  listCharacters(): Promise<CharacterCard[]>
  saveCharacter(input: CharacterInput): Promise<CharacterCard>
  deleteCharacter(id: string): Promise<void>
  pickCharacterImages(): Promise<string[]>
  listMaterials(): Promise<LibraryMaterial[]>
  importMaterials(): Promise<LibraryMaterial[]>
  deleteMaterial(id: string): Promise<void>
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
  asset(relPath: string, fileName: string): Promise<ExportResult>
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
  export: ExportApi
}
