export interface LibraryMigrateProgress {
  phase: 'scan' | 'copy' | 'verify' | 'switch'
  copiedFiles: number
  totalFiles: number
  copiedBytes: number
  totalBytes: number
  current?: string
}

export interface LibraryMigrateResult {
  root: string
  files: number
  bytes: number
  warnings: string[]
  trashedOldRoot: boolean
}
