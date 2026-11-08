const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const SCALE = Number(process.env.POC_SCALE || 1)
app.commandLine.appendSwitch('force-device-scale-factor', String(SCALE))

const root = __dirname
const outDir = path.join(root, 'out')
const framesDir = path.join(outDir, 'frames')
const mediaDir = path.join(outDir, 'media')
const resultFile = path.join(outDir, 'result.json')
const logFile = path.join(outDir, 'poc.log')

const FPS = 30
const TOTAL_FRAMES = Number(process.env.POC_FRAMES || 300)
const W = Number(process.env.POC_WIDTH || 1920)
const H = Number(process.env.POC_HEIGHT || 1080)
const LW = Math.round(W / SCALE)
const LH = Math.round(H / SCALE)
const FFMPEG = process.env.FFMPEG_PATH

function timeout(ms, label) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms))
}

function log(line) {
  const text = `[${new Date().toISOString()}] ${line}\n`
  fs.appendFileSync(logFile, text)
}

function writeResult(result) {
  fs.writeFileSync(resultFile, JSON.stringify(result, null, 2))
}

async function main() {
  if (!FFMPEG) throw new Error('FFMPEG_PATH is not set')
  fs.mkdirSync(framesDir, { recursive: true })
  fs.writeFileSync(logFile, '')
  log('POC-1 start')

  const win = new BrowserWindow({
    show: false,
    width: LW,
    height: LH,
    useContentSize: true,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      backgroundThrottling: false,
      ...(process.env.POC_OFFSCREEN === '1' ? { offscreen: true } : {})
    }
  })

  const USE_CDP = process.env.POC_CDP === '1'
  let debug = null

  win.webContents.on('console-message', (_event, level, message) => {
    log(`renderer[${level}] ${message}`)
  })

  const startedLoad = Date.now()
  log('loadFile begin')
  await Promise.race([win.loadFile(path.join(root, 'stage.html')), timeout(20000, 'loadFile')])
  log(`loadFile done in ${Date.now() - startedLoad} ms`)
  if (USE_CDP) {
    log('debugger attach begin')
    debug = win.webContents.debugger
    debug.attach('1.3')
    log('debugger attached')
    await Promise.race([
      debug.sendCommand('Emulation.setDeviceMetricsOverride', {
        width: W,
        height: H,
        deviceScaleFactor: 1,
        mobile: false
      }),
      timeout(10000, 'setDeviceMetricsOverride')
    ])
    log(`cdp viewport set to ${W}x${H}`)
  }
  await win.webContents.executeJavaScript(
    `document.documentElement.style.setProperty('--stage-w','${LW}px');document.documentElement.style.setProperty('--stage-h','${LH}px')`
  )
  await Promise.race([win.webContents.executeJavaScript('window.ready'), timeout(20000, 'window.ready')])
  const dpr = await win.webContents.executeJavaScript('window.devicePixelRatio')
  log(`devicePixelRatio ${dpr}`)
  const loadMs = Date.now() - startedLoad
  log(`page ready in ${loadMs} ms`)

  const frameTimes = []
  const rawSizes = new Set()
  const startedRender = Date.now()

  let black = 0
  for (let i = 0; i < TOTAL_FRAMES; i++) {
    const t = i / FPS
    const frameStart = Date.now()
    await win.webContents.executeJavaScript(`window.seek(${t})`)
    let jpeg
    let rawW = W
    let rawH = H
    if (USE_CDP) {
      const shot = await debug.sendCommand('Page.captureScreenshot', { format: 'jpeg', quality: 95 })
      jpeg = Buffer.from(shot.data, 'base64')
    } else {
      let image = await win.webContents.capturePage()
      const rawSize = image.getSize()
      rawW = rawSize.width
      rawH = rawSize.height
      rawSizes.add(`${rawW}x${rawH}`)
      if (rawW !== W || rawH !== H) {
        image = image.resize({ width: W, height: H, quality: 'best' })
      }
      const bitmap = image.toBitmap()
      let sum = 0
      for (let p = 0; p < bitmap.length; p += 4 * 997) sum += bitmap[p]
      if (rawW === 0 || rawH === 0 || sum === 0) black++
      jpeg = image.toJPEG(95)
    }
    fs.writeFileSync(path.join(framesDir, `${String(i).padStart(6, '0')}.jpg`), jpeg)
    frameTimes.push(Date.now() - frameStart)
    if (i % 30 === 0) log(`frame ${i}/${TOTAL_FRAMES} ${frameTimes[frameTimes.length - 1]} ms`)
  }

  const renderMs = Date.now() - startedRender
  const memory = process.memoryUsage()
  log(`render done: ${renderMs} ms, black/empty frames: ${black}`)

  const videoFile = path.join(outDir, '.poc.video.mp4')
  const audioFile = path.join(outDir, '.poc.audio.m4a')
  const muxedFile = path.join(outDir, '.poc.muxed.mp4')
  const outputFile = path.join(outDir, 'poc.mp4')

  const startedVideo = Date.now()
  execFileSync(FFMPEG, [
    '-y', '-framerate', String(FPS), '-i', path.join(framesDir, '%06d.jpg'),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p',
    videoFile
  ], { stdio: 'ignore' })
  const videoMs = Date.now() - startedVideo

  const startedAudio = Date.now()
  execFileSync(FFMPEG, ['-y', '-i', path.join(mediaDir, 'audio.m4a'), '-t', '10', '-c:a', 'copy', audioFile], { stdio: 'ignore' })
  const audioMs = Date.now() - startedAudio

  const startedMux = Date.now()
  execFileSync(FFMPEG, ['-y', '-i', videoFile, '-i', audioFile, '-c', 'copy', '-movflags', '+faststart', muxedFile], { stdio: 'ignore' })
  fs.renameSync(muxedFile, outputFile)
  const muxMs = Date.now() - startedMux
  for (const file of [videoFile, audioFile]) fs.rmSync(file, { force: true })

  const sorted = [...frameTimes].sort((a, b) => a - b)
  const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length
  const result = {
    mode: USE_CDP ? 'cdp' : 'capturePage',
    width: W,
    height: H,
    scale: SCALE,
    logicalWidth: LW,
    logicalHeight: LH,
    fps: FPS,
    frames: TOTAL_FRAMES,
    loadMs,
    renderMs,
    avgFrameMs: Math.round(avg * 10) / 10,
    p50FrameMs: sorted[Math.floor(sorted.length * 0.5)],
    p95FrameMs: sorted[Math.floor(sorted.length * 0.95)],
    maxFrameMs: sorted[sorted.length - 1],
    blackOrEmptyFrames: black,
    captureSizes: [...rawSizes],
    videoEncodeMs: videoMs,
    audioEncodeMs: audioMs,
    muxMs,
    rssMb: Math.round(memory.rss / 1024 / 1024),
    outputBytes: fs.statSync(outputFile).size,
    realtimeRatio: Math.round((TOTAL_FRAMES / FPS) / (renderMs / 1000) * 100) / 100
  }
  writeResult(result)
  log(`result ${JSON.stringify(result)}`)
  win.destroy()
  app.quit()
}

app.whenReady().then(() => {
  main().catch((error) => {
    log(`ERROR ${error.stack || error.message}`)
    writeResult({ error: String(error.stack || error.message) })
    app.quit()
  })
})

app.on('window-all-closed', () => app.quit())
