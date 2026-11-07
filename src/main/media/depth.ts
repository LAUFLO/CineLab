import { app } from 'electron'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { DepthCaptureRequest, DepthCaptureResult } from '@shared/media'
import { ingestAsset } from '../assets/ingest'
import { componentDirectory, isComponentInstalled } from '../components/service'
import { MODEL_FILE } from '../components/installer'
import { ffmpegBinary, probeMedia } from './ffmpeg'
import { resolveMediaPath } from './paths'

// CPU 推理的峰值内存由处理短边决定，与帧数关系不大。
// 364 -> 约 7.2GB / 97 帧，280 -> 约 4.1GB，238 -> 约 2.6GB。
const QUALITY = {
  fast: { longEdge: 854, inputSize: 238 },
  standard: { longEdge: 1280, inputSize: 280 },
  long: { longEdge: 854, inputSize: 238 }
} as const

const MAX_SECONDS = 30

export interface DepthCaptureOptions {
  onProgress?: (percent: number, message?: string) => void
  signal?: AbortSignal
}

export async function captureDepth(
  projectRoot: string,
  input: DepthCaptureRequest,
  options: DepthCaptureOptions = {}
): Promise<DepthCaptureResult> {
  const absolute = await resolveMediaPath(projectRoot, input.path)
  const probe = await probeMedia(absolute)

  if (!probe.width || !probe.height || !probe.duration) {
    throw new Error('无法读取视频尺寸或时长')
  }
  if (probe.duration > MAX_SECONDS) {
    throw new Error(`深度动作捕捉最长支持 ${MAX_SECONDS} 秒`)
  }

  const [runtimeReady, modelReady] = await Promise.all([
    isComponentInstalled('depth-runtime'),
    isComponentInstalled('depth-model')
  ])
  if (!runtimeReady || !modelReady) {
    throw new Error('深度组件未安装，请先在设置中下载')
  }

  const quality = QUALITY[input.quality ?? 'fast']
  const runtimeDir = componentDirectory('depth-runtime')
  const modelDir = componentDirectory('depth-model')
  const python =
    process.platform === 'win32'
      ? join(runtimeDir, 'python', 'python.exe')
      : join(runtimeDir, 'python', 'bin', 'python3')
  const worker =
    process.env.CINELAB_DEPTH_WORKER ?? join(runtimeDir, 'worker.py')
  const vdaDir = runtimeDir
  const checkpoint = join(modelDir, MODEL_FILE)

  const output = join(app.getPath('temp'), `cinelab-depth-${randomUUID()}.mp4`)

  try {
    await runWorker(python, worker, {
      input: absolute,
      output,
      longEdge: quality.longEdge,
      fps: input.fps ?? 0,
      inputSize: quality.inputSize,
      checkpoint,
      vdaDir,
      ffmpeg: ffmpegBinary(),
      maxFrames: Math.round(MAX_SECONDS * 30),
      onProgress: options.onProgress,
      signal: options.signal
    })

    const data = await fs.readFile(output)
    const asset = await ingestAsset({
      projectPath: projectRoot,
      data,
      kind: 'video',
      mime: 'video/mp4',
      model: '深度动作捕捉'
    })

    return {
      asset,
      width: probe.width,
      height: probe.height,
      duration: probe.duration,
      frames: Math.round(probe.duration * (input.fps || 24))
    }
  } finally {
    await fs.rm(output, { force: true }).catch(() => undefined)
  }
}

interface WorkerOptions {
  input: string
  output: string
  longEdge: number
  fps: number
  inputSize: number
  checkpoint: string
  vdaDir: string
  ffmpeg: string
  maxFrames: number
  onProgress?: (percent: number, message?: string) => void
  signal?: AbortSignal
}

function runWorker(
  python: string,
  worker: string,
  options: WorkerOptions
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      worker,
      '--input',
      options.input,
      '--output',
      options.output,
      '--long-edge',
      String(options.longEdge),
      '--fps',
      String(options.fps),
      '--input-size',
      String(options.inputSize),
      '--checkpoint',
      options.checkpoint,
      '--vda-dir',
      options.vdaDir,
      '--ffmpeg',
      options.ffmpeg,
      '--max-frames',
      String(options.maxFrames)
    ]

    const child = spawn(python, args, {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUNBUFFERED: '1'
      }
    })

    let settled = false
    let stderr = ''

    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      options.signal?.removeEventListener('abort', onAbort)
      if (error) reject(error)
      else resolve()
    }

    const onAbort = (): void => {
      if (child.pid) killTree(child.pid)
      finish(new Error('已取消'))
    }

    if (options.signal?.aborted) {
      onAbort()
      return
    }
    options.signal?.addEventListener('abort', onAbort)

    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      for (const line of chunk.split(/\r?\n/)) {
        if (!line.trim()) continue
        try {
          const event = JSON.parse(line) as {
            stage?: string
            percent?: number
            message?: string
          }
          if (event.stage === 'error') {
            finish(new Error(event.message || '深度处理失败'))
            return
          }
          if (typeof event.percent === 'number') {
            options.onProgress?.(event.percent, event.message)
          }
        } catch {
          // worker 可能输出非 JSON 行，忽略
        }
      }
    })

    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk
      if (stderr.length > 20000) stderr = stderr.slice(-20000)
    })

    child.on('error', (error) => finish(error))
    child.on('close', (code) => {
      if (code === 0) {
        finish()
        return
      }
      finish(
        new Error(stderr.trim() || `深度处理失败（退出码 ${code}）`)
      )
    })
  })
}

function killTree(pid: number): void {
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore'
    })
    return
  }
  try {
    process.kill(pid, 'SIGKILL')
  } catch {
    // 进程可能已经退出
  }
}
