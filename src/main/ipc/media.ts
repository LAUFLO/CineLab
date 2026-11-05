import { ipcMain } from 'electron'
import type {
  CropImageRectRequest,
  CropImageRequest,
  CropVideoRequest,
  ExtractFrameRequest,
  GridSplitRequest,
  RemoveSubtitlesRequest,
  SplitAvRequest,
  StitchRequest,
  TrimVideoRequest
} from '@shared/media'
import { probeMedia } from '../media/ffmpeg'
import { extractFrame } from '../media/frames'
import { splitGrid } from '../media/grid'
import { stitchGrid } from '../media/stitch'
import { cropImage, cropImageRect } from '../media/image'
import { resolveInside } from '../media/paths'
import { cropVideo, removeSubtitles, splitAv, trimVideo } from '../media/video'
import { getCurrentProjectRoot } from '../project/manager'

function requireProjectRoot(): string {
  const root = getCurrentProjectRoot()
  if (!root) throw new Error('没有打开的项目')
  return root
}

export function registerMediaIpc(): void {
  ipcMain.handle('media:split-grid', async (_event, input: GridSplitRequest) => {
    return { assets: await splitGrid(requireProjectRoot(), input) }
  })

  ipcMain.handle('media:stitch', async (_event, input: StitchRequest) => {
    return { asset: await stitchGrid(requireProjectRoot(), input) }
  })

  ipcMain.handle(
    'media:extract-frame',
    async (_event, input: ExtractFrameRequest) => {
      return extractFrame(requireProjectRoot(), input)
    }
  )

  ipcMain.handle('media:split-av', async (_event, input: SplitAvRequest) => {
    return splitAv(requireProjectRoot(), input)
  })

  ipcMain.handle('media:crop-video', async (_event, input: CropVideoRequest) => {
    return { asset: await cropVideo(requireProjectRoot(), input) }
  })

  ipcMain.handle('media:probe', async (_event, path: string) => {
    return probeMedia(resolveInside(requireProjectRoot(), path))
  })

  ipcMain.handle('media:crop-image', async (_event, input: CropImageRequest) => {
    return { asset: await cropImage(requireProjectRoot(), input) }
  })

  ipcMain.handle(
    'media:crop-image-rect',
    async (_event, input: CropImageRectRequest) => {
      return { asset: await cropImageRect(requireProjectRoot(), input) }
    }
  )

  ipcMain.handle('media:trim-video', async (_event, input: TrimVideoRequest) => {
    return { asset: await trimVideo(requireProjectRoot(), input) }
  })

  ipcMain.handle(
    'media:remove-subtitles',
    async (_event, input: RemoveSubtitlesRequest) => {
      return { asset: await removeSubtitles(requireProjectRoot(), input) }
    }
  )
}
