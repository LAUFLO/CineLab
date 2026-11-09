import { probeMedia, runFfmpegBuffer } from '../media/ffmpeg'

const THUMB_WIDTH = 96
const MIN_ANALYSIS_FPS = 4
const MAX_ANALYSIS_FPS = 8

export interface FrameStats {
  width: number
  height: number
  fps: number
  count: number
  /** 每帧 64 桶灰度直方图，已归一化 */
  hist: Float32Array[]
  /** 与前一帧的平均像素差（0..1） */
  pixDiff: number[]
  /** 与前一帧差异明显的像素比例 */
  changed: number[]
  /** 平均亮度 0..255 */
  luma: number[]
}

export type CutKind = 'cut' | 'jump' | 'motion'

export interface DetectedCut {
  time: number
  kind: CutKind
  score: number
}

function localMedian(values: number[], radius: number): number[] {
  const result = new Array<number>(values.length).fill(0)
  for (let index = 0; index < values.length; index += 1) {
    const start = Math.max(0, index - radius)
    const end = Math.min(values.length, index + radius + 1)
    const window: number[] = []
    for (let cursor = start; cursor < end; cursor += 1) {
      if (cursor !== index) window.push(values[cursor])
    }
    window.sort((a, b) => a - b)
    result[index] =
      window.length === 0
        ? 0
        : window.length % 2 === 1
          ? window[(window.length - 1) / 2]
          : (window[window.length / 2 - 1] + window[window.length / 2]) / 2
  }
  return result
}

function movingAverage(values: number[], radius: number): number[] {
  return values.map((_, index) => {
    const start = Math.max(0, index - radius)
    const end = Math.min(values.length, index + radius + 1)
    let sum = 0
    for (let cursor = start; cursor < end; cursor += 1) sum += values[cursor]
    return sum / (end - start)
  })
}

/** 抽取低分辨率灰度帧并计算逐帧差异，参考 rea-video 的 tiny-thumb 方案 */
export async function analyzeVideoFrames(
  path: string,
  signal?: AbortSignal
): Promise<FrameStats> {
  const probe = await probeMedia(path)
  const fps =
    probe.duration && probe.duration > 300 ? MIN_ANALYSIS_FPS : MAX_ANALYSIS_FPS
  const width = THUMB_WIDTH
  const height =
    probe.width && probe.height
      ? Math.max(2, Math.round((probe.height / probe.width) * width / 2) * 2)
      : 54

  const buffer = await runFfmpegBuffer(
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      path,
      '-vf',
      `fps=${fps},scale=${width}:${height},format=rgb24`,
      '-f',
      'rawvideo',
      '-'
    ],
    { signal }
  )

  const pixels = width * height
  const frameSize = pixels * 3
  const count = Math.floor(buffer.length / frameSize)
  const hist: Float32Array[] = []
  const pixDiff: number[] = []
  const changed: number[] = []
  const luma: number[] = []

  let previousOffset = -1

  for (let index = 0; index < count; index += 1) {
    const offset = index * frameSize
    const buckets = new Float32Array(64)
    let lumaSum = 0

    for (let pixel = 0; pixel < pixels; pixel += 1) {
      const base = offset + pixel * 3
      const r = buffer[base]
      const g = buffer[base + 1]
      const b = buffer[base + 2]
      const bucket = (r >> 6) * 16 + (g >> 6) * 4 + (b >> 6)
      buckets[bucket] += 1
      lumaSum += 0.299 * r + 0.587 * g + 0.114 * b
    }

    for (let bucket = 0; bucket < buckets.length; bucket += 1) {
      buckets[bucket] /= pixels
    }
    luma.push(lumaSum / pixels)

    if (previousOffset < 0) {
      hist.push(buckets)
      pixDiff.push(0)
      changed.push(0)
      previousOffset = offset
      continue
    }

    let diff = 0
    let changedPixels = 0
    for (let pixel = 0; pixel < pixels; pixel += 1) {
      const current = offset + pixel * 3
      const previous = previousOffset + pixel * 3
      const dr = Math.abs(buffer[current] - buffer[previous])
      const dg = Math.abs(buffer[current + 1] - buffer[previous + 1])
      const db = Math.abs(buffer[current + 2] - buffer[previous + 2])
      diff += (dr + dg + db) / 3
      if (dr + dg + db > 36) changedPixels += 1
    }

    hist.push(buckets)
    pixDiff.push(diff / pixels / 255)
    changed.push(changedPixels / pixels)
    previousOffset = offset
  }

  return {
    width,
    height,
    fps,
    count,
    hist,
    pixDiff,
    changed,
    luma
  }
}

function histDistance(a: Float32Array, b: Float32Array): number {
  let sum = 0
  for (let index = 0; index < a.length; index += 1) {
    sum += Math.sqrt(a[index] * b[index])
  }
  return Math.sqrt(Math.max(0, 1 - sum))
}

/** 硬切 + 同机位跳切检测 */
export function detectShotCuts(stats: FrameStats): DetectedCut[] {
  const { count, fps } = stats
  if (count < 3) return []

  const score = new Array<number>(count).fill(0)
  for (let index = 1; index < count; index += 1) {
    score[index] =
      0.6 * histDistance(stats.hist[index - 1], stats.hist[index]) +
      0.4 * Math.min(stats.pixDiff[index] * 4, 1)
  }

  const radius = Math.max(4, Math.round(fps * 0.5))
  const base = localMedian(score, radius)
  const changedBase = localMedian(stats.changed, radius)
  const diffBase = localMedian(stats.pixDiff, radius)
  const cuts: DetectedCut[] = []

  for (let index = 1; index < count; index += 1) {
    const value = score[index]
    const changed = stats.changed[index]

    const hardCut =
      value > 0.3 &&
      value > base[index] * 2.5 + 0.06 &&
      changed > 0.25

    const relative =
      changed > 0.45 &&
      changed > changedBase[index] * 3 + 0.2 &&
      value > base[index] * 4 + 0.03

    const jump =
      changed > 0.17 &&
      changed > 2.5 * (changedBase[index] + 0.02) &&
      stats.pixDiff[index] > 2 * (diffBase[index] + 0.004)

    if (hardCut || relative) {
      cuts.push({ time: index / fps, kind: 'cut', score: value })
    } else if (jump) {
      cuts.push({ time: index / fps, kind: 'jump', score: changed })
    }
  }

  return mergeNear(cuts, 0.35)
}

/** 动作峰值：固定机位舞蹈等没有硬切时，用画面变化峰值给出可切位置 */
export function detectMotionPeaks(stats: FrameStats): DetectedCut[] {
  const { count, fps } = stats
  if (count < 3) return []

  const smooth = movingAverage(stats.pixDiff, 2)
  let sum = 0
  for (const value of smooth) sum += value
  const average = sum / Math.max(1, smooth.length)
  const threshold = Math.max(0.01, average * 1.2)

  const peaks: DetectedCut[] = []
  for (let index = 2; index < count - 2; index += 1) {
    const value = smooth[index]
    if (value < threshold) continue
    if (value < smooth[index - 1] || value < smooth[index + 1]) continue
    if (value === smooth[index - 1] && value === smooth[index + 1]) continue
    peaks.push({ time: index / fps, kind: 'motion', score: value })
  }

  peaks.sort((a, b) => b.score - a.score)
  const picked: DetectedCut[] = []
  for (const peak of peaks) {
    if (picked.length >= 10) break
    if (picked.some((item) => Math.abs(item.time - peak.time) < 0.9)) continue
    picked.push(peak)
  }
  picked.sort((a, b) => a.time - b.time)
  return picked
}

function mergeNear(cuts: DetectedCut[], minGap: number): DetectedCut[] {
  const sorted = [...cuts].sort((a, b) => a.time - b.time)
  const result: DetectedCut[] = []
  for (const cut of sorted) {
    const previous = result[result.length - 1]
    if (previous && cut.time - previous.time < minGap) {
      if (cut.score > previous.score) result[result.length - 1] = cut
      continue
    }
    result.push(cut)
  }
  return result
}

/**
 * 生成候选切点（含 0 和结尾）：
 * - 有硬切时优先用硬切
 * - 连续镜头用动作峰值补充
 * - 仍然不足时按固定间隔兜底
 */
export function buildCandidateTimes(
  detected: DetectedCut[],
  duration: number,
  maxSegments = 12
): number[] {
  const hardCuts = detected.filter((cut) => cut.kind !== 'motion')
  const motion = detected.filter((cut) => cut.kind === 'motion')

  const points = new Set<number>([0, duration])

  if (hardCuts.length >= 2) {
    for (const cut of hardCuts.slice(0, maxSegments - 1)) {
      points.add(cut.time)
    }
  } else {
    for (const cut of motion.slice(0, Math.min(8, maxSegments - 2))) {
      points.add(cut.time)
    }
    if (points.size < 4) {
      const step = duration > 12 ? 2.5 : 2
      for (let time = step; time < duration - 0.5; time += step) {
        points.add(time)
      }
    }
  }

  const sorted = [...points]
    .map((time) => Math.min(duration, Math.max(0, time)))
    .sort((a, b) => a - b)

  const deduped: number[] = []
  for (const time of sorted) {
    const previous = deduped[deduped.length - 1]
    if (previous !== undefined && time - previous < 0.5) continue
    deduped.push(time)
  }

  if (deduped.length < 2) return [0, duration]
  const last = deduped[deduped.length - 1]
  if (duration - last > 0.5) deduped.push(duration)
  else deduped[deduped.length - 1] = duration

  return deduped.slice(0, maxSegments + 1)
}
