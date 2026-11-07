import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { copyFile, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, extname, join, resolve } from 'node:path'
import type { ExportResult } from '../../shared/ipc-contract'
import { getCurrentProjectRoot } from '../project/manager'
import { zipDirectory } from '../export/zip'
import { getLibraryRoot } from '../library/config'
import { concatVideos } from '../media/concat'
import type { AssetRef, AssetScope } from '../../shared/asset-schema'

function stamp(): string {
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, '0')
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `${date}-${time}`
}

function safeName(name: string): string {
  const trimmed = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').trim()
  return trimmed.length > 0 ? trimmed : 'CineLab'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function registerExportIpc(): void {
  ipcMain.handle(
    'export:project',
    async (event, projectName: string): Promise<ExportResult> => {
      const root = getCurrentProjectRoot()
      if (!root) return { ok: false, error: '没有打开的项目' }

      const win = BrowserWindow.fromWebContents(event.sender)
      const options = {
        title: '导出项目',
        defaultPath: join(app.getPath('documents'), `${safeName(projectName)}-${stamp()}.zip`),
        filters: [{ name: 'ZIP 压缩包', extensions: ['zip'] }]
      }
      const result = win
        ? await dialog.showSaveDialog(win, options)
        : await dialog.showSaveDialog(options)

      if (result.canceled || !result.filePath) return { ok: false, canceled: true }

      try {
        await zipDirectory(root, result.filePath, {
          rootName: basename(root),
          ignore: ['.lock', '.trash']
        })
        return { ok: true, path: result.filePath }
      } catch (error) {
        return { ok: false, error: errorMessage(error) }
      }
    }
  )

  ipcMain.handle(
    'export:canvas-png',
    async (event, projectName: string, canvasName: string): Promise<ExportResult> => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return { ok: false, error: '窗口不可用' }

      let image: Electron.NativeImage
      try {
        image = await win.webContents.capturePage()
      } catch (error) {
        return { ok: false, error: errorMessage(error) }
      }

      const options = {
        title: '导出当前画布',
        defaultPath: join(
          app.getPath('pictures'),
          `${safeName(projectName)}-${safeName(canvasName)}-${stamp()}.png`
        ),
        filters: [{ name: 'PNG 图片', extensions: ['png'] }]
      }
      const result = await dialog.showSaveDialog(win, options)
      if (result.canceled || !result.filePath) return { ok: false, canceled: true }

      try {
        await writeFile(result.filePath, image.toPNG())
        return { ok: true, path: result.filePath }
      } catch (error) {
        return { ok: false, error: errorMessage(error) }
      }
    }
  )

  ipcMain.handle(
    'export:concat-videos',
    async (
      event,
      paths: string[],
      options?: { resolution?: '720p' | '1080p'; quality?: 'standard' | 'high' }
    ): Promise<ExportResult> => {
      if (!Array.isArray(paths) || paths.length < 2) {
        return { ok: false, error: '至少选择两个视频' }
      }

      const win = BrowserWindow.fromWebContents(event.sender)
      const optionsDialog = {
        title: '合成视频',
        defaultPath: join(app.getPath('videos'), `CineLab-合成视频-${stamp()}.mp4`),
        filters: [{ name: 'MP4 视频', extensions: ['mp4'] }]
      }
      const result = win
        ? await dialog.showSaveDialog(win, optionsDialog)
        : await dialog.showSaveDialog(optionsDialog)

      if (result.canceled || !result.filePath) {
        return { ok: false, canceled: true }
      }

      try {
        await concatVideos(paths, result.filePath, options)
        return { ok: true, path: result.filePath }
      } catch (error) {
        return { ok: false, error: errorMessage(error) }
      }
    }
  )

  ipcMain.handle(
    'export:asset',
    async (event, relPath: string, fileName: string, scope?: AssetScope): Promise<ExportResult> => {
      const root = scope === 'global' ? await getLibraryRoot() : getCurrentProjectRoot()
      if (!root) return { ok: false, error: '没有打开的项目' }

      const rootPath = resolve(root)
      const absolute = resolve(rootPath, relPath)
      if (
        !absolute.startsWith(`${rootPath}\\`) &&
        !absolute.startsWith(`${rootPath}/`)
      ) {
        return { ok: false, error: '资源路径无效' }
      }

      try {
        await stat(absolute)
      } catch {
        return { ok: false, error: '资源文件不存在' }
      }

      const win = BrowserWindow.fromWebContents(event.sender)
      const options = {
        title: '导出素材',
        defaultPath: join(app.getPath('documents'), `${safeName(fileName)}${extname(absolute)}`)
      }
      const result = win
        ? await dialog.showSaveDialog(win, options)
        : await dialog.showSaveDialog(options)

      if (result.canceled || !result.filePath) return { ok: false, canceled: true }

      try {
        await copyFile(absolute, result.filePath)
        return { ok: true, path: result.filePath }
      } catch (error) {
        return { ok: false, error: errorMessage(error) }
      }
    }
  )

  ipcMain.handle(
    'export:assets',
    async (
      event,
      assets: AssetRef[],
      fileName: string
    ): Promise<ExportResult> => {
      const root = getCurrentProjectRoot()
      if (!root) return { ok: false, error: '没有打开的项目' }

      const projectBase = resolve(root)
      const libraryBase = resolve(await getLibraryRoot())
      const files: string[] = []

      for (const asset of assets) {
        const base = asset.scope === 'global' ? libraryBase : projectBase
        const absolute = resolve(base, asset.path)
        if (
          !absolute.startsWith(`${base}\\`) &&
          !absolute.startsWith(`${base}/`)
        ) {
          continue
        }

        try {
          const info = await stat(absolute)
          if (info.isFile()) files.push(absolute)
        } catch {
          // 素材缺失时跳过
        }
      }

      if (files.length === 0) {
        return { ok: false, error: '选中节点没有可导出的素材' }
      }

      const win = BrowserWindow.fromWebContents(event.sender)
      const options = {
        title: '导出选中素材',
        defaultPath: join(
          app.getPath('documents'),
          `${safeName(fileName)}-${stamp()}.zip`
        ),
        filters: [{ name: 'ZIP 压缩包', extensions: ['zip'] }]
      }
      const result = win
        ? await dialog.showSaveDialog(win, options)
        : await dialog.showSaveDialog(options)

      if (result.canceled || !result.filePath) {
        return { ok: false, canceled: true }
      }

      let tempDir: string | null = null

      try {
        tempDir = await mkdtemp(join(tmpdir(), 'cinelab-export-'))

        for (let index = 0; index < files.length; index += 1) {
          const file = files[index]
          const ext = extname(file)
          const base = safeName(basename(file, ext))
          const name = `${String(index + 1).padStart(2, '0')}-${base}${ext}`
          await copyFile(file, join(tempDir, name))
        }

        await zipDirectory(tempDir, result.filePath, {
          rootName: safeName(fileName)
        })

        return { ok: true, path: result.filePath }
      } catch (error) {
        return { ok: false, error: errorMessage(error) }
      } finally {
        if (tempDir) {
          await rm(tempDir, { recursive: true, force: true }).catch(() => {})
        }
      }
    }
  )
}
