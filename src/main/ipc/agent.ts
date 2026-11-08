import { ipcMain } from 'electron'
import type { AgentChatRequest } from '@shared/agent'
import { chatWithAgent } from '../agent/chat'

let activeChat: AbortController | null = null

export function registerAgentIpc(): void {
  ipcMain.handle('agent:chat', async (_event, request: AgentChatRequest) => {
    if (activeChat) throw new Error('助手正在处理上一条消息')
    const controller = new AbortController()
    activeChat = controller
    try {
      return await chatWithAgent(request, controller.signal)
    } finally {
      if (activeChat === controller) activeChat = null
    }
  })

  ipcMain.handle('agent:cancel', () => {
    activeChat?.abort()
  })
}
