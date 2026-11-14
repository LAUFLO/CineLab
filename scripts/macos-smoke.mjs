import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const appPath = process.argv[2]
const installDepth = process.argv.includes('--install-depth')
if (!appPath) {
  throw new Error(
    'usage: node scripts/macos-smoke.mjs <CineLab.app> [--install-depth]'
  )
}

const bin = join(appPath, 'Contents/MacOS/CineLab')
const resources = join(appPath, 'Contents/Resources')
const ffmpeg = join(
  resources,
  'app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg'
)
const ffprobe = join(
  resources,
  'app.asar.unpacked/node_modules/ffprobe-static/bin/darwin/arm64/ffprobe'
)

for (const file of [bin, ffmpeg, ffprobe]) {
  if (!existsSync(file)) throw new Error(`missing ${file}`)
}

console.log(
  'ffmpeg:',
  execFileSync(ffmpeg, ['-version'], { encoding: 'utf8' }).split('\n')[0]
)
console.log(
  'ffprobe:',
  execFileSync(ffprobe, ['-version'], { encoding: 'utf8' }).split('\n')[0]
)

const port = 9333
const userData = '/tmp/cinelab-macos-smoke'
const child = spawn(bin, [], {
  env: {
    ...process.env,
    CINELAB_USER_DATA: userData,
    CINELAB_DEBUG_PORT: String(port)
  },
  stdio: 'ignore'
})

let exitInfo = null
child.on('exit', (code, signal) => {
  exitInfo = { code, signal }
})

let lastTargets = []

async function waitForPage() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (exitInfo) {
      throw new Error(`app exited before CDP: ${JSON.stringify(exitInfo)}`)
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`)
      if (response.ok) {
        const targets = await response.json()
        lastTargets = targets
        const page = targets.find((target) => target.type === 'page')
        if (page) return page
      }
    } catch {
      // renderer not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`CDP timeout; targets=${JSON.stringify(lastTargets)}`)
}

function printLogs() {
  for (const name of ['logs/main.log', 'window-error.log']) {
    try {
      console.log(`--- ${name} ---`)
      console.log(readFileSync(join(userData, name), 'utf8'))
    } catch {
      // log file may not exist
    }
  }
}

async function main() {
  const page = await waitForPage()
  console.log('page:', page.title, page.url)

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = reject
  })

  let seq = 0
  const pending = new Map()
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message)
      pending.delete(message.id)
    }
  }

  function evaluate(expression) {
    return new Promise((resolve, reject) => {
      const id = ++seq
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error('evaluate timeout'))
      }, 20000)
      pending.set(id, (message) => {
        clearTimeout(timer)
        const result = message.result?.result
        if (result?.subtype === 'error') {
          reject(new Error(result.description ?? 'evaluate error'))
        } else {
          resolve(result?.value)
        }
      })
      ws.send(
        JSON.stringify({
          id,
          method: 'Runtime.evaluate',
          params: { expression, returnByValue: true, awaitPromise: true }
        })
      )
    })
  }

  let parsed = null
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const renderer = await evaluate(`(async () => {
      const info = await window.api.app.getInfo()
      return JSON.stringify({
        version: info.version,
        platform: info.platform,
        projectCenter: Boolean(document.querySelector('.project-center')),
        text: document.body.innerText.slice(0, 80)
      })
    })()`)
    parsed = JSON.parse(renderer)
    if (parsed.projectCenter) break
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  console.log('renderer:', JSON.stringify(parsed))
  if (parsed.version !== '0.1.0') {
    throw new Error(`unexpected version ${parsed.version}`)
  }
  if (parsed.platform !== 'darwin') {
    throw new Error(`unexpected platform ${parsed.platform}`)
  }
  if (!parsed.projectCenter) throw new Error('project center not rendered')

  if (installDepth) {
    console.log('installing depth-runtime...')
    await evaluate(`(async () => {
      await window.api.components.install('depth-runtime')
      return 'started'
    })()`)

    let depth = null
    for (let attempt = 0; attempt < 300; attempt += 1) {
      const raw = await evaluate(
        `(async () => JSON.stringify(await window.api.components.status()))()`
      )
      const list = JSON.parse(raw)
      depth = list.find((item) => item.kind === 'depth-runtime')
      if (depth?.state === 'installed') break
      if (depth?.state === 'error') {
        throw new Error(`depth install failed: ${depth.error}`)
      }
      if (attempt % 15 === 0) {
        console.log('depth state:', depth?.state, depth?.percent ?? '')
      }
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
    if (depth?.state !== 'installed') {
      throw new Error('depth install timeout')
    }
    console.log('depth installed:', depth.path)

    const python = join(depth.path, 'python', 'bin', 'python3')
    const version = execFileSync(
      python,
      ['-c', 'import torch, cv2, numpy; print(torch.__version__, cv2.__version__)'],
      { encoding: 'utf8' }
    )
    console.log('depth python:', version.trim())

    const worker = execFileSync(
      python,
      [
        '-c',
        `import sys
sys.path.insert(0, '.')
from worker import ensure_torchvision_compose
ensure_torchvision_compose()
from video_depth_anything.video_depth import VideoDepthAnything
print('WORKER_OK')`
      ],
      { cwd: depth.path, encoding: 'utf8' }
    )
    console.log('depth worker:', worker.trim())
  }

  ws.close()
}

try {
  await main()
} catch (error) {
  printLogs()
  throw error
} finally {
  child.kill('SIGTERM')
  await new Promise((resolve) => setTimeout(resolve, 2000))
  child.kill('SIGKILL')
}

console.log('MACOS_SMOKE_OK')
