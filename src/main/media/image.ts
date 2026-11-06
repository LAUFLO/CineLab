import { nativeImage } from 'electron'
import { promises as fs } from 'node:fs'
import type { GeneratedAsset } from '@shared/generation'
import type { CropImageRectRequest, CropImageRequest } from '@shared/media'
import { ingestAsset } from '../assets/ingest'
import { resolveMediaPath } from './paths'

const ALLOWED_RATIOS = new Set(['1:1', '16:9', '9:16', '4:3', '3:4'])

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}

export async function cropImage(
  projectRoot: string,
  input: CropImageRequest
): Promise<GeneratedAsset> {
  if (!ALLOWED_RATIOS.has(input.ratio)) throw new Error('不支持的裁剪比例')

  const absolute = await resolveMediaPath(projectRoot, input.path)
  const image = nativeImage.createFromBuffer(await fs.readFile(absolute))

  if (image.isEmpty()) throw new Error('无法读取图片')

  const size = image.getSize()
  const [ratioWidth, ratioHeight] = input.ratio.split(':').map(Number)
  const targetRatio = ratioWidth / ratioHeight
  const sourceRatio = size.width / size.height

  let width: number
  let height: number

  if (sourceRatio > targetRatio) {
    height = size.height
    width = Math.round(size.height * targetRatio)
  } else {
    width = size.width
    height = Math.round(size.width / targetRatio)
  }

  const x = Math.max(0, Math.floor((size.width - width) / 2))
  const y = Math.max(0, Math.floor((size.height - height) / 2))
  width = Math.min(width, size.width - x)
  height = Math.min(height, size.height - y)

  const buffer = image.crop({ x, y, width, height }).toPNG()

  return ingestAsset({
    projectPath: projectRoot,
    data: buffer,
    kind: 'image',
    mime: 'image/png',
    model: `本地裁剪（${input.ratio}）`,
    width,
    height
  })
}

export async function cropImageRect(
  projectRoot: string,
  input: CropImageRectRequest
): Promise<GeneratedAsset> {
  const absolute = await resolveMediaPath(projectRoot, input.path)
  const image = nativeImage.createFromBuffer(await fs.readFile(absolute))

  if (image.isEmpty()) throw new Error('无法读取图片')

  const size = image.getSize()
  const x = clamp(input.x, 0, size.width - 1)
  const y = clamp(input.y, 0, size.height - 1)
  const width = clamp(input.width, 1, size.width - x)
  const height = clamp(input.height, 1, size.height - y)

  const buffer = image.crop({ x, y, width, height }).toPNG()

  return ingestAsset({
    projectPath: projectRoot,
    data: buffer,
    kind: 'image',
    mime: 'image/png',
    model: '本地自由裁剪',
    width,
    height
  })
}
