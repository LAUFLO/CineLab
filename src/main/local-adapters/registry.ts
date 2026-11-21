import { app, BrowserWindow } from 'electron'
import {
  existsSync,
  promises as fs,
  watch,
  type FSWatcher
} from 'node:fs'
import { basename, join } from 'node:path'
import type { ModelDef, ProviderConfig } from '@shared/provider-schema'
import type {
  LocalAdapterStatus,
  LocalAdapterStatusKind
} from '@shared/local-adapter'
import { httpFetch } from '../providers/http'
import { buildLocalAdapter } from './build'
import { LocalAdapterHost } from './host'
import {
  readLocalAdapter,
  type LocalAdapterData,
  type LocalAdapterManifest
} from './manifest'

export interface LocalProviderRuntime {
  baseUrl: string
  headers?: Record<string, string>
  apiKey: string
  models: ModelDef[]
}

interface SidecarRuntime {
  baseUrl: string
  headers?: Record<string, string>
  apiKeyEnv?: string
  health: { path: string; intervalMs: number }
  timer: NodeJS.Timeout | null
  healthy?: boolean
  version?: string
  lastCheck?: string
}

interface LocalAdapterRecord extends LocalAdapterData {
  dir: string
  status: LocalAdapterStatusKind
  error?: string
  host: LocalAdapterHost | null
  sidecar: SidecarRuntime | null
  updatedAt: string
}

const records = new Map<string, LocalAdapterRecord>()
const logBuffers = new Map<string, string[]>()
const MAX_LOG_LINES = 200
let watcher: FSWatcher | null = null
let timer: NodeJS.Timeout | null = null
let started = false

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function recordLog(id: string, message: string): void {
  const line = `${new Date().toISOString()} ${message}`
  const list = logBuffers.get(id) ?? []
  list.push(line)
  if (list.length > MAX_LOG_LINES) {
    list.splice(0, list.length - MAX_LOG_LINES)
  }
  logBuffers.set(id, list)
}

export function localAdapterLogs(
  id?: string,
  limit = 50
): Array<{ id: string; lines: string[] }> {
  const ids = id ? [id] : [...records.keys()]
  return ids.map((adapterId) => ({
    id: adapterId,
    lines: (logBuffers.get(adapterId) ?? []).slice(-limit)
  }))
}

export function localAdaptersDir(): string {
  return join(app.getPath('userData'), 'adapters')
}

function configureEsbuildBinary(): void {
  if (!app.isPackaged || process.env.ESBUILD_BINARY_PATH) return

  const platform = `${process.platform}-${process.arch}`
  const binary =
    process.platform === 'win32'
      ? 'esbuild.exe'
      : join('bin', 'esbuild')
  const path = join(
    process.resourcesPath,
    'app.asar.unpacked',
    'node_modules',
    '@esbuild',
    platform,
    binary
  )
  if (existsSync(path)) process.env.ESBUILD_BINARY_PATH = path
}

function notify(): void {
  const statuses = listLocalAdapterStatuses()
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('local-adapters:changed', statuses)
    }
  }
}

export function listLocalAdapterStatuses(): LocalAdapterStatus[] {
  return [...records.values()]
    .map((record) => ({
      id: record.manifest.id,
      version: record.sidecar?.version ?? record.manifest.version,
      type: record.manifest.type,
      dir: record.dir,
      status: record.status,
      ...(record.error ? { error: record.error } : {}),
      modelCount: record.models.length,
      models: record.models.map((model) => ({
        id: model.id,
        name: model.name
      })),
      updatedAt: record.updatedAt
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

export function localAdapterProviders(): ProviderConfig[] {
  return [...records.values()]
    .filter((record) => record.models.length > 0)
    .map((record) => ({
      id:
        record.manifest.type === 'sidecar'
          ? `sidecar:${record.manifest.id}`
          : `local:${record.manifest.id}`,
      name: record.provider.name,
      type: 'openai-compat',
      baseUrl: record.provider.baseUrl,
      ...(record.provider.headers ? { headers: record.provider.headers } : {}),
      models: record.models,
      hasKey: false,
      hasSecret: false,
      createdAt: record.updatedAt,
      updatedAt: record.updatedAt
    }))
}

export function localProviderRuntime(id: string): LocalProviderRuntime | null {
  const adapterId = id.replace(/^local:/, '')
  const record = records.get(adapterId)
  if (!record || record.manifest.type === 'sidecar') return null

  return {
    baseUrl: record.provider.baseUrl,
    ...(record.provider.headers ? { headers: record.provider.headers } : {}),
    apiKey: record.provider.apiKeyEnv
      ? process.env[record.provider.apiKeyEnv] ?? ''
      : '',
    models: record.models
  }
}

export function sidecarProviderRuntime(id: string): LocalProviderRuntime | null {
  const adapterId = id.replace(/^sidecar:/, '')
  const record = records.get(adapterId)
  if (!record?.sidecar) return null

  return {
    baseUrl: record.sidecar.baseUrl,
    ...(record.sidecar.headers ? { headers: record.sidecar.headers } : {}),
    apiKey: record.sidecar.apiKeyEnv
      ? process.env[record.sidecar.apiKeyEnv] ?? ''
      : '',
    models: record.models
  }
}

/** 本地适配器声明的模型 ID，用于覆盖同名官方模型 */
export function localModelIds(): Set<string> {
  const ids = new Set<string>()
  for (const record of records.values()) {
    for (const model of record.models) ids.add(model.id)
  }
  return ids
}

export function localAdapterRecord(
  adapterId: string
): LocalAdapterRecord | undefined {
  return records.get(adapterId)
}

function isLocalHost(hostname: string): boolean {
  return (
    hostname === '127.0.0.1' ||
    hostname === 'localhost' ||
    hostname === '::1' ||
    hostname === '[::1]'
  )
}

function assertLocalBaseUrl(baseUrl: string): void {
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    throw new Error('sidecar.baseUrl 不是合法 URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('sidecar.baseUrl 只支持 http / https')
  }
  if (!isLocalHost(url.hostname)) {
    throw new Error('sidecar.baseUrl 只允许 127.0.0.1 / localhost')
  }
}

function sidecarHeaders(sidecar: SidecarRuntime): Record<string, string> {
  const headers = { ...(sidecar.headers ?? {}) }
  const key = sidecar.apiKeyEnv ? process.env[sidecar.apiKeyEnv] : undefined
  if (key && !Object.keys(headers).some((name) => name.toLowerCase() === 'authorization')) {
    headers.Authorization = `Bearer ${key}`
  }
  return headers
}

function sidecarHealthUrl(sidecar: SidecarRuntime): string {
  const base = sidecar.baseUrl.endsWith('/')
    ? sidecar.baseUrl
    : `${sidecar.baseUrl}/`
  return new URL(sidecar.health.path, base).toString()
}

async function checkSidecar(record: LocalAdapterRecord): Promise<void> {
  const sidecar = record.sidecar
  if (!sidecar) return

  const wasHealthy = sidecar.healthy
  try {
    const response = await httpFetch(sidecarHealthUrl(sidecar), {
      headers: sidecarHeaders(sidecar),
      signal: AbortSignal.timeout(3_000)
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const body = (await response.json().catch(() => null)) as
      | { version?: unknown }
      | null
    sidecar.healthy = true
    sidecar.lastCheck = new Date().toISOString()
    sidecar.version =
      body && typeof body.version === 'string'
        ? body.version
        : record.manifest.version
    record.status = 'ready'
    record.error = undefined
    if (wasHealthy !== true) {
      recordLog(record.manifest.id, '健康检查通过')
    }
  } catch (error) {
    sidecar.healthy = false
    sidecar.lastCheck = new Date().toISOString()
    record.status = 'error'
    record.error = `健康检查失败：${errorMessage(error)}`
    if (wasHealthy !== false) {
      recordLog(record.manifest.id, record.error)
    }
  }

  record.updatedAt = new Date().toISOString()
  notify()
}

function stopSidecarTimer(record: LocalAdapterRecord | undefined): void {
  if (!record?.sidecar?.timer) return
  clearInterval(record.sidecar.timer)
  record.sidecar.timer = null
}

function startSidecarTimer(record: LocalAdapterRecord): void {
  const sidecar = record.sidecar
  if (!sidecar) return
  stopSidecarTimer(record)
  sidecar.timer = setInterval(() => {
    void checkSidecar(record)
  }, sidecar.health.intervalMs)
  sidecar.timer.unref?.()
}

async function loadAdapter(dir: string): Promise<void> {
  const id = basename(dir)
  const previous = records.get(id)
  previous?.host?.dispose()
  stopSidecarTimer(previous)
  recordLog(id, '开始加载')

  const record: LocalAdapterRecord = {
    manifest: { id, version: '0.0.0', type: 'code' },
    provider: { id: `local:${id}`, name: id, baseUrl: '' },
    models: [],
    dir,
    status: 'loading',
    host: null,
    sidecar: null,
    updatedAt: new Date().toISOString()
  }
  records.set(id, record)

  try {
    const data = await readLocalAdapter(dir)
    if (data.manifest.id !== id) {
      throw new Error('manifest.id 必须与适配器目录名一致')
    }

    record.manifest = data.manifest
    record.models = data.models

    if (data.manifest.type === 'sidecar') {
      const baseUrl = data.manifest.baseUrl ?? data.provider.baseUrl
      assertLocalBaseUrl(baseUrl)

      const headers = data.provider.headers ?? data.manifest.headers
      const apiKeyEnv = data.provider.apiKeyEnv ?? data.manifest.apiKeyEnv

      record.provider = {
        ...data.provider,
        id: `sidecar:${id}`,
        baseUrl,
        ...(headers ? { headers } : {}),
        ...(apiKeyEnv ? { apiKeyEnv } : {})
      }
      record.sidecar = {
        baseUrl,
        ...(headers ? { headers } : {}),
        ...(apiKeyEnv ? { apiKeyEnv } : {}),
        health: data.manifest.health ?? {
          path: '/health',
          intervalMs: 30_000
        },
        timer: null,
        version: data.manifest.version
      }

      await checkSidecar(record)
      startSidecarTimer(record)
      recordLog(id, 'Sidecar 已注册')
    } else {
      record.provider = data.provider

      if (data.manifest.type !== 'code') {
        throw new Error('当前版本只支持 L3 code 适配器')
      }

      const built = await buildLocalAdapter(dir, data.manifest)
      if (!built.ok) throw new Error(built.error)

      record.host = new LocalAdapterHost(id, built.outfile, dir, (message) =>
        recordLog(id, message)
      )
      record.status = 'ready'
      recordLog(id, '已加载')
    }
  } catch (error) {
    record.status = 'error'
    record.error = errorMessage(error)
    recordLog(id, `加载失败：${record.error}`)
  }

  record.updatedAt = new Date().toISOString()
  notify()
}

async function scanAll(): Promise<void> {
  const root = localAdaptersDir()
  await fs.mkdir(root, { recursive: true })

  const entries = await fs.readdir(root, { withFileTypes: true })
  const dirs = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => join(root, entry.name))
  const ids = new Set(dirs.map((dir) => basename(dir)))

  for (const [id, record] of records) {
    if (ids.has(id)) continue
    record.host?.dispose()
    stopSidecarTimer(record)
    records.delete(id)
  }

  await Promise.all(dirs.map((dir) => loadAdapter(dir)))
  notify()
}

function scheduleReload(id: string): void {
  if (!id || id.startsWith('.') || id === 'node_modules') return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    const dir = join(localAdaptersDir(), id)
    void fs
      .access(dir)
      .then(() => loadAdapter(dir))
      .catch(() => {
        const record = records.get(id)
        record?.host?.dispose()
        stopSidecarTimer(record)
        records.delete(id)
        notify()
      })
  }, 300)
}

export async function startLocalAdapterRegistry(): Promise<void> {
  if (started) return
  started = true
  configureEsbuildBinary()

  await scanAll()

  try {
    watcher = watch(localAdaptersDir(), { recursive: true }, (_event, filename) => {
      const first = String(filename ?? '').split(/[\\/]/)[0]
      scheduleReload(first)
    })
    watcher.on('error', (error) => {
      console.warn('[local-adapter] watcher failed', error)
    })
  } catch (error) {
    console.warn('[local-adapter] failed to watch adapters directory', error)
  }
}

export function stopLocalAdapterRegistry(): void {
  started = false
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  watcher?.close()
  watcher = null
  for (const record of records.values()) {
    record.host?.dispose()
    stopSidecarTimer(record)
  }
  records.clear()
}

export async function reloadLocalAdapter(id: string): Promise<void> {
  const dir = join(localAdaptersDir(), id)
  await fs.access(dir)
  await loadAdapter(dir)
}
