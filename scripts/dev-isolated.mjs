import { spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const registryFile = join(tmpdir(), 'cinelab-isolated.json')
const forceNew = process.argv.includes('--new')

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function isCdpAlive(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(1200)
    })
    return response.ok
  } catch {
    return false
  }
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port, '127.0.0.1')
  })
}

async function findFreePort(start) {
  for (let port = start; port < start + 100; port += 1) {
    if (await isPortFree(port)) return port
  }
  throw new Error(`no free port from ${start}`)
}

async function readExistingInstance() {
  if (!existsSync(registryFile)) return null

  try {
    const data = JSON.parse(readFileSync(registryFile, 'utf8'))
    if (!data.port || !data.pid) return null
    if (!isProcessAlive(data.pid)) return null
    if (!(await isCdpAlive(data.port))) return null
    return data
  } catch {
    return null
  }
}

function printInstance(port, userData, prefix) {
  console.log(`[dev:isolated] ${prefix}`)
  console.log(`[dev:isolated] CDP port: ${port}`)
  console.log(`[dev:isolated] userData: ${userData}`)
  console.log(
    `[dev:isolated] CDP: $env:CINELAB_DEBUG_PORT=${port}; node scripts/cdp-eval.mjs "..."`
  )
}

if (!forceNew) {
  const existing = await readExistingInstance()
  if (existing) {
    printInstance(
      existing.port,
      existing.userData,
      `reusing running instance (pid ${existing.pid})`
    )
    process.exit(0)
  }
}

try {
  rmSync(registryFile, { force: true })
} catch {
  // ignore stale registry
}

const requestedPort = Number(process.env.CINELAB_DEBUG_PORT ?? 0)
const debugPort = requestedPort || (await findFreePort(9222))
const userData =
  process.env.CINELAB_USER_DATA ||
  mkdtempSync(join(tmpdir(), 'cinelab-test-'))

mkdirSync(userData, { recursive: true })

printInstance(debugPort, userData, 'starting new instance')

const child = spawn('corepack pnpm dev', {
  cwd: process.cwd(),
  shell: true,
  stdio: 'inherit',
  env: {
    ...process.env,
    CINELAB_ISOLATED: '1',
    CINELAB_DEBUG_PORT: String(debugPort),
    CINELAB_USER_DATA: userData
  }
})

writeFileSync(
  registryFile,
  JSON.stringify(
    {
      pid: process.pid,
      port: debugPort,
      userData,
      startedAt: new Date().toISOString()
    },
    null,
    2
  ),
  'utf8'
)

function cleanupRegistry() {
  try {
    const data = JSON.parse(readFileSync(registryFile, 'utf8'))
    if (data.pid === process.pid) {
      rmSync(registryFile, { force: true })
    }
  } catch {
    // ignore missing or invalid registry
  }
}

child.on('exit', (code) => {
  cleanupRegistry()
  process.exit(code ?? 0)
})

process.on('SIGINT', () => {
  cleanupRegistry()
  child.kill()
})
