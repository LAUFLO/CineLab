import { execFileSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const appPath = process.argv[2]
if (!appPath) {
  throw new Error('usage: node scripts/macos-smoke.mjs <CineLab.app>')
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

console.log('ffmpeg:', execFileSync(ffmpeg, ['-version'], { encoding: 'utf8' }).split('\n')[0])
console.log('ffprobe:', execFileSync(ffprobe, ['-version'], { encoding: 'utf8' }).split('\n')[0])

const port = 9333
const child = spawn(bin, [], {
  env: {
    ...process.env,
    CINELAB_USER_DATA: '/tmp/cinelab-macos-smoke',
    CINELAB_DEBUG_PORT: String(port)
  },
  stdio: 'ignore'
})

async function waitForTargets() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`)
      if (response.ok) return await response.json()
    } catch {
      // renderer not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('CDP timeout')
}

try {
  const targets = await waitForTargets()
  const page = targets.find(
    (target) => target.type === 'page' && target.url.includes('index.html')
  )
  if (!page) throw new Error('no renderer page')

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = reject
  })

  const result = await new Promise((resolve, reject) => {
    const id = 1
    const timer = setTimeout(() => reject(new Error('evaluate timeout')), 10000)
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data)
      if (message.id === id) {
        clearTimeout(timer)
        resolve(message)
      }
    }
    ws.send(
      JSON.stringify({
        id,
        method: 'Runtime.evaluate',
        params: {
          expression: `(async () => {
            const info = await window.api.app.getInfo()
            return JSON.stringify({
              version: info.version,
              platform: info.platform,
              projectCenter: Boolean(document.querySelector('.project-center')),
              text: document.body.innerText.slice(0, 80)
            })
          })()`,
          returnByValue: true,
          awaitPromise: true
        }
      })
    )
  })
  ws.close()

  const value = result.result?.result?.value
  console.log('renderer:', value)
  const parsed = JSON.parse(value)
  if (parsed.version !== '0.1.0') throw new Error(`unexpected version ${parsed.version}`)
  if (parsed.platform !== 'darwin') throw new Error(`unexpected platform ${parsed.platform}`)
  if (!parsed.projectCenter) throw new Error('project center not rendered')
} finally {
  child.kill('SIGTERM')
  await new Promise((resolve) => setTimeout(resolve, 2000))
  child.kill('SIGKILL')
}

console.log('MACOS_SMOKE_OK')
