import { randomUUID } from 'node:crypto'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { McpWriteCommand, McpWriteResult } from '@shared/mcp-command'
import { getPreferences } from '../settings/preferences'

interface PendingCommand {
  resolve: (result: McpWriteResult) => void
  timer: NodeJS.Timeout
}

const pending = new Map<string, PendingCommand>()
let ipcRegistered = false

export function registerMcpCommandIpc(): void {
  if (ipcRegistered) return
  ipcRegistered = true

  ipcMain.on('mcp:command-result', (_event, result: McpWriteResult) => {
    const entry = pending.get(result.id)
    if (!entry) return
    pending.delete(result.id)
    clearTimeout(entry.timer)
    entry.resolve(result)
  })
}

export function result(value: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }]
  }
}

export function errorResult(message: string): CallToolResult {
  return {
    content: [{ type: 'text', text: message }],
    isError: true
  }
}

function appWindow(): BrowserWindow | null {
  return (
    BrowserWindow.getAllWindows().find((window) => !window.isDestroyed()) ?? null
  )
}

export function sendCommand(
  tool: string,
  args: Record<string, unknown>,
  timeoutMs = 30_000
): Promise<McpWriteResult> {
  const win = appWindow()
  if (!win) {
    return Promise.reject(new Error('没有可用的 CineLab 窗口'))
  }

  const id = randomUUID()
  const command: McpWriteCommand = {
    id,
    tool,
    args,
    turnId: `mcp-${id}`
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error('渲染进程响应超时'))
    }, timeoutMs)

    pending.set(id, { resolve, timer })
    win.webContents.send('mcp:command', command)
  })
}

async function confirm(
  summary: string,
  args: Record<string, unknown>,
  destructive: boolean
): Promise<boolean> {
  const win = appWindow()
  const options: Electron.MessageBoxOptions = {
    type: destructive ? 'warning' : 'question',
    buttons: ['执行', '取消'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
    title: '外部 Agent 请求修改项目',
    message: summary,
    detail: JSON.stringify(args, null, 2).slice(0, 1200)
  }

  const response = win
    ? await dialog.showMessageBox(win, options)
    : await dialog.showMessageBox(options)
  return response.response === 0
}

export async function runWrite(
  tool: string,
  summary: string,
  args: Record<string, unknown>,
  destructive = false,
  timeoutMs = 30_000
): Promise<CallToolResult> {
  const preferences = await getPreferences()
  if (preferences.mcp.readOnly) {
    return errorResult(
      'MCP 当前为只读模式，请在设置中关闭只读后再执行写操作'
    )
  }

  if (!(await confirm(summary, args, destructive))) {
    return result({ cancelled: true })
  }

  const commandResult = await sendCommand(tool, args, timeoutMs)
  if (!commandResult.ok) {
    return errorResult(commandResult.error ?? '执行失败')
  }
  return result(commandResult.result)
}

export async function runRead(
  tool: string,
  args: Record<string, unknown>,
  timeoutMs = 30_000
): Promise<CallToolResult> {
  const commandResult = await sendCommand(tool, args, timeoutMs)
  if (!commandResult.ok) {
    return errorResult(commandResult.error ?? '读取失败')
  }
  return result(commandResult.result)
}
