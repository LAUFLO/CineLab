import type { VisionRect } from '@shared/media'

export type LayerSplitMode = 'auto' | 'box' | 'prompt' | 'box-prompt'

export interface LayerSplitSource {
  width?: number
  height?: number
  path: string
}

const MIN_TOTAL_PIXELS = 512 * 512
const MAX_EDGE = 6000
const MIN_EDGE = 15
const MAX_ASPECT = 16

export function layerSplitModeOf(
  rects: VisionRect[],
  prompt: string
): LayerSplitMode {
  const hasPrompt = prompt.trim().length > 0
  if (rects.length > 0 && hasPrompt) return 'box-prompt'
  if (rects.length > 0) return 'box'
  if (hasPrompt) return 'prompt'
  return 'auto'
}

export function clampAutoMax(value: unknown): number {
  const numeric =
    typeof value === 'number' && Number.isFinite(value)
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : 4
  if (!Number.isFinite(numeric)) return 4
  return Math.min(8, Math.max(2, Math.round(numeric)))
}

export function layerMaxImages(
  mode: LayerSplitMode,
  autoMax: number,
  rectCount = 0
): number {
  if (mode === 'auto') return clampAutoMax(autoMax) + 1
  if (mode === 'box' || mode === 'box-prompt') {
    return Math.max(2, Math.min(8, rectCount) + 1)
  }
  return 2
}

export function normalizeLayerRect(
  rect: VisionRect,
  width: number,
  height: number
): VisionRect {
  const x = Math.max(0, Math.min(Math.round(rect.x), Math.max(0, width - 2)))
  const y = Math.max(0, Math.min(Math.round(rect.y), Math.max(0, height - 2)))
  const rectWidth = Math.max(
    2,
    Math.min(Math.round(rect.width), Math.max(2, width - x))
  )
  const rectHeight = Math.max(
    2,
    Math.min(Math.round(rect.height), Math.max(2, height - y))
  )
  return { x, y, width: rectWidth, height: rectHeight }
}

function bbox(rect: VisionRect, width: number, height: number): string {
  const normalized = normalizeLayerRect(rect, width, height)
  return `<bbox>${normalized.x} ${normalized.y} ${
    normalized.x + normalized.width
  } ${normalized.y + normalized.height}</bbox>`
}

export function buildLayerSplitPrompt(input: {
  mode: LayerSplitMode
  prompt: string
  rects: VisionRect[]
  width: number
  height: number
  autoMax: number
}): string {
  const { mode, prompt, rects, width, height, autoMax } = input
  const description = prompt.trim()
  const region = rects.map((rect) => bbox(rect, width, height)).join('、')
  const keep =
    '其余元素全部保留在底图；底图自然补全移除区域，保持透视、光照、景深、纹理、颜色和噪点一致，不要新增物体。'

  if (mode === 'auto') {
    return `自动识别画面中的主要主体，分别拆分为独立图层，最多 ${clampAutoMax(
      autoMax
    )} 个主体；${keep}`
  }

  if (mode === 'box-prompt') {
    return rects.length > 1
      ? `只将 ${region} 这些区域内、${description} 的主体分别拆分为独立图层，${keep}`
      : `只将 ${region} 范围内、${description} 的主体拆分为独立图层，${keep}`
  }

  if (mode === 'box') {
    return rects.length > 1
      ? `只将 ${region} 这些区域内的主体分别拆分为独立图层，${keep}`
      : `只将 ${region} 范围内的主体拆分为独立图层，${keep}`
  }

  return `只将 ${description} 拆分为独立图层，${keep}`
}

export function validateLayerSource(
  source: LayerSplitSource
): string | null {
  const width = Math.round(Number(source.width) || 0)
  const height = Math.round(Number(source.height) || 0)
  if (width <= 0 || height <= 0) return '无法读取源图尺寸'
  if (width < MIN_EDGE || height < MIN_EDGE) {
    return '源图尺寸过小，无法进行图层分离'
  }
  if (width > MAX_EDGE || height > MAX_EDGE) {
    return `源图最长边需不超过 ${MAX_EDGE}px`
  }
  if (width * height < MIN_TOTAL_PIXELS) {
    return '源图总像素过小，图层分离要求至少 512 × 512'
  }
  if (width / height > MAX_ASPECT || height / width > MAX_ASPECT) {
    return `源图宽高比需在 1:${MAX_ASPECT} 到 ${MAX_ASPECT}:1 之间`
  }

  const extension = source.path.split('.').pop()?.toLowerCase()
  if (extension && !['png', 'jpg', 'jpeg'].includes(extension)) {
    return '图层分离只支持 PNG / JPEG 源图'
  }

  return null
}
