export type ThemeMode = 'light' | 'dark' | 'system'

export interface AppInfo {
  version: string
  platform: string
  dataDir: string
}

export interface CineApi {
  app: {
    getInfo(): Promise<AppInfo>
    setTheme(theme: ThemeMode): Promise<void>
    minimize(): void
    maximize(): void
    close(): void
  }
}
