import { app, BrowserWindow } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type {
  ComponentEvent,
  ComponentKind,
  ComponentManifest,
  ComponentStatus
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

const states = new Map<ComponentKind, RuntimeState>()

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
    const required = modelFile
      ? join(dir, modelFile)
      : kind === 'whisper-runtime'
        ? join(dir, 'Release', 'whisper-cli.exe')
        : kind === 'vision-models'
          ? join(dir, 'models', 'big-lama.pt')
          : join(dir, 'python', 'python.exe')
    await fs.stat(required)
    if (kind === 'vision-models') {
      await fs.stat(join(dir, 'worker.py'))
      await fs.stat(join(dir, 'models', 'ckpt_fast.pth'))
      await fs.stat(join(dir, 'models', 'big-lama.pt'))
      await fs.stat(
        join(dir, 'inspyrenet', 'transparent_background', '__init__.py')
      )
    }
    return raw
  } catch {
    return null
  }
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
