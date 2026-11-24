import { session } from 'electron'
import type { Preferences } from '@shared/preferences'
import { generationQueue } from '../engine/queue'
import { mcpStatus, startMcpServer, stopMcpServer } from '../mcp/server'

async function applyProxy(preferences: Preferences): Promise<void> {
  const ses = session.defaultSession
  const network = preferences.network

  if (network.proxyMode === 'system') {
    await ses.setProxy({ mode: 'system' })
    return
  }

  if (network.proxyMode === 'manual' && network.proxyUrl.trim()) {
    await ses.setProxy({
      mode: 'fixed_servers',
      proxyRules: network.proxyUrl.trim()
    })
    return
  }

  await ses.setProxy({ mode: 'direct' })
}

export async function applyRuntimePreferences(
  preferences: Preferences
): Promise<void> {
  generationQueue.setConcurrency(preferences.generation.concurrency)

  try {
    if (preferences.mcp.enabled) {
      if (!mcpStatus().running) await startMcpServer()
    } else if (mcpStatus().running) {
      await stopMcpServer()
    }
  } catch (error) {
    console.warn('[settings] failed to apply mcp preferences', error)
  }

  try {
    await applyProxy(preferences)
  } catch (error) {
    console.warn('[settings] failed to apply proxy preferences', error)
  }
}
