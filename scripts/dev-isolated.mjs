import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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

const requestedPort = Number(process.env.CINELAB_DEBUG_PORT ?? 0)
const debugPort = requestedPort || (await findFreePort(9222))
const userData =
  process.env.CINELAB_USER_DATA ||
  mkdtempSync(join(tmpdir(), 'cinelab-test-'))

mkdirSync(userData, { recursive: true })

console.log(`[dev:isolated] CDP port: ${debugPort}`)
console.log(`[dev:isolated] userData: ${userData}`)
console.log(
  `[dev:isolated] CDP: $env:CINELAB_DEBUG_PORT=${debugPort}; node scripts/cdp-eval.mjs "..."`,
)

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

child.on('exit', (code) => {
  process.exit(code ?? 0)
})

process.on('SIGINT', () => {
  child.kill()
})
