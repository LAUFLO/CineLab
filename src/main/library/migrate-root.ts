import { app, shell } from 'electron'
import { promises as fs } from 'node:fs'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import { getLibraryRoot, setLibraryRoot } from './config'
import type {
  LibraryMigrateProgress as MigrateProgress,
  LibraryMigrateResult as MigrateResult
} from '@shared/library-migration'

type ProgressFn = (progress: MigrateProgress) => void

let activeAbort: AbortController | null = null

export function cancelMigration(): void {
  activeAbort?.abort()
}

function isInside(parent: string, child: string): boolean {
  return child === parent || child.startsWith(`${parent}${sep}`)
}

function protectedRoots(): string[] {
  return [
    app.getPath('home'),
    app.getPath('desktop'),
    app.getPath('documents'),
    app.getPath('downloads')
  ].map((path) => resolve(path))
}

function assertSafeTarget(source: string, target: string): void {
  if (target === source) throw new Error('目标文件夹与当前资产库相同')
  if (isInside(target, source)) {
    throw new Error('目标文件夹不能包含当前资产库')
  }
  if (isInside(source, target)) {
    throw new Error('目标文件夹不能位于当前资产库内部')
  }
  if (dirname(target) === target) {
    throw new Error('不能把磁盘根目录作为资产库')
  }
  const protectedPath = protectedRoots()
  if (protectedPath.includes(target)) {
    throw new Error('不能把用户主目录、桌面、文档或下载目录作为资产库')
  }
}

async function collectFiles(
  root: string,
  signal: AbortSignal
): Promise<{ files: Array<{ relative: string; size: number }>; bytes: number }> {
  const files: Array<{ relative: string; size: number }> = []
  let bytes = 0

  const walk = async (relative: string): Promise<void> => {
    signal.throwIfAborted()
    const absolute = join(root, relative)
    const entries = await fs.readdir(absolute, { withFileTypes: true })
    for (const entry of entries) {
      signal.throwIfAborted()
      const child = relative ? join(relative, entry.name) : entry.name
      if (entry.isDirectory()) {
        await walk(child)
      } else if (entry.isFile()) {
        const stat = await fs.stat(join(root, child))
        files.push({ relative: child, size: stat.size })
        bytes += stat.size
      }
    }
  }

  await walk('')
  return { files, bytes }
}

async function copyTree(
  source: string,
  target: string,
  files: Array<{ relative: string; size: number }>,
  totalBytes: number,
  signal: AbortSignal,
  onProgress: ProgressFn
): Promise<void> {
  let copiedFiles = 0
  let copiedBytes = 0
  let lastReport = 0

  const report = (current?: string, force = false): void => {
    const now = Date.now()
    if (!force && now - lastReport < 160) return
    lastReport = now
    onProgress({
      phase: 'copy',
      copiedFiles,
      totalFiles: files.length,
      copiedBytes,
      totalBytes,
      ...(current ? { current } : {})
    })
  }

  await fs.mkdir(target, { recursive: true })

  for (const file of files) {
    signal.throwIfAborted()
    const destination = join(target, file.relative)
    await fs.mkdir(dirname(destination), { recursive: true })
    await fs.copyFile(join(source, file.relative), destination)
    copiedFiles += 1
    copiedBytes += file.size
    report(file.relative)
  }

  report(undefined, true)
}

async function verifyCopy(
  target: string,
  expectedFiles: number,
  expectedBytes: number,
  signal: AbortSignal
): Promise<void> {
  signal.throwIfAborted()
  const result = await collectFiles(target, signal)
  if (result.files.length !== expectedFiles) {
    throw new Error(
      `迁移校验失败：文件数不一致（${result.files.length}/${expectedFiles}）`
    )
  }
  if (result.bytes !== expectedBytes) {
    throw new Error(
      `迁移校验失败：总大小不一致（${result.bytes}/${expectedBytes} 字节）`
    )
  }
}

async function clearDirectory(target: string): Promise<void> {
  let entries: string[] = []
  try {
    entries = await fs.readdir(target)
  } catch {
    return
  }
  for (const entry of entries) {
    await fs.rm(join(target, entry), { recursive: true, force: true })
  }
}

export async function migrateLibraryRoot(
  targetInput: string,
  onProgress: ProgressFn
): Promise<MigrateResult> {
  const source = await getLibraryRoot()
  const target = resolve(targetInput)
  assertSafeTarget(source, target)

  const existing = await fs.readdir(target).catch(() => null)
  if (existing === null) {
    await fs.mkdir(target, { recursive: true })
  } else if (existing.length > 0) {
    throw new Error('目标文件夹必须为空')
  }

  const controller = new AbortController()
  activeAbort = controller
  const signal = controller.signal
  const warnings: string[] = []

  try {
    onProgress({
      phase: 'scan',
      copiedFiles: 0,
      totalFiles: 0,
      copiedBytes: 0,
      totalBytes: 0
    })

    const snapshot = await collectFiles(source, signal)
    if (snapshot.files.length === 0) {
      const root = await setLibraryRoot(target)
      return {
        root,
        files: 0,
        bytes: 0,
        warnings,
        trashedOldRoot: false
      }
    }

    const staging = join(target, `.migrating-${randomUUID()}`)
    try {
      await copyTree(
        source,
        staging,
        snapshot.files,
        snapshot.bytes,
        signal,
        onProgress
      )

      onProgress({
        phase: 'verify',
        copiedFiles: snapshot.files.length,
        totalFiles: snapshot.files.length,
        copiedBytes: snapshot.bytes,
        totalBytes: snapshot.bytes
      })
      await verifyCopy(staging, snapshot.files.length, snapshot.bytes, signal)

      // 目标目录原本为空，把 staging 内容移动到根
      const entries = await fs.readdir(staging)
      for (const entry of entries) {
        await fs.rename(join(staging, entry), join(target, entry))
      }
      await fs.rm(staging, { recursive: true, force: true })
    } catch (error) {
      await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined)
      await clearDirectory(target)
      throw error
    }

    onProgress({
      phase: 'switch',
      copiedFiles: snapshot.files.length,
      totalFiles: snapshot.files.length,
      copiedBytes: snapshot.bytes,
      totalBytes: snapshot.bytes
    })

    const root = await setLibraryRoot(target)

    let trashedOldRoot = false
    const protectedPath = protectedRoots()
    if (!protectedPath.includes(resolve(source))) {
      try {
        await shell.trashItem(source)
        trashedOldRoot = true
      } catch (error) {
        warnings.push(
          `旧资产库未能移入回收站，请手动处理：${
            error instanceof Error ? error.message : String(error)
          }`
        )
      }
    } else {
      warnings.push('旧资产库位于受保护目录，未自动移入回收站')
    }

    return {
      root,
      files: snapshot.files.length,
      bytes: snapshot.bytes,
      warnings,
      trashedOldRoot
    }
  } finally {
    activeAbort = null
  }
}

export async function migrateLibraryRootToDefault(
  onProgress: ProgressFn
): Promise<MigrateResult> {
  return migrateLibraryRoot(join(app.getPath('documents'), 'CineLab Assets'), onProgress)
}

export function legacyTargetName(path: string): string {
  return basename(path)
}
