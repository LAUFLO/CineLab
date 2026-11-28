import type { LayerTransform, OutputRef } from '@shared/canvas-schema'
import { assetUrl } from '../../lib/asset-url'

export interface LayerGroup {
  groupId: string
  base: OutputRef
  layers: OutputRef[]
  width: number
  height: number
}

/** 把独立图层节点在画布上的矩形反算回底图像素坐标。 */
export function attachTransform(input: {
  sourceRect: { x: number; y: number; width: number; height: number }
  detachedRect: { x: number; y: number; width: number; height: number }
  groupWidth: number
  groupHeight: number
}): LayerTransform {
  const scaleX = input.groupWidth / Math.max(1, input.sourceRect.width)
  const scaleY = input.groupHeight / Math.max(1, input.sourceRect.height)
  return {
    x: (input.detachedRect.x - input.sourceRect.x) * scaleX,
    y: (input.detachedRect.y - input.sourceRect.y) * scaleY,
    width: Math.max(1, input.detachedRect.width * scaleX),
    height: Math.max(1, input.detachedRect.height * scaleY)
  }
}

/** 版本栈裁剪时优先保留当前图层组，再保留最新普通/合并版本。 */
export function trimLayerOutputs(
  incoming: OutputRef[],
  existing: OutputRef[],
  activeGroupId: string | undefined,
  limit = 100
): OutputRef[] {
  const all = [...incoming, ...existing]
  if (all.length <= limit) return all
  if (!activeGroupId) return all.slice(0, limit)

  const protectedIds = new Set(
    all
      .filter((output) => output.layerGroupId === activeGroupId)
      .map((output) => output.id)
  )
  const result: OutputRef[] = []
  for (const output of all) {
    if (protectedIds.has(output.id)) result.push(output)
  }
  for (const output of all) {
    if (result.length >= limit) break
    if (!protectedIds.has(output.id)) result.push(output)
  }
  return result.slice(0, limit)
}

/**
 * 取当前选中的图层组：优先选中 output 的 group；否则取最新一组。
 * 只把带 layer 元数据的 output 视为图层；合并结果只作为普通版本。
 */
export function resolveLayerGroup(
  outputs: OutputRef[],
  selectedOutputId?: string
): LayerGroup | null {
  const selected = outputs.find((output) => output.id === selectedOutputId)
  let groupId = selected?.layerGroupId

  if (!groupId) {
    const latest = outputs
      .filter((output) => output.layerGroupId && output.layer)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    groupId = latest?.layerGroupId
  }

  if (!groupId) return null

  const members = outputs.filter(
    (output) => output.layerGroupId === groupId && output.layer
  )
  const base = members.find((output) => output.layer?.zIndex === 0)
  if (!base) return null

  const layers = members
    .filter((output) => (output.layer?.zIndex ?? 0) > 0)
    .sort((a, b) => (a.layer?.zIndex ?? 0) - (b.layer?.zIndex ?? 0))
  const width = base.width ?? 0
  const height = base.height ?? 0
  if (width <= 0 || height <= 0) return null

  return { groupId, base, layers, width, height }
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const response = await fetch(src)
  if (!response.ok) throw new Error('图层图片加载失败')
  const objectUrl = URL.createObjectURL(await response.blob())
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('图层图片加载失败'))
      image.src = objectUrl
    })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export interface DrawLayerGroupOptions {
  /** 复用已加载的图片，拖动时避免反复请求。 */
  cache?: Map<string, Promise<HTMLImageElement>>
  /** 新一帧开始时让旧帧在下一个 await 后退出。 */
  shouldAbort?: () => boolean
}

async function loadImageCached(
  src: string,
  cache?: Map<string, Promise<HTMLImageElement>>
): Promise<HTMLImageElement> {
  if (!cache) return loadImage(src)
  const existing = cache.get(src)
  if (existing) return existing
  const promise = loadImage(src)
  cache.set(src, promise)
  promise.catch(() => cache.delete(src))
  return promise
}

export async function drawLayerGroup(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  group: LayerGroup,
  options: DrawLayerGroupOptions = {}
): Promise<void> {
  const context = canvas.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null
  if (!context) throw new Error('无法创建合成画布')

  context.clearRect(0, 0, group.width, group.height)
  const base = await loadImageCached(
    assetUrl(group.base.path, group.base.scope),
    options.cache
  )
  if (options.shouldAbort?.()) return
  context.drawImage(base, 0, 0, group.width, group.height)

  for (const layer of group.layers) {
    if (layer.layerAttached === false || layer.layerVisible === false) continue
    const transform = layer.layerTransform
    if (!transform) continue
    const image = await loadImageCached(
      assetUrl(layer.path, layer.scope),
      options.cache
    )
    if (options.shouldAbort?.()) return
    const rotation = transform.rotation ?? 0
    const swapped = rotation % 180 !== 0
    const drawWidth = swapped ? transform.height : transform.width
    const drawHeight = swapped ? transform.width : transform.height
    context.save()
    context.translate(
      transform.x + transform.width / 2,
      transform.y + transform.height / 2
    )
    context.rotate((rotation * Math.PI) / 180)
    context.scale(transform.flipX ? -1 : 1, transform.flipY ? -1 : 1)
    context.drawImage(
      image,
      -drawWidth / 2,
      -drawHeight / 2,
      drawWidth,
      drawHeight
    )
    context.restore()
  }
}

export async function composeLayerGroup(group: LayerGroup): Promise<Blob> {
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(group.width, group.height)
      : Object.assign(document.createElement('canvas'), {
          width: group.width,
          height: group.height
        })
  await drawLayerGroup(canvas, group)

  if (canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: 'image/png' })
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('图层合成失败'))),
      'image/png'
    )
  })
}
