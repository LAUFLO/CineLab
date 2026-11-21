import { app } from 'electron'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import { join } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { log } from '../logger'
import {
  createMcpToken,
  readMcpConfig,
  removeMcpConfigSync,
  writeMcpConfig
} from './config'
import { registerCineLabTools } from './tools'

interface McpSession {
  server: McpServer
  transport: StreamableHTTPServerTransport
}

let httpServer: Server | null = null
const sessions = new Map<string, McpSession>()
let token = ''
let url = ''

function authorized(req: IncomingMessage): boolean {
  const header = req.headers.authorization ?? ''
  const expected = `Bearer ${token}`
  const actual = Buffer.from(header)
  const target = Buffer.from(expected)
  return (
    actual.length === target.length && timingSafeEqual(actual, target)
  )
}

async function createSession(): Promise<McpSession> {
  const server = new McpServer({
    name: 'cinelab',
    version: app.getVersion()
  })
  registerCineLabTools(server)

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: true,
    allowedHosts: ['127.0.0.1', 'localhost']
  })

  const session: McpSession = { server, transport }
  transport.onclose = () => {
    const id = transport.sessionId
    if (id) sessions.delete(id)
  }

  await server.connect(transport)
  return session
}

function sessionIdOf(req: IncomingMessage): string | undefined {
  const value = req.headers['mcp-session-id']
  return Array.isArray(value) ? value[0] : value
}

function bind(server: Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException): void => {
      server.off('listening', onListening)
      reject(error)
    }
    const onListening = (): void => {
      server.off('error', onError)
      const address = server.address()
      resolve(typeof address === 'object' && address ? address.port : port)
    }

    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, '127.0.0.1')
  })
}

export async function startMcpServer(): Promise<void> {
  if (httpServer) return

  const previous = await readMcpConfig()
  token = previous?.token || createMcpToken()

  const server = createServer((req, res) => {
    let pathname = ''
    try {
      pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
    } catch {
      res.writeHead(400).end()
      return
    }

    if (pathname !== '/mcp') {
      res.writeHead(404).end()
      return
    }
    if (!authorized(req)) {
      res
        .writeHead(401, { 'content-type': 'application/json' })
        .end(JSON.stringify({ error: 'unauthorized' }))
      return
    }

    void (async () => {
      const id = sessionIdOf(req)
      let session = id ? sessions.get(id) : undefined

      if (!session) {
        if (req.method !== 'POST') {
          res.writeHead(400).end()
          return
        }
        session = await createSession()
      }

      await session.transport.handleRequest(req, res)

      const nextId = session.transport.sessionId
      if (nextId) sessions.set(nextId, session)
    })().catch((error) => {
      log.error('mcp request failed', error)
      if (!res.headersSent) {
        res.writeHead(500).end()
      }
    })
  })

  let port = 0
  for (const candidate of [7788, 7789, 7790, 7791, 7792]) {
    try {
      port = await bind(server, candidate)
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error
    }
  }
  if (!port) port = await bind(server, 0)

  httpServer = server
  url = `http://127.0.0.1:${port}/mcp`

  await writeMcpConfig({
    version: 1,
    url,
    token,
    serverVersion: app.getVersion(),
    stdio: {
      command: process.execPath,
      args: [join(__dirname, 'cinelab-mcp.js')],
      env: { ELECTRON_RUN_AS_NODE: '1' }
    },
    pid: process.pid,
    startedAt: new Date().toISOString()
  })

  log.info('mcp server started', { url })
}

export async function stopMcpServer(): Promise<void> {
  removeMcpConfigSync()

  const server = httpServer
  const currentSessions = [...sessions.values()]
  httpServer = null
  sessions.clear()

  for (const session of currentSessions) {
    await session.transport.close().catch(() => undefined)
    await session.server.close().catch(() => undefined)
  }

  if (server) {
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
  }
}

export function mcpStatus(): { running: boolean; url?: string } {
  return httpServer ? { running: true, url } : { running: false }
}
