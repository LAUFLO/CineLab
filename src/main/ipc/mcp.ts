import { existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { clipboard, ipcMain, shell } from 'electron'
import { mcpConfigSnapshot, mcpStatus } from '../mcp/server'
import { mcpToolCatalog } from '../mcp/catalog'
import { getPreferences } from '../settings/preferences'

export function registerMcpIpc(): void {
  ipcMain.handle('mcp:status', async () => {
    const preferences = await getPreferences()
    return {
      ...mcpStatus(),
      enabled: preferences.mcp.enabled,
      readOnly: preferences.mcp.readOnly,
      tools: mcpToolCatalog()
    }
  })

  ipcMain.handle('mcp:config', () => mcpConfigSnapshot())

  ipcMain.handle('mcp:reveal-config', async () => {
    const { configPath } = mcpStatus()
    if (existsSync(configPath)) {
      shell.showItemInFolder(configPath)
      return
    }
    await shell.openPath(dirname(configPath))
  })

  ipcMain.handle('mcp:copy', (_event, text: string) => {
    if (typeof text === 'string' && text.length > 0) {
      clipboard.writeText(text)
    }
  })
}
