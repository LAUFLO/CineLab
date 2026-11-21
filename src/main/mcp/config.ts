import { app } from 'electron'
import { randomBytes } from 'node:crypto'
import { promises as fs, rmSync } from 'node:fs'
import { join } from 'node:path'

export interface McpStdioConfig {
  command: string
  args: string[]
  env?: Record<string, string>
}

export interface McpServerConfig {
  version: 1
  url: string
  token: string
  serverVersion: string
  stdio: McpStdioConfig
  pid: number
  startedAt: string
}

export function mcpConfigPath(): string {
  return join(app.getPath('userData'), 'mcp.json')
}

export function createMcpToken(): string {
  return randomBytes(32).toString('hex')
}

export async function readMcpConfig(): Promise<McpServerConfig | null> {
  try {
    return JSON.parse(
      await fs.readFile(mcpConfigPath(), 'utf8')
    ) as McpServerConfig
  } catch {
    return null
  }
}

export async function writeMcpConfig(config: McpServerConfig): Promise<void> {
  await fs.writeFile(mcpConfigPath(), JSON.stringify(config, null, 2), {
    encoding: 'utf8',
    mode: 0o600
  })
}

export function removeMcpConfigSync(): void {
  try {
    rmSync(mcpConfigPath(), { force: true })
  } catch {
    // ignore cleanup failures
  }
}
