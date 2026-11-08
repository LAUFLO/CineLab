const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const outDir = path.join(__dirname, 'out')
const logFile = path.join(outDir, 'cdp.log')

function log(line) {
  fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${line}\n`)
}

function timeout(ms, label) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms))
}

app.whenReady().then(async () => {
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(logFile, '')
  try {
    const win = new BrowserWindow({
      show: false,
      width: 1920,
      height: 1080,
      webPreferences: { backgroundThrottling: false }
    })
    await win.loadFile(path.join(__dirname, 'stage.html'))
    log('loaded')
    await win.webContents.executeJavaScript(
      `document.documentElement.style.setProperty('--stage-w','3840px');document.documentElement.style.setProperty('--stage-h','2160px')`
    )
    await new Promise((resolve) => setTimeout(resolve, 800))
    log('page resized')
    const dbg = win.webContents.debugger
    dbg.attach('1.3')
    log('attached')
    const started = Date.now()
    const shot = await Promise.race([
      dbg.sendCommand('Page.captureScreenshot', {
        format: 'jpeg',
        quality: 90,
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: 3840, height: 2160, scale: 1 }
      }),
      timeout(30000, 'screenshot')
    ])
    const bytes = Buffer.from(shot.data, 'base64')
    fs.writeFileSync(path.join(outDir, 'cdp-test.jpg'), bytes)
    log(`screenshot ok ${bytes.length} bytes in ${Date.now() - started} ms`)
    win.destroy()
    app.quit()
  } catch (error) {
    log(`ERROR ${error.stack || error.message}`)
    app.quit()
  }
})
