import type { CineApi } from '../shared/ipc-contract'

declare global {
  interface Window {
    api: CineApi
  }
}

export {}
