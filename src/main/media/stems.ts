import { app } from 'electron'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { GeneratedAsset } from '@shared/generation'
import type { StemMode, StemTaskResult } from '@shared/media'
import { ingestAsset } from '../assets/ingest'
import { componentDirectory, isComponentInstalled } from '../components/service'
import { log } from '../logger'
import { probeMedia, runFfmpeg } from './ffmpeg'
import { resolveMediaPath } from './paths'
import { killProcessTree, pythonBinary } from './process'
import { withTempDir } from './temp'
import { extractSilentVideo } from './video'

const MAX_FULL_SECONDS = 600
const CACHE_LIMIT = 2
const MODEL_SHA =
  '8726e21a993978c7ba086d3872e7608d7d5bfca646ca4aca459ffda844faa8b4'

export interface StemOptions {
  signal?: AbortSignal
  onProgress?: (percent: number, message?: string) => void
}

interface StemCacheEntry {
  dir: string
  vocals: string
  background: string
}

const cache = new Map<string, StemCacheEntry>()
let cacheInitialized: Promise<void> | null = null

function tempRoot(): string {
  return app.getPath('temp')
}

function cacheRoot(): string {
  return join(tempRoot(), `cinelab-stem-cache-${process.pid}`)
}

async function initCache(): Promise<void> {
  if (!cacheInitialized) {
    cacheInitialized = (async () => {
      const root = cacheRoot()
      await fs.mkdir(root, { recursive: true })

      // 清理异常退出留下的旧会话缓存；24 小时内的目录可能属于另一个实例，先不碰。
      const entries = await fs.readdir(tempRoot()).catch(() => [] as string[])
      const cutoff = Date.now() - 24 * 60 * 60 * 1000
      await Promise.all(
        entries
          .filter(
            (name) =>
              name.startsWith('cinelab-stem-cache-') &&
              name !== `cinelab-stem-cache-${process.pid}`
          )
          .map(async (name) => {
            const dir = join(tempRoot(), name)
            const stat = await fs.stat(dir).catch(() => null)
            if (!stat || stat.mtimeMs < cutoff) {
              await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)
            }
          })
      )
    })()
  }
  await cacheInitialized
}

async function cacheKey(absolute: string): Promise<string> {
  const stat = await fs.stat(absolute)
  return createHash('sha1')
    .update(`${absolute}|${stat.size}|${stat.mtimeMs}|${MODEL_SHA}`)
    .digest('hex')
}

function rememberCache(key: string, entry: StemCacheEntry): void {
  cache.set(key, entry)
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    if (!oldest) break
    const removed = cache.get(oldest)
    cache.delete(oldest)
    if (removed) {
      void fs.rm(removed.dir, { recursive: true, force: true }).catch(() => undefined)
    }
  }
}

async function readCache(key: string): Promise<StemCacheEntry | null> {
  const entry = cache.get(key)
  if (!entry) return null
  try {
    await fs.access(entry.vocals)
    await fs.access(entry.background)
    // 命中后移动到 LRU 末尾。
    cache.delete(key)
    cache.set(key, entry)
    return entry
  } catch {
    cache.delete(key)
    return null
  }
}

export async function disposeStemCache(): Promise<void> {
  cache.clear()
  cacheInitialized = null
  await fs.rm(cacheRoot(), { recursive: true, force: true }).catch(() => undefined)
}

async function ensureComponents(): Promise<void> {
  const [runtime, model] = await Promise.all([
    isComponentInstalled('depth-runtime'),
    isComponentInstalled('stem-model')
  ])

  if (!runtime) {
    throw new Error(
      '人声分离需要「本地 AI 运行时」，请先在 设置 → 模型与运行时 → 组件 中安装'
    )
  }
  if (!model) {
    throw new Error(
      '人声分离需要「HTDemucs 人声分离模型」（约 84MB），请先在 设置 → 模型与运行时 → 组件 中安装'
    )
  }
}

function workerDirectory(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'stem-worker')
    : join(app.getAppPath(), 'resources', 'stem-worker')
}

interface WorkerOutput {
  percent?: number
  stage?: string
  message?: string
}

function runStemWorker(
  input: string,
  vocals: string,
  background: string,
  options: StemOptions
): Promise<void> {
  return new Promise((resolve, reject) => {
    const worker = join(workerDirectory(), 'worker.py')
    const model = join(componentDirectory('stem-model'), 'htdemucs.th')
    const child = spawn(
      pythonBinary(),
      [
        worker,
        '--input',
        input,
        '--vocals',
        vocals,
        '--background',
        background,
        '--model',
        model,
        '--max-full-seconds',
        String(MAX_FULL_SECONDS)
      ],
      {
        cwd: workerDirectory(),
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          PYTHONUNBUFFERED: '1'
        }
      }
    )

    let settled = false
    let stdoutBuffer = ''
    let stderr = ''
    let lastPercent = 15

    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      options.signal?.removeEventListener('abort', onAbort)
      if (error) reject(error)
      else resolve()
    }

    const onAbort = (): void => {
      if (child.pid) killProcessTree(child.pid)
      finish(new Error('已取消'))
    }

    if (options.signal?.aborted) {
      onAbort()
      return
    }
    options.signal?.addEventListener('abort', onAbort)

    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      stdoutBuffer += chunk
      const lines = stdoutBuffer.split(/\r?\n/)
      stdoutBuffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const event = JSON.parse(line) as WorkerOutput
          if (event.stage === 'error') {
            finish(new Error(event.message || '人声分离失败'))
            return
          }
          if (event.stage === 'progress' && typeof event.percent === 'number') {
            const mapped =
              15 + Math.max(0, Math.min(100, event.percent)) * 0.75
            lastPercent = Math.max(lastPercent, mapped)
            options.onProgress?.(lastPercent, '分离中')
          }
        } catch {
          // 模型库偶尔会输出普通日志，忽略非 JSON 行。
        }
      }
    })

    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk
      if (stderr.length > 20_000) stderr = stderr.slice(-20_000)
    })

    child.on('error', (error) => finish(error))
    child.on('close', (code) => {
      if (options.signal?.aborted) {
        finish(new Error('已取消'))
        return
      }
      if (code === 0) {
        finish()
        return
      }
      log.error('stem worker failed', {
        code,
        stderr: stderr.slice(-1200)
      })
      finish(
        new Error(
          `人声分离进程失败（退出码 ${code}）${
            stderr.trim() ? `：${stderr.slice(-500)}` : ''
          }`
        )
      )
    })
  })
}

function decodeAudio(absolute: string, output: string, options: StemOptions): Promise<void> {
  return runFfmpeg(
    [
      '-y',
      '-i',
      absolute,
      '-vn',
      '-ac',
      '2',
      '-ar',
      '44100',
      '-c:a',
      'pcm_s16le',
      output
    ],
    { signal: options.signal }
  )
}

async function encodeAudio(
  input: string,
  output: string,
  options: StemOptions
): Promise<void> {
  await runFfmpeg(
    [
      '-y',
      '-i',
      input,
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-movflags',
      '+faststart',
      output
    ],
    { signal: options.signal }
  )
}

async function ingestStem(
  projectRoot: string,
  path: string,
  mode: StemMode
): Promise<GeneratedAsset> {
  return ingestAsset({
    projectPath: projectRoot,
    data: await fs.readFile(path),
    kind: 'audio',
    mime: 'audio/mp4',
    model: mode === 'vocal' ? '本地分离（人声）' : '本地分离（背景音）'
  })
}

async function ensureStemFiles(
  absolute: string,
  key: string,
  options: StemOptions
): Promise<StemCacheEntry> {
  await initCache()

  const cached = await readCache(key)
  if (cached) {
    options.onProgress?.(30, '复用已分离结果')
    return cached
  }

  const dir = join(cacheRoot(), key)
  const entry: StemCacheEntry = {
    dir,
    vocals: join(dir, 'vocals.wav'),
    background: join(dir, 'background.wav')
  }

  await fs.rm(dir, { recursive: true, force: true })
  await fs.mkdir(dir, { recursive: true })

  try {
    await withTempDir('cinelab-stem-input', async (temp) => {
      const input = join(temp, 'input.wav')
      options.onProgress?.(10, '解码音频')
      await decodeAudio(absolute, input, options)
      options.onProgress?.(15, '加载模型')
      await runStemWorker(input, entry.vocals, entry.background, options)
    })
    rememberCache(key, entry)
    return entry
  } catch (error) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}

export async function separateStems(
  projectRoot: string,
  request: { path: string; mode: StemMode; sourceKind?: 'video' | 'audio' },
  options: StemOptions = {}
): Promise<StemTaskResult> {
  await ensureComponents()

  const absolute = await resolveMediaPath(projectRoot, request.path)
  const probe = await probeMedia(absolute)

  if (!probe.hasAudio) {
    throw new Error(
      request.mode === 'vocal' ? '当前素材无音轨，无法提取人声' : '当前素材无音轨，无法提取背景音'
    )
  }

  options.onProgress?.(2, '准备素材')

  const hasVideo =
    request.sourceKind !== undefined
      ? request.sourceKind === 'video'
      : Boolean(probe.width && probe.height)

  let video: GeneratedAsset | null = null
  if (hasVideo) {
    options.onProgress?.(5, '提取无声视频')
    video = await extractSilentVideo(projectRoot, absolute)
  }

  const key = await cacheKey(absolute)
  const entry = await ensureStemFiles(absolute, key, options)
  const source = request.mode === 'vocal' ? entry.vocals : entry.background

  options.onProgress?.(92, '编码音频')
  const encoded = join(entry.dir, `${request.mode}.m4a`)
  await encodeAudio(source, encoded, options)
  options.onProgress?.(97, '写入素材')
  const audio = await ingestStem(projectRoot, encoded, request.mode)
  await fs.rm(encoded, { force: true }).catch(() => undefined)
  options.onProgress?.(100, '完成')

  return { video, audio }
}
