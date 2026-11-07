import { app } from 'electron'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type {
  VisionTaskRequest,
  VisionTaskResult,
  VisionRect
} from '@shared/media'
import { ingestAsset } from '../assets/ingest'
import { componentDirectory, isComponentInstalled } from '../components/service'
import { log } from '../logger'
import { ffmpegBinary, probeMedia } from './ffmpeg'
import { resolveMediaPath } from './paths'

const MAX_VIDEO_SECONDS = 10
const MAX_VIDEO_EDGE = 480

export interface VisionOptions {
  onProgress?: (percent: number, message?: string) => void
  signal?: AbortSignal
}

function pythonBinary(): string {
  const root = componentDirectory('depth-runtime')
  return process.platform === 'win32'
    ? join(root, 'python', 'python.exe')
    : join(root, 'python', 'bin', 'python3')
}

async function ensureReady(): Promise<void> {
  const [runtime, vision] = await Promise.all([
    isComponentInstalled('depth-runtime'),
    isComponentInstalled('vision-models')
  ])

  if (!runtime) {
    throw new Error('视觉功能需要深度动作捕捉运行时，请先在设置 → 组件中安装')
  }
  if (!vision) {
    throw new Error('视觉模型未安装，请先在设置 → 组件中下载「视觉模型（InSPyReNet + LaMa）」')
  }
}

function even(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2)
}

function targetSize(
  width: number,
  height: number,
  ratio: NonNullable<VisionTaskRequest['ratio']>
): { width: number; height: number } {
  const [rw, rh] = ratio.split(':').map(Number)
  const targetRatio = rw / rh
  let nextWidth = width
  let nextHeight = height

  if (width / height > targetRatio) {
    nextHeight = Math.round(width / targetRatio)
  } else {
    nextWidth = Math.round(height * targetRatio)
  }

  const maxEdge = Math.max(nextWidth, nextHeight)
  if (maxEdge > 2048) {
    const scale = 2048 / maxEdge
    nextWidth = Math.round(nextWidth * scale)
    nextHeight = Math.round(nextHeight * scale)
  }

  return {
    width: Math.max(16, even(nextWidth)),
    height: Math.max(16, even(nextHeight))
  }
}

function parseMaskDataUrl(dataUrl: string): Buffer {
  const match = /^data:image\/png;base64,(.+)$/s.exec(dataUrl)
  if (!match) throw new Error('蒙版格式无效')
  return Buffer.from(match[1], 'base64')
}

interface WorkerRun {
  code: number
  result: Record<string, unknown> | null
}

function runWorker(
  args: string[],
  options: VisionOptions
): Promise<WorkerRun> {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonBinary(), args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUNBUFFERED: '1'
      }
    })

    let settled = false
    let stderr = ''
    let result: Record<string, unknown> | null = null

    const finish = (error?: Error, code = -1): void => {
      if (settled) return
      settled = true
      options.signal?.removeEventListener('abort', onAbort)
      if (error) reject(error)
      else resolve({ code, result })
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
            output?: string
          }
          if (event.stage === 'error') {
            finish(new Error(event.message || '视觉处理失败'))
            return
          }
          if (event.stage === 'done') {
            result = event as Record<string, unknown>
            continue
          }
          if (typeof event.percent === 'number') {
            options.onProgress?.(event.percent, event.message)
          }
        } catch {
          // worker 也可能输出非 JSON 行
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
        finish(undefined, code)
        return
      }
      log.error('vision worker failed', {
        code,
        stderr: stderr.slice(-2000)
      })
      finish(
        new Error(stderr.trim() || `视觉处理失败（退出码 ${code}）`)
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

function baseArgs(task: string, models: string): string[] {
  const worker = join(componentDirectory('vision-models'), 'worker.py')
  return [worker, '--task', task, '--models', models]
}

function rectArgs(rect: VisionRect): string[] {
  return [
    '--x',
    String(rect.x),
    '--y',
    String(rect.y),
    '--rect-width',
    String(rect.width),
    '--rect-height',
    String(rect.height)
  ]
}

export async function runVisionTask(
  projectRoot: string,
  request: VisionTaskRequest,
  options: VisionOptions = {}
): Promise<VisionTaskResult> {
  await ensureReady()

  const visionDir = componentDirectory('vision-models')
  const models = join(visionDir, 'models')
  const input = await resolveMediaPath(projectRoot, request.path, request.scope)
  const probe = await probeMedia(input)
  const tempDir = join(app.getPath('temp'), `cinelab-vision-${randomUUID()}`)

  await fs.mkdir(tempDir, { recursive: true })

  try {
    if (request.kind === 'matte-image') {
      const output = join(tempDir, 'cutout.png')
      await runWorker(
        [
          ...baseArgs('matte-image', models),
          '--input',
          input,
          '--output',
          output
        ],
        options
      )
      const asset = await ingestAsset({
        projectPath: projectRoot,
        data: await fs.readFile(output),
        kind: 'image',
        mime: 'image/png',
        model: 'InSPyReNet 抠图'
      })
      return { kind: request.kind, asset, width: asset.width, height: asset.height }
    }

    if (request.kind === 'layer-split') {
      const foreground = join(tempDir, 'foreground.png')
      const background = join(tempDir, 'background.png')
      await runWorker(
        [
          ...baseArgs('layer-split', models),
          '--input',
          input,
          '--output',
          foreground,
          '--background',
          background
        ],
        options
      )
      const [frontAsset, backAsset] = await Promise.all([
        ingestAsset({
          projectPath: projectRoot,
          data: await fs.readFile(foreground),
          kind: 'image',
          mime: 'image/png',
          model: 'InSPyReNet 前景图层'
        }),
        ingestAsset({
          projectPath: projectRoot,
          data: await fs.readFile(background),
          kind: 'image',
          mime: 'image/png',
          model: 'LaMa 背景图层'
        })
      ])
      return {
        kind: request.kind,
        asset: frontAsset,
        background: backAsset,
        width: frontAsset.width,
        height: frontAsset.height
      }
    }

    if (request.kind === 'inpaint-image') {
      if (!request.mask) throw new Error('缺少蒙版')
      const maskPath = join(tempDir, 'mask.png')
      await fs.writeFile(maskPath, parseMaskDataUrl(request.mask))
      const output = join(tempDir, 'inpaint.png')
      await runWorker(
        [
          ...baseArgs('inpaint-image', models),
          '--input',
          input,
          '--mask',
          maskPath,
          '--output',
          output
        ],
        options
      )
      const asset = await ingestAsset({
        projectPath: projectRoot,
        data: await fs.readFile(output),
        kind: 'image',
        mime: 'image/png',
        model: 'LaMa 修复'
      })
      return { kind: request.kind, asset, width: asset.width, height: asset.height }
    }

    if (request.kind === 'outpaint-image') {
      if (!probe.width || !probe.height) {
        throw new Error('无法读取图片尺寸')
      }
      const size = targetSize(
        probe.width,
        probe.height,
        request.ratio ?? '1:1'
      )
      const output = join(tempDir, 'outpaint.png')
      await runWorker(
        [
          ...baseArgs('outpaint-image', models),
          '--input',
          input,
          '--output',
          output,
          '--width',
          String(size.width),
          '--height',
          String(size.height)
        ],
        options
      )
      const asset = await ingestAsset({
        projectPath: projectRoot,
        data: await fs.readFile(output),
        kind: 'image',
        mime: 'image/png',
        model: 'LaMa 扩图'
      })
      return { kind: request.kind, asset, width: asset.width, height: asset.height }
    }

    if (request.kind === 'matte-video') {
      if (!probe.width || !probe.height || !probe.duration) {
        throw new Error('无法读取视频尺寸或时长')
      }
      if (probe.duration > MAX_VIDEO_SECONDS + 0.1) {
        throw new Error(`视频抠像最长支持 ${MAX_VIDEO_SECONDS} 秒`)
      }
      const scale = Math.min(1, MAX_VIDEO_EDGE / Math.max(probe.width, probe.height))
      const width = even(probe.width * scale)
      const height = even(probe.height * scale)
      const fps = probe.fps && probe.fps > 0 ? probe.fps : 24
      const frames = Math.max(1, Math.round(probe.duration * fps))
      const output = join(tempDir, 'matte.webm')

      await runWorker(
        [
          ...baseArgs('matte-video', models),
          '--input',
          input,
          '--output',
          output,
          '--ffmpeg',
          ffmpegBinary(),
          '--width',
          String(width),
          '--height',
          String(height),
          '--fps',
          String(fps),
          '--frames',
          String(frames)
        ],
        options
      )

      const asset = await ingestAsset({
        projectPath: projectRoot,
        data: await fs.readFile(output),
        kind: 'video',
        mime: 'video/webm',
        model: 'InSPyReNet 视频抠像'
      })
      return {
        kind: request.kind,
        asset,
        width,
        height,
        frames
      }
    }

    if (request.kind === 'repair-video') {
      if (!probe.width || !probe.height || !probe.duration) {
        throw new Error('无法读取视频尺寸或时长')
      }
      if (!request.rect) throw new Error('缺少修复区域')
      if (probe.duration > MAX_VIDEO_SECONDS + 0.1) {
        throw new Error(`视频修复最长支持 ${MAX_VIDEO_SECONDS} 秒`)
      }
      const fps = probe.fps && probe.fps > 0 ? probe.fps : 24
      const frames = Math.max(1, Math.round(probe.duration * fps))
      const output = join(tempDir, 'repair.mp4')

      await runWorker(
        [
          ...baseArgs('repair-video', models),
          '--input',
          input,
          '--output',
          output,
          '--ffmpeg',
          ffmpegBinary(),
          '--width',
          String(probe.width),
          '--height',
          String(probe.height),
          '--fps',
          String(fps),
          '--frames',
          String(frames),
          ...rectArgs(request.rect)
        ],
        options
      )

      const asset = await ingestAsset({
        projectPath: projectRoot,
        data: await fs.readFile(output),
        kind: 'video',
        mime: 'video/mp4',
        model: 'LaMa 视频修复'
      })
      return {
        kind: request.kind,
        asset,
        width: probe.width,
        height: probe.height,
        frames
      }
    }

    throw new Error('不支持的视觉任务')
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
  }
}
