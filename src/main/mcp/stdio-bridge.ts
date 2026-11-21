import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js'

interface BridgeConfig {
  url: string
  token: string
  serverVersion: string
}

function userDataDir(): string {
  if (process.env.CINELAB_USER_DATA) return process.env.CINELAB_USER_DATA

  const home = homedir()
  if (process.platform === 'win32') {
    return join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'cinelab')
  }
  if (process.platform === 'darwin') {
    return join(home, 'Library', 'Application Support', 'cinelab')
  }
  return join(home, '.config', 'cinelab')
}

function log(message: string): void {
  console.error(`[cinelab-mcp] ${message}`)
}

async function main(): Promise<void> {
  const configPath = join(userDataDir(), 'mcp.json')
  let config: BridgeConfig
  try {
    config = JSON.parse(await readFile(configPath, 'utf8')) as BridgeConfig
  } catch (error) {
    log(`无法读取 ${configPath}：${error instanceof Error ? error.message : String(error)}`)
    log('请先启动 CineLab，确认 mcp.json 已生成。')
    process.exit(1)
  }

  if (!config.url || !config.token) {
    log('mcp.json 缺少 url 或 token')
    process.exit(1)
  }

  const client = new Client({
    name: 'cinelab-mcp',
    version: config.serverVersion ?? '0.0.0'
  })
  const httpTransport = new StreamableHTTPClientTransport(new URL(config.url), {
    requestInit: {
      headers: {
        Authorization: `Bearer ${config.token}`
      }
    }
  })

  try {
    await client.connect(httpTransport)
  } catch (error) {
    log(
      `无法连接 CineLab MCP HTTP server（${config.url}）：${
        error instanceof Error ? error.message : String(error)
      }`
    )
    process.exit(1)
  }

  const server = new Server(
    { name: 'cinelab-mcp', version: config.serverVersion ?? '0.0.0' },
    { capabilities: { tools: {} } }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () =>
    client.listTools()
  )
  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    client.callTool(request.params)
  )

  await server.connect(new StdioServerTransport())
  log(`已连接 ${config.url}`)

  const shutdown = async (): Promise<void> => {
    await client.close().catch(() => undefined)
    await server.close().catch(() => undefined)
    process.exit(0)
  }

  process.on('SIGINT', () => void shutdown())
  process.on('SIGTERM', () => void shutdown())
}

void main().catch((error) => {
  log(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exit(1)
})
