import type { ClipFilter } from './timeline-schema'

export const DEFAULT_FILTER: ClipFilter = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  blur: 0,
  grayscale: 0,
  sepia: 0,
  hueRotate: 0,
  invert: 0,
  vignette: 0
}

export interface FilterPreset {
  id: string
  name: string
  value: ClipFilter
}

export const FILTER_PRESETS: FilterPreset[] = [
  { id: 'none', name: '原片', value: DEFAULT_FILTER },
  {
    id: 'bright',
    name: '明亮',
    value: {
      ...DEFAULT_FILTER,
      brightness: 1.12,
      contrast: 1.05,
      saturation: 1.08
    }
  },
  {
    id: 'vivid',
    name: '鲜艳',
    value: {
      ...DEFAULT_FILTER,
      contrast: 1.1,
      saturation: 1.35
    }
  },
  {
    id: 'mono',
    name: '黑白',
    value: {
      ...DEFAULT_FILTER,
      grayscale: 1,
      contrast: 1.08
    }
  },
  {
    id: 'retro',
    name: '复古',
    value: {
      ...DEFAULT_FILTER,
      sepia: 0.55,
      contrast: 1.04,
      saturation: 0.9,
      vignette: 0.35
    }
  },
  {
    id: 'cool',
    name: '冷色调',
    value: {
      ...DEFAULT_FILTER,
      hueRotate: 12,
      saturation: 0.95,
      brightness: 1.02
    }
  },
  {
    id: 'punch',
    name: '高对比',
    value: {
      ...DEFAULT_FILTER,
      contrast: 1.3,
      saturation: 1.1
    }
  },
  {
    id: 'vignette',
    name: '暗角',
    value: {
      ...DEFAULT_FILTER,
      vignette: 0.5
    }
  }
]

/** 转成 Canvas 2D 的 ctx.filter 字符串；默认值返回空串 */
export function canvasFilterString(filter?: ClipFilter | null): string {
  if (!filter) return ''
  const parts: string[] = []

  if (filter.brightness !== 1) parts.push(`brightness(${filter.brightness})`)
  if (filter.contrast !== 1) parts.push(`contrast(${filter.contrast})`)
  if (filter.saturation !== 1) parts.push(`saturate(${filter.saturation})`)
  if (filter.blur > 0) parts.push(`blur(${filter.blur}px)`)
  if (filter.grayscale > 0) parts.push(`grayscale(${filter.grayscale})`)
  if (filter.sepia > 0) parts.push(`sepia(${filter.sepia})`)
  if (filter.hueRotate !== 0) parts.push(`hue-rotate(${filter.hueRotate}deg)`)
  if (filter.invert > 0) parts.push(`invert(${filter.invert})`)

  return parts.join(' ')
}

/** 滤镜是否已经偏离默认值 */
export function hasActiveFilter(filter?: ClipFilter | null): boolean {
  return Boolean(filter && canvasFilterString(filter).length > 0)
}
