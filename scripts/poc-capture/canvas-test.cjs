const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const root = __dirname
const outDir = path.join(root, 'out')
const framesDir = path.join(outDir, 'canvas-frames')
const logFile = path.join(outDir, 'canvas.log')
const resultFile = path.join(outDir, 'canvas-result.json')
const FPS = 30
const FRAMES = Number(process.env.POC_FRAMES || 10)
const CW = Number(process.env.POC_WIDTH || 3840)
const CH = Number(process.env.POC_HEIGHT || 2160)

const userData = path.join(__dirname, 'out', 'userData-canvas')
fs.mkdirSync(userData, { recursive: true })
app.setPath('userData', userData)

function log(line) {
  fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${line}\n`)
}

function timeout(ms, label) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms))
}

app.whenReady().then(async () => {
  fs.mkdirSync(framesDir, { recursive: true })
  fs.writeFileSync(logFile, '')
  try {
    log('window create')
    const win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 720,
      paintWhenInitiallyHidden: true,
      webPreferences: { backgroundThrottling: false }
    })
    win.webContents.on('console-message', (_event, level, message) => log(`renderer[${level}] ${message}`))
    log('load begin')
    await Promise.race([
      win.loadFile(path.join(root, 'canvas-stage.html'), { query: { w: String(CW), h: String(CH) } }),
      timeout(60000, 'loadFile')
    ])
    log('load done')
    await new Promise((resolve) => setTimeout(resolve, 2000))
    log('canvas page ready (fixed wait)')

    const frames = []
    const started = Date.now()
    for (let i = 0; i < FRAMES; i++) {
      const t = i / FPS
      const frame = await win.webContents.executeJavaScript(`window.frame(${t})`)
      const base64 = frame.dataUrl.split(',')[1]
      fs.writeFileSync(path.join(framesDir, `${String(i).padStart(6, '0')}.jpg`), Buffer.from(base64, 'base64'))
      frames.push({ seekMs: frame.seekMs, drawMs: frame.drawMs, encodeMs: frame.encodeMs, totalMs: frame.seekMs + frame.drawMs + frame.encodeMs })
      if (i % 10 === 0) log(`frame ${i} ${frames[frames.length - 1].totalMs.toFixed(1)} ms`)
    }
    const elapsed = Date.now() - started
    const avg = frames.reduce((sum, f) => sum + f.totalMs, 0) / frames.length
    const sorted = frames.map((f) => f.totalMs).sort((a, b) => a - b)
    const result = {
      mode: 'canvas',
      width: CW,
      height: CH,
      frames: FRAMES,
      elapsedMs: elapsed,
      avgMs: Math.round(avg * 10) / 10,
      p50Ms: Math.round(sorted[Math.floor(sorted.length * 0.5)] * 10) / 10,
      p95Ms: Math.round(sorted[Math.floor(sorted.length * 0.95)] * 10) / 10,
      maxMs: Math.round(sorted[sorted.length - 1] * 10) / 10,
      avgSeekMs: Math.round((frames.reduce((s, f) => s + f.seekMs, 0) / frames.length) * 10) / 10,
      avgDrawMs: Math.round((frames.reduce((s, f) => s + f.drawMs, 0) / frames.length) * 10) / 10,
      avgEncodeMs: Math.round((frames.reduce((s, f) => s + f.encodeMs, 0) / frames.length) * 10) / 10,
      rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      realtimeRatio: Math.round((FRAMES / FPS) / (elapsed / 1000) * 100) / 100
    }
    fs.writeFileSync(resultFile, JSON.stringify(result, null, 2))
    log(`result ${JSON.stringify(result)}`)
    win.destroy()
    app.quit()
  } catch (error) {
    log(`ERROR ${error.stack || error.message}`)
    fs.writeFileSync(resultFile, JSON.stringify({ error: String(error.stack || error.message) }, null, 2))
    app.quit()
  }
})
