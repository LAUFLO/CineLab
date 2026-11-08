import { BrowserWindow, app, dialog, ipcMain } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type {
  FilmStudy,
  FilmStudyExtractRequest
} from '@shared/film-study'
import { getCurrentProjectRoot } from '../project/manager'
import {
  analyzeFilmStudy,
  buildFilmStudyMarkdown,
  cancelFilmStudy,
  createFilmStudyContactSheet,
  exportFilmStudyAnalysisPackage,
  exportFilmStudyBundle,
  extractFilmStudy,
  extractFilmStudySubtitles,
  importFilmStudyAnalysis,
  importFilmStudySubtitles,
  loadFilmStudy,
  saveFilmStudy
} from '../film-study/service'

function safeName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '_').trim() || '拉片'
}

function requireProjectRoot(): string {
  const root = getCurrentProjectRoot()
  if (!root) throw new Error('没有打开的项目')
  return root
}

export function registerFilmStudyIpc(): void {
  ipcMain.handle(
    'film-study:extract',
    async (event, input: FilmStudyExtractRequest) => {
      return extractFilmStudy(requireProjectRoot(), input, (progress) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('film-study:progress', progress)
        }
      })
    }
  )

  ipcMain.handle('film-study:cancel', (_event, nodeId: string) => {
    cancelFilmStudy(nodeId)
  })

  ipcMain.handle('film-study:load', (_event, studyId: string) =>
    loadFilmStudy(requireProjectRoot(), studyId)
  )

  ipcMain.handle(
    'film-study:save',
    (_event, study: FilmStudy) =>
      saveFilmStudy(requireProjectRoot(), study)
  )

  ipcMain.handle(
    'film-study:export-markdown',
    async (event, studyId: string) => {
      const study = await loadFilmStudy(requireProjectRoot(), studyId)
      const win = BrowserWindow.fromWebContents(event.sender)
      const options = {
        title: '导出拉片笔记',
        defaultPath: join(
          app.getPath('documents'),
          `${safeName(study.sourceName)}-拉片.md`
        ),
        filters: [{ name: 'Markdown', extensions: ['md'] }]
      }
      const result = win
        ? await dialog.showSaveDialog(win, options)
        : await dialog.showSaveDialog(options)

      if (result.canceled || !result.filePath) return { canceled: true }

      await fs.writeFile(
        result.filePath,
        buildFilmStudyMarkdown(study),
        'utf8'
      )
      return { path: result.filePath }
    }
  )

  ipcMain.handle(
    'film-study:export-analysis-package',
    async (event, studyId: string) => {
      const study = await loadFilmStudy(requireProjectRoot(), studyId)
      const win = BrowserWindow.fromWebContents(event.sender)
      const options = {
        title: '导出 AI 拉片分析包',
        defaultPath: join(
          app.getPath('documents'),
          `${safeName(study.sourceName)}-AI分析包.zip`
        ),
        filters: [{ name: 'ZIP', extensions: ['zip'] }]
      }
      const result = win
        ? await dialog.showSaveDialog(win, options)
        : await dialog.showSaveDialog(options)

      if (result.canceled || !result.filePath) return { canceled: true }

      await exportFilmStudyAnalysisPackage(
        requireProjectRoot(),
        studyId,
        result.filePath
      )
      return { path: result.filePath }
    }
  )

  ipcMain.handle(
    'film-study:export-bundle',
    async (event, studyId: string) => {
      const study = await loadFilmStudy(requireProjectRoot(), studyId)
      const win = BrowserWindow.fromWebContents(event.sender)
      const options = {
        title: '导出拉片包',
        defaultPath: join(
          app.getPath('documents'),
          `${safeName(study.sourceName)}-拉片包.zip`
        ),
        filters: [{ name: 'ZIP', extensions: ['zip'] }]
      }
      const result = win
        ? await dialog.showSaveDialog(win, options)
        : await dialog.showSaveDialog(options)

      if (result.canceled || !result.filePath) return { canceled: true }

      await exportFilmStudyBundle(
        requireProjectRoot(),
        studyId,
        result.filePath
      )
      return { path: result.filePath }
    }
  )

  ipcMain.handle(
    'film-study:import-analysis',
    async (event, studyId: string) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      const options = {
        title: '导入 AI 拉片结果',
        properties: ['openFile' as const],
        filters: [{ name: 'JSON', extensions: ['json'] }]
      }
      const result = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options)

      if (result.canceled || result.filePaths.length === 0) return null

      const text = await fs.readFile(result.filePaths[0], 'utf8')
      const cleaned = text
        .replace(/^\uFEFF/, '')
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
      const raw = JSON.parse(cleaned) as unknown
      return importFilmStudyAnalysis(
        requireProjectRoot(),
        studyId,
        raw
      )
    }
  )

  ipcMain.handle(
    'film-study:extract-subtitles',
    (_event, studyId: string) =>
      extractFilmStudySubtitles(requireProjectRoot(), studyId)
  )

  ipcMain.handle(
    'film-study:import-subtitles',
    async (event, studyId: string) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      const options = {
        title: '导入 SRT 字幕',
        properties: ['openFile' as const],
        filters: [{ name: '字幕', extensions: ['srt'] }]
      }
      const result = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options)

      if (result.canceled || result.filePaths.length === 0) return null

      const text = await fs.readFile(result.filePaths[0], 'utf8')
      return importFilmStudySubtitles(
        requireProjectRoot(),
        studyId,
        text
      )
    }
  )

  ipcMain.handle(
    'film-study:analyze',
    (_event, studyId: string, modelKey: string) =>
      analyzeFilmStudy(requireProjectRoot(), studyId, modelKey)
  )

  ipcMain.handle(
    'film-study:contact-sheet',
    (_event, studyId: string) =>
      createFilmStudyContactSheet(requireProjectRoot(), studyId)
  )
}
