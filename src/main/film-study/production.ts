import type { FilmStudyShot } from '@shared/film-study-v2'
import type { FrameStats } from './shot-detect'

/**
 * 确定性取证：只用像素统计判断镜头是怎么做出来的。
 * 目标不是一次判准实拍/AI/3D，而是给出可复核的证据；
 * 低置信标签留给 R2 的 VLM 复核。
 */
export interface ShotFeatures {
  /** 相邻帧几乎不动的比例（0..1） */
  dupRatio: number
  /** 相邻帧背景像素完全不动的比例（0..1） */
  frozenRatio: number
  /** 画面内部平坦块比例（0..1） */
  flatRatio: number
  /** 中间帧出现过的灰度级数 */
  grayLevels: number
  /** 局部纹理能量（拉普拉斯近似） */
  texture: number
  /** 镜头平均亮度 */
  lumaMean: number
}

export interface ProductionResult {
  label: string
  confidence: number
  evidence: string[]
  material?: 'real' | 'ai' | 'rendered' | 'unknown'
}

const DUP_EPS = 0.001
const FROZEN_EPS = 3
const FLAT_EPS = 4

function frameRange(
  stats: FrameStats,
  shot: FilmStudyShot
): [number, number] {
  const start = Math.max(1, Math.floor(shot.startTime * stats.fps))
  const end = Math.min(
    stats.count - 1,
    Math.max(start, Math.ceil(shot.endTime * stats.fps))
  )
  return [start, end]
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

export function computeShotFeatures(
  stats: FrameStats,
  shot: FilmStudyShot
): ShotFeatures {
  const [start, end] = frameRange(stats, shot)
  const span = Math.max(0, end - start)
  const thumbs = stats.thumbs

  let dup = 0
  let frozen = 0
  let frozenPairs = 0
  for (let index = start; index <= end; index += 1) {
    if ((stats.pixDiff[index] ?? 1) < DUP_EPS) dup += 1

    const a = thumbs?.[index - 1]
    const b = thumbs?.[index]
    if (!a || !b || a.length !== b.length || a.length === 0) continue
    let same = 0
    for (let pixel = 0; pixel < a.length; pixel += 1) {
      if (Math.abs(a[pixel] - b[pixel]) < FROZEN_EPS) same += 1
    }
    frozen += same / a.length
    frozenPairs += 1
  }

  const dupRatio = span > 0 ? dup / (span + 1) : 0
  const frozenRatio = frozenPairs > 0 ? frozen / frozenPairs : 0

  const midIndex = Math.min(
    stats.count - 1,
    Math.max(1, Math.round((start + end) / 2))
  )
  const middle = thumbs?.[midIndex]
  let flatRatio = 0
  let grayLevels = 0
  let texture = 0

  if (middle && middle.length > 0) {
    const width = Math.max(1, Math.floor(stats.width / 2))
    const height = Math.max(1, Math.floor(stats.height / 2))
    const seen = new Set<number>()
    let flat = 0
    let total = 0
    let energy = 0
    let energyCount = 0

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x
        const value = middle[index]
        seen.add(value)
        total += 1

        const right = x + 1 < width ? middle[index + 1] : value
        const down = y + 1 < height ? middle[index + width] : value
        if (Math.abs(right - value) < FLAT_EPS && Math.abs(down - value) < FLAT_EPS) {
          flat += 1
        }

        const lap = right + down - 2 * value
        energy += lap * lap
        energyCount += 1
      }
    }

    flatRatio = total > 0 ? flat / total : 0
    grayLevels = seen.size
    texture = energyCount > 0 ? energy / energyCount : 0
  }

  let lumaSum = 0
  let lumaCount = 0
  for (let index = start; index <= end; index += 1) {
    if (typeof stats.luma[index] === 'number') {
      lumaSum += stats.luma[index]
      lumaCount += 1
    }
  }

  return {
    dupRatio,
    frozenRatio,
    flatRatio,
    grayLevels,
    texture,
    lumaMean: lumaCount > 0 ? lumaSum / lumaCount : 0
  }
}

export function classifyProduction(features: ShotFeatures): ProductionResult {
  const evidence: string[] = []
  const {
    dupRatio,
    frozenRatio,
    flatRatio,
    grayLevels,
    texture,
    lumaMean
  } = features

  if (dupRatio > 0.85) {
    evidence.push(`相邻帧 ${percent(dupRatio)} 逐像素重复`)
    return {
      label: 'static_hold',
      confidence: 0.95,
      evidence,
      material: 'unknown'
    }
  }

  if (dupRatio > 0.3 && frozenRatio > 0.6) {
    evidence.push(
      `相邻帧 ${percent(dupRatio)} 重复，背景 ${percent(frozenRatio)} 不动`
    )
    return {
      label: 'still_motion',
      confidence: 0.7,
      evidence,
      material: 'unknown'
    }
  }

  if (flatRatio > 0.45 && grayLevels < 64 && frozenRatio > 0.5) {
    evidence.push(
      `平坦块 ${percent(flatRatio)}，灰度级数 ${grayLevels}，背景 ${percent(frozenRatio)} 不动`
    )
    return {
      label: 'code_render',
      confidence: 0.75,
      evidence,
      material: 'rendered'
    }
  }

  if (flatRatio > 0.5 && grayLevels < 96) {
    evidence.push(`平坦块 ${percent(flatRatio)}，灰度级数 ${grayLevels}`)
    return {
      label: 'screen_capture',
      confidence: 0.6,
      evidence,
      material: 'rendered'
    }
  }

  if (texture > 120 && lumaMean > 8 && lumaMean < 248) {
    evidence.push(
      `纹理能量 ${texture.toFixed(0)}，平均亮度 ${lumaMean.toFixed(0)}`
    )
    return {
      label: 'live_action',
      confidence: 0.4,
      evidence,
      material: 'real'
    }
  }

  if (texture < 30) {
    evidence.push(`纹理能量 ${texture.toFixed(0)}，画面接近纯色`)
    return {
      label: 'cg_3d',
      confidence: 0.3,
      evidence,
      material: 'rendered'
    }
  }

  evidence.push(
    `平坦块 ${percent(flatRatio)}，灰度级数 ${grayLevels}，纹理能量 ${texture.toFixed(0)}`
  )
  return {
    label: 'ai_video',
    confidence: 0.35,
    evidence,
    material: 'ai'
  }
}

/** 对整条拉片逐镜取证；没有逐帧统计时原样返回。 */
export function analyzeProduction(
  shots: FilmStudyShot[],
  stats: FrameStats | null
): FilmStudyShot[] {
  if (!stats || shots.length === 0) return shots
  return shots.map((shot) => ({
    ...shot,
    production: classifyProduction(computeShotFeatures(stats, shot))
  }))
}
