import { contextBridge, ipcRenderer } from 'electron'
import type { CineApi, ThemeMode } from '../shared/ipc-contract'

const api: CineApi = {
  app: {
    getInfo: () => ipcRenderer.invoke('app:get-info'),
    setTheme: (theme: ThemeMode) => ipcRenderer.invoke('app:set-theme', theme),
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close')
  }
}

contextBridge.exposeInMainWorld('api', api)
