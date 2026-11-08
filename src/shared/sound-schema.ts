export interface SoundAsset {
  id: string
  name: string
  category: string
  file: string
  duration: number
  bytes: number
  license: 'CC0-1.0'
  source: string
  author?: string
  sha256: string
}

export interface SoundManifest {
  version: 1
  sounds: SoundAsset[]
}

export interface ImportedSound {
  path: string
  name: string
  durationMs: number
}
