import { dialog, ipcMain } from 'electron'
import { promises as fs } from 'node:fs'
import { basename } from 'node:path'
import type {
  TimelineAnalysisRequest,
  TimelineExportResult,
  TimelineExportSettings,
  TimelineSubtitleImportResult,
  TimelineTranscribeProgress,
  TimelineTranscribeRequest
} from '@shared/ipc-contract'
import { parseSubtitle } from '@shared/subtitles'
import type { TimelineDoc } from '@shared/timeline-schema'
import { analyzeMedia } from '../timeline/analysis'
import { getLibraryRoot } from '../library/config'
import { resolveInside } from '../media/paths'
import { getCurrentProjectRoot } from '../project/manager'
import { exportTimeline, type TimelineExportProgress } from '../timeline/export'
import { loadTimelineFile, saveTimelineFile, duplicateTimelineFile } from '../timeline/storage'
import { exportVtt } from '../timeline/vtt'
import { transcribe } from '../timeline/transcribe'

let activeExport: AbortController | null = null
let activeTranscribe: AbortController | null = null

export function registerTimelineIpc(): void {
  ipcMain.handle('timeline:load', async (_event, timelineId: string) => {
    const root = getCurrentProjectRoot()
    if (!root) throw new Error('没有打开的项目')
    return loadTimelineFile(root, timelineId)
  })

  ipcMain.handle(
    'timeline:save',
    async (_event, timelineId: string, doc: TimelineDoc) => {
      const root = getCurrentProjectRoot()
      if (!root) throw new Error('没有打开的项目')
      await saveTimelineFile(root, timelineId, doc)
    }
  )

  ipcMain.handle('timeline:duplicate', async (_event, sourceId: string) => {
    const root = getCurrentProjectRoot()
    if (!root) throw new Error('没有打开的项目')
    return duplicateTimelineFile(root, sourceId)
  })

  ipcMain.handle('timeline:export-vtt', async (_event, doc: TimelineDoc) => {
    const root = getCurrentProjectRoot()
    if (!root) throw new Error('没有打开的项目')
    return exportVtt(root, doc)
  })

  ipcMain.handle(
    'timeline:transcribe',
    async (event, input: TimelineTranscribeRequest) => {
      if (activeTranscribe) throw new Error('已有转写任务正在进行')
      const controller = new AbortController()
      activeTranscribe = controller

      try {
        return await transcribe(
          input,
          (progress: TimelineTranscribeProgress) => {
            if (!event.sender.isDestroyed()) {
              event.sender.send('timeline:transcribe-progress', progress)
            }
          },
          controller.signal
        )
      } finally {
        if (activeTranscribe === controller) activeTranscribe = null
      }
    }
  )

  ipcMain.handle('timeline:transcribe-cancel', () => {
    activeTranscribe?.abort()
  })

  ipcMain.handle(
    'timeline:analyze',
    async (_event, input: TimelineAnalysisRequest) => {
      const root =
        input.scope === 'global'
          ? await getLibraryRoot()
          : getCurrentProjectRoot()
      if (!root) throw new Error('没有打开的项目')
      const absolute = resolveInside(root, input.path)
      const markers = await analyzeMedia(
        input.kind,
        absolute,
        input.sourceStartMs,
        input.durationMs,
        input.speed
      )
      return { markers }
    }
  )

  ipcMain.handle(
    'timeline:import-subtitles',
    async (_event, requestedPath?: string): Promise<TimelineSubtitleImportResult | null> => {
      let file = requestedPath
      if (!file) {
        const picked = await dialog.showOpenDialog({
          title: '导入字幕',
          filters: [{ name: '字幕文件', extensions: ['srt', 'vtt'] }],
          properties: ['openFile']
        })
        file = picked.filePaths[0]
        if (picked.canceled || !file) return null
      }

      const content = await fs.readFile(file, 'utf8')
      return { name: basename(file), cues: parseSubtitle(content) }
    }
  )

  ipcMain.handle(
    'timeline:export',
    async (
      event,
      doc: TimelineDoc,
      settings?: TimelineExportSettings
    ): Promise<TimelineExportResult> => {
      const root = getCurrentProjectRoot()
      if (!root) throw new Error('没有打开的项目')
      if (activeExport) throw new Error('已有导出任务正在进行')

      const controller = new AbortController()
      activeExport = controller

      try {
        const path = await exportTimeline(
          root,
          doc,
          (progress: TimelineExportProgress) => {
            if (!event.sender.isDestroyed()) {
              event.sender.send('timeline:export-progress', progress)
            }
          },
          { signal: controller.signal, settings }
        )
        return { ok: true, path }
      } catch (error) {
        if (controller.signal.aborted) return { ok: false, canceled: true }
        throw error
      } finally {
        if (activeExport === controller) activeExport = null
      }
    }
  )

  ipcMain.handle('timeline:export-cancel', () => {
    activeExport?.abort()
  })
}
