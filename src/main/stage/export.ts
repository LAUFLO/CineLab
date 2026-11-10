import { BrowserWindow } from 'electron'
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { Writable } from 'node:stream'
import type {
  StageExportInput,
  StageExportProgress,
  StageExportResult
} from '@shared/ipc-contract'
import {
  previewSizeForShot,
  stagePreviewFrameCount
} from '@shared/stage-preview'
import { ingestAsset } from '../assets/ingest'
import { ffmpegBinary } from '../media/ffmpeg'
import { loadStageFile } from './storage'

function writeFrame(stdin: Writable, buffer: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => {
      stdin.off('drain', onDrain)
      reject(error)
    }
    const onDrain = (): void => {
      stdin.off('error', onError)
      resolve()
    }
    stdin.once('error', onError)
    if (stdin.write(buffer)) {
      stdin.off('error', onError)
      resolve()
    } else {
      stdin.once('drain', onDrain)
    }
  })
}

function startFfmpeg(args: string[]): {
  stdin: Writable
  done: Promise<void>
  kill: () => void
} {
  const child = spawn(ffmpegBinary(), args, {
    windowsHide: true,
    stdio: ['pipe', 'ignore', 'pipe']
  })

  let stderr = ''
  child.stderr?.setEncoding('utf8')
  child.stderr?.on('data', (chunk: string) => {
    stderr += chunk
    if (stderr.length > 20000) stderr = stderr.slice(-20000)
  })

  const done = new Promise<void>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg 失败（退出码 ${code}）：${stderr.slice(-800)}`))
    })
  })

  if (!child.stdin) throw new Error('无法创建 ffmpeg 输入管道')
  return {
    stdin: child.stdin,
    done,
    kill: () => {
      child.kill()
    }
  }
}

export async function exportStagePreview(
  projectRoot: string,
  input: StageExportInput,
  onProgress: (progress: StageExportProgress) => void
): Promise<StageExportResult> {
  const doc = await loadStageFile(projectRoot, input.stageId)
  if (!doc) throw new Error('场景文件不存在')

  const shot = doc.shots.find((item) => item.id === input.shotId)
  if (!shot) throw new Error('镜头不存在')
  if (!doc.cameras.some((camera) => camera.id === shot.cameraId)) {
    throw new Error('镜头引用的机位不存在')
  }

  const size = previewSizeForShot(shot, input.resolution)
  const fps = input.fps === 30 ? 30 : 24
  const total = stagePreviewFrameCount(shot.durationMs, fps)
  const durationSeconds = shot.durationMs / 1000

  const exportsDir = join(projectRoot, 'exports')
  const fileName = `白模预演-${Date.now()}.mp4`
  const output = join(exportsDir, fileName)

  const win = new BrowserWindow({
    show: false,
    width: size.width,
    height: size.height,
    webPreferences: {
      backgroundThrottling: false,
      offscreen: false,
      webgl: true,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  const url = devUrl
    ? `${devUrl}/stage-render.html`
    : `file://${join(__dirname, '../renderer/stage-render.html').replace(/\\/g, '/')}`

  try {
    await fs.mkdir(exportsDir, { recursive: true })
    await win.loadURL(url)
    await win.webContents.executeJavaScript(
      `window.__setStagePreview(${JSON.stringify({
        doc,
        shotId: shot.id,
        width: size.width,
        height: size.height
      })})`
    )
    await new Promise((resolve) => setTimeout(resolve, 80))

    const ffmpeg = startFfmpeg([
      '-y',
      '-f',
      'image2pipe',
      '-framerate',
      String(fps),
      '-i',
      '-',
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '18',
      '-pix_fmt',
      'yuv420p',
      '-t',
      durationSeconds.toFixed(3),
      '-movflags',
      '+faststart',
      output
    ])

    try {
      for (let index = 0; index < total; index += 1) {
        const timeMs = (index * 1000) / fps
        const dataUrl = await win.webContents.executeJavaScript(
          `window.__renderStageFrame(${timeMs})`
        )
        const base64 = String(dataUrl).split(',')[1] ?? ''
        if (!base64) throw new Error('渲染帧为空')
        await writeFrame(ffmpeg.stdin, Buffer.from(base64, 'base64'))

        if (index % 10 === 0 || index === total - 1) {
          onProgress({
            stageId: input.stageId,
            shotId: input.shotId,
            frame: index + 1,
            total,
            stage: 'rendering'
          })
        }
      }

      ffmpeg.stdin.end()
      onProgress({
        stageId: input.stageId,
        shotId: input.shotId,
        frame: total,
        total,
        stage: 'encoding'
      })
      await ffmpeg.done
    } catch (error) {
      ffmpeg.kill()
      ffmpeg.stdin.destroy()
      await ffmpeg.done.catch(() => undefined)
      throw error
    }

    const data = await fs.readFile(output)
    if (data.length === 0) throw new Error('导出的视频为空')

    const asset = await ingestAsset({
      projectPath: projectRoot,
      data,
      kind: 'video',
      mime: 'video/mp4',
      model: '导演台白模',
      width: size.width,
      height: size.height
    })

    onProgress({
      stageId: input.stageId,
      shotId: input.shotId,
      frame: total,
      total,
      stage: 'done'
    })

    return { asset, path: `exports/${fileName}` }
  } catch (error) {
    await fs.rm(output, { force: true }).catch(() => undefined)
    throw error
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}
