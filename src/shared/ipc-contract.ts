import type { CanvasData, ProjectSnapshot, RecentProject } from './project-schema'
import type {
  ConnectionTestInput,
  ConnectionTestResult,
  ProviderConfig,
  ProviderInput
} from './provider-schema'

export type ThemeMode = 'light' | 'dark' | 'system'

export interface AppInfo {
  version: string
  platform: string
  dataDir: string
}

export interface ProjectApi {
  bootstrap(): Promise<ProjectSnapshot>
  create(name: string, parentDir?: string): Promise<ProjectSnapshot>
  open(path: string): Promise<ProjectSnapshot>
  saveCanvas(path: string, canvas: CanvasData): Promise<void>
  recent(): Promise<RecentProject[]>
  pickCreate(): Promise<ProjectSnapshot | null>
  pickOpen(): Promise<ProjectSnapshot | null>
  reveal(path: string): Promise<void>
}

export interface SettingsApi {
  listProviders(): Promise<ProviderConfig[]>
  saveProvider(input: ProviderInput): Promise<ProviderConfig>
  deleteProvider(id: string): Promise<void>
  testConnection(input: ConnectionTestInput): Promise<ConnectionTestResult>
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
}
