import { nativeImage } from 'electron'
import { promises as fs } from 'node:fs'
import type { GeneratedAsset } from '@shared/generation'
import type { GridSplitRequest } from '@shared/media'
import { ingestAsset } from '../assets/ingest'
import { resolveInside } from './paths'

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}

export async function splitGrid(
  projectRoot: string,
  input: GridSplitRequest
): Promise<GeneratedAsset[]> {
  const absolute = resolveInside(projectRoot, input.path)
  const data = await fs.readFile(absolute)
  const image = nativeImage.createFromBuffer(data)

  if (image.isEmpty()) throw new Error('无法读取图片')

  const size = image.getSize()
  const rows = clamp(input.rows, 1, 10)
  const cols = clamp(input.cols, 1, 10)

  if (size.width < cols || size.height < rows) {
    throw new Error('图片尺寸小于切分数量')
  }

  const assets: GeneratedAsset[] = []

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = Math.floor((size.width * col) / cols)
      const y = Math.floor((size.height * row) / rows)
      const nextX = Math.floor((size.width * (col + 1)) / cols)
      const nextY = Math.floor((size.height * (row + 1)) / rows)
      const width = nextX - x
      const height = nextY - y

      if (width <= 0 || height <= 0) continue

      const buffer = image.crop({ x, y, width, height }).toPNG()

      assets.push(
        await ingestAsset({
          projectPath: projectRoot,
          data: buffer,
          kind: 'image',
          mime: 'image/png',
          model: '本地宫格切分',
          width,
          height
        })
      )
    }
  }

  return assets
}
