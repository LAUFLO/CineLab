import { app, BrowserWindow } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type {
  ComponentEvent,
  ComponentKind,
  ComponentManifest,
  ComponentStatus,
  ComponentUpdateInfo
} from '@shared/components'
import { COMPONENTS, COMPONENT_KINDS, fetchManifest } from './manifest'
import { downloadFile } from './downloader'
import { installComponentFiles, MODEL_FILES } from './installer'

interface RuntimeState {
  state: ComponentStatus['state']
  version?: number
  receivedBytes?: number
  totalBytes?: number
  error?: string
  controller?: AbortController
}

interface UpdateCache {
  at: number
  items: ComponentUpdateInfo[]
}

const states = new Map<ComponentKind, RuntimeState>()
const UPDATE_TTL_MS = 24 * 60 * 60 * 1000
let updateCache: UpdateCache | null = null

export function componentsRoot(): string {
  return join(app.getPath('userData'), 'components')
}

export function componentDirectory(kind: ComponentKind): string {
  return join(componentsRoot(), COMPONENTS[kind].directory)
}

async function readInstalled(kind: ComponentKind): Promise<ComponentManifest | null> {
  try {
    const dir = componentDirectory(kind)
    const raw = JSON.parse(
      await fs.readFile(join(dir, 'manifest.json'), 'utf8')
    ) as ComponentManifest
    const modelFile = MODEL_FILES[kind]
    const whisperBinary =
      process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'
    const pythonBinary =
      process.platform === 'win32'
        ? join(dir, 'python', 'python.exe')
        : join(dir, 'python', 'bin', 'python3')
    const required = modelFile
      ? join(dir, modelFile)
      : kind === 'whisper-runtime'
        ? join(dir, 'Release', whisperBinary)
        : kind === 'vision-models'
          ? join(dir, 'models', 'big-lama.pt')
          : pythonBinary
    await fs.stat(required)
    if (kind === 'vision-models') {
      // worker.py / inspyrenet 已移到应用侧；组件只需模型权重。
      // 兼容 v1（仍带 worker.py/inspyrenet）和未来的 models-only v2。
      await fs.stat(join(dir, 'models', 'ckpt_fast.pth'))
      await fs.stat(join(dir, 'models', 'big-lama.pt'))
    }
    return raw
  } catch {
    return null
  }
}

function updateCachePath(): string {
  return join(componentsRoot(), 'updates.json')
}

async function readUpdateCache(): Promise<UpdateCache | null> {
  try {
    const raw = JSON.parse(
      await fs.readFile(updateCachePath(), 'utf8')
    ) as { at?: unknown; items?: unknown }
    if (typeof raw.at !== 'number' || !Array.isArray(raw.items)) return null
    const items = raw.items.filter((item): item is ComponentUpdateInfo => {
      if (!item || typeof item !== 'object') return false
      const entry = item as Partial<ComponentUpdateInfo>
      return (
        typeof entry.updateAvailable === 'boolean' &&
        typeof entry.kind === 'string' &&
        Object.hasOwn(COMPONENTS, entry.kind)
      )
    })
    return items.length === raw.items.length ? { at: raw.at, items } : null
  } catch {
    return null
  }
}

async function writeUpdateCache(cache: UpdateCache): Promise<void> {
  try {
    await fs.mkdir(componentsRoot(), { recursive: true })
    await fs.writeFile(
      updateCachePath(),
      JSON.stringify(cache, null, 2),
      'utf8'
    )
  } catch {
    // 缓存写入失败不影响本次检查结果。
  }
}

async function clearUpdateCache(): Promise<void> {
  updateCache = null
  await fs.rm(updateCachePath(), { force: true }).catch(() => undefined)
}

export async function listComponentStatus(): Promise<ComponentStatus[]> {
  const result: ComponentStatus[] = []
  for (const kind of COMPONENT_KINDS) {
    const definition = COMPONENTS[kind]
    const runtime = states.get(kind)
    const installed = await readInstalled(kind)
    const state = runtime?.state ?? (installed ? 'installed' : 'not-installed')
    result.push({
      kind,
      label: definition.label,
      state,
      version: installed?.version ?? runtime?.version,
      installedSize: installed?.expandedSize,
      receivedBytes: runtime?.receivedBytes,
      totalBytes: runtime?.totalBytes,
      percent: runtime?.totalBytes
        ? Math.min(
            100,
            Math.round(((runtime.receivedBytes ?? 0) / runtime.totalBytes) * 100)
          )
        : undefined,
      error: runtime?.error,
      path: installed ? componentDirectory(kind) : undefined
    })
  }
  return result
}

export async function checkComponentUpdates(
  force = false
): Promise<ComponentUpdateInfo[]> {
  if (!force) {
    updateCache ??= await readUpdateCache()
    if (updateCache && Date.now() - updateCache.at < UPDATE_TTL_MS) {
      return updateCache.items
    }
  }

  const items = await Promise.all(
    COMPONENT_KINDS.map(async (kind) => {
      const installed = await readInstalled(kind)
      if (!installed) {
        return { kind, updateAvailable: false }
      }
      const latest = await fetchManifest(COMPONENTS[kind])
      return {
        kind,
        latestVersion: latest.version,
        latestSize: latest.size,
        updateAvailable: latest.version > installed.version
      }
    })
  )

  updateCache = { at: Date.now(), items }
  await writeUpdateCache(updateCache)
  return items
}

function emit(kind: ComponentKind, event: ComponentEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('components:event', event)
    }
  }
}

export async function installComponent(kind: ComponentKind): Promise<void> {
  const definition = COMPONENTS[kind]
  const current = states.get(kind)
  if (
    current &&
    (current.state === 'downloading' ||
      current.state === 'verifying' ||
      current.state === 'installing')
  ) {
    throw new Error('组件正在安装中')
  }

  const controller = new AbortController()
  const state: RuntimeState = { state: 'downloading', controller }
  states.set(kind, state)

  try {
    emit(kind, { kind, state: 'downloading', percent: 0 })
    const manifest = await fetchManifest(definition, controller.signal)
    state.version = manifest.version
    state.totalBytes = manifest.size
    emit(kind, {
      kind,
      state: 'downloading',
      percent: 0,
      totalBytes: manifest.size
    })

    const downloadDir = join(componentsRoot(), '.downloads')
    const modelFile = MODEL_FILES[kind]
    const fileName =
      modelFile ?? `${definition.directory}-${manifest.version}.zip`
    const downloadPath = join(downloadDir, fileName)

    await downloadFile({
      urls: manifest.urls,
      destination: downloadPath,
      expectedSha256: manifest.sha256 || undefined,
      signal: controller.signal,
      onProgress: (received, total) => {
        state.receivedBytes = received
        state.totalBytes = total || manifest.size
        emit(kind, {
          kind,
          state: 'downloading',
          receivedBytes: received,
          totalBytes: state.totalBytes,
          percent: state.totalBytes
            ? Math.min(100, Math.round((received / state.totalBytes) * 100))
            : 0
        })
      }
    })

    if (controller.signal.aborted) {
      throw Object.assign(new Error('已暂停'), { name: 'AbortError' })
    }

    state.state = 'installing'
    state.receivedBytes = undefined
    emit(kind, { kind, state: 'installing', percent: 100 })

    await installComponentFiles(
      kind,
      downloadPath,
      componentDirectory(kind),
      manifest
    )
    await fs.rm(downloadPath, { force: true }).catch(() => undefined)

    state.state = 'installed'
    state.totalBytes = undefined
    state.error = undefined
    await clearUpdateCache()
    emit(kind, { kind, state: 'installed', percent: 100 })
  } catch (error) {
    if (controller.signal.aborted) {
      state.state = 'paused'
      state.controller = undefined
      emit(kind, { kind, state: 'paused' })
      return
    }
    state.state = 'error'
    state.controller = undefined
    state.error = error instanceof Error ? error.message : String(error)
    emit(kind, { kind, state: 'error', error: state.error })
    throw error
  }
}

export async function pauseComponent(kind: ComponentKind): Promise<void> {
  states.get(kind)?.controller?.abort()
}

export async function removeComponent(kind: ComponentKind): Promise<void> {
  states.get(kind)?.controller?.abort()
  states.delete(kind)

  await fs.rm(componentDirectory(kind), { recursive: true, force: true })
  await clearUpdateCache()

  const downloadDir = join(componentsRoot(), '.downloads')
  const files = await fs.readdir(downloadDir).catch(() => [] as string[])
  await Promise.all(
    files
      .filter((file) => file.startsWith(COMPONENTS[kind].directory))
      .map((file) =>
        fs.rm(join(downloadDir, file), { force: true }).catch(() => undefined)
      )
  )

  emit(kind, { kind, state: 'not-installed' })
}

export async function isComponentInstalled(kind: ComponentKind): Promise<boolean> {
  return (await readInstalled(kind)) !== null
}
