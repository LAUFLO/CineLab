import { probeMedia, runFfmpegBuffer } from './ffmpeg'

export interface SubtitleRect {
  x: number
  y: number
  width: number
  height: number
}

const ANALYSIS_WIDTH = 480
const BOTTOM_RATIO = 0.45
const MAX_SAMPLES = 6

function rowScores(gray: Buffer, width: number, height: number): number[] {
  const scores = new Array<number>(height).fill(0)

  for (let y = 0; y < height; y += 1) {
    const base = y * width
    let diff = 0
    for (let x = 1; x < width; x += 1) {
      diff += Math.abs(gray[base + x] - gray[base + x - 1])
    }
    scores[y] = diff / width
  }

  return scores
}

function markRows(scores: number[]): boolean[] {
  const average =
    scores.reduce((sum, value) => sum + value, 0) / Math.max(1, scores.length)
  const peak = Math.max(...scores)
  const threshold = Math.max(average * 2.2, peak * 0.32, 3)
  return scores.map((value) => value >= threshold)
}

function findBottomBand(mask: boolean[], minRows = 2): { top: number; bottom: number } | null {
  let bottom = -1
  let gap = 0

  for (let index = mask.length - 1; index >= 0; index -= 1) {
    if (mask[index]) {
      if (bottom < 0) bottom = index
      gap = 0
      continue
    }
    if (bottom >= 0) {
      gap += 1
      if (gap > 2) break
    }
  }

  if (bottom < 0) return null

  let top = bottom
  while (top > 0 && (mask[top - 1] || (top > 1 && mask[top - 2]))) {
    top -= 1
  }
  if (bottom - top + 1 < minRows) return null
  return { top, bottom }
}

function columnRange(
  gray: Buffer,
  width: number,
  band: { top: number; bottom: number }
): { left: number; right: number } {
  const height = band.bottom - band.top + 1
  const scores = new Array<number>(width).fill(0)

  for (let x = 1; x < width; x += 1) {
    let diff = 0
    for (let y = band.top; y <= band.bottom; y += 1) {
      const base = y * width
      diff += Math.abs(gray[base + x] - gray[base + x - 1])
    }
    scores[x] = diff / Math.max(1, height)
  }

  const average =
    scores.reduce((sum, value) => sum + value, 0) / Math.max(1, width)
  const threshold = Math.max(average * 1.8, 2)
  let left = -1
  let right = -1

  for (let x = 1; x < width; x += 1) {
    if (scores[x] < threshold) continue
    if (left < 0) left = x
    right = x
  }

  if (left < 0 || right - left < width * 0.18) {
    return { left: Math.round(width * 0.12), right: Math.round(width * 0.88) }
  }

  return { left, right }
}

export async function detectSubtitleRect(
  path: string
): Promise<SubtitleRect | null> {
  const probe = await probeMedia(path)
  if (!probe.width || !probe.height || !probe.duration) return null

  const frameCount = Math.min(
    MAX_SAMPLES,
    Math.max(3, Math.round(probe.duration / 2))
  )
  const samples: Buffer[] = []

  for (let index = 0; index < frameCount; index += 1) {
    const ratio = (index + 0.5) / frameCount
    const time = Math.min(
      Math.max(0.1, probe.duration * ratio),
      Math.max(0.1, probe.duration - 0.1)
    )
    try {
      const buffer = await runFfmpegBuffer([
        '-hide_banner',
        '-loglevel',
        'error',
        '-ss',
        time.toFixed(3),
        '-i',
        path,
        '-frames:v',
        '1',
        '-vf',
        `crop=iw:ih*${BOTTOM_RATIO}:0:ih*${1 - BOTTOM_RATIO},scale=${ANALYSIS_WIDTH}:-2,format=gray`,
        '-f',
        'rawvideo',
        '-'
      ])
      if (buffer.length > 0 && buffer.length % ANALYSIS_WIDTH === 0) {
        samples.push(buffer)
      }
    } catch {
      // 单帧失败不影响整体检测
    }
  }

  if (samples.length === 0) return null

  const analysisHeight = Math.floor(samples[0].length / ANALYSIS_WIDTH)
  if (analysisHeight < 8) return null

  const hits = new Array<number>(analysisHeight).fill(0)

  for (const sample of samples) {
    if (sample.length < ANALYSIS_WIDTH * analysisHeight) continue
    const gray = sample.subarray(0, ANALYSIS_WIDTH * analysisHeight)
    const scores = rowScores(gray, ANALYSIS_WIDTH, analysisHeight)
    const mask = markRows(scores)
    for (let y = 0; y < analysisHeight; y += 1) {
      if (mask[y]) hits[y] += 1
    }
  }

  const required = Math.max(1, Math.ceil(samples.length * 0.5))
  const combined = hits.map((count) => count >= required)
  const band = findBottomBand(combined)
  if (!band) return null

  const bandHeight = band.bottom - band.top + 1
  if (bandHeight > analysisHeight * 0.2) {
    // 大面积高纹理通常不是字幕，收窄到最底部
    const narrowed = {
      top: Math.max(band.top, band.bottom - Math.round(analysisHeight * 0.12)),
      bottom: band.bottom
    }
    band.top = narrowed.top
  }

  const sample = samples[0]
  const gray = sample.subarray(0, ANALYSIS_WIDTH * analysisHeight)
  const columns = columnRange(gray, ANALYSIS_WIDTH, band)

  const cropTop = probe.height * (1 - BOTTOM_RATIO)
  const cropHeight = probe.height * BOTTOM_RATIO
  const scaleY = cropHeight / analysisHeight
  const scaleX = probe.width / ANALYSIS_WIDTH

  const rawX = columns.left * scaleX
  const rawRight = columns.right * scaleX
  const rawY = cropTop + band.top * scaleY
  const rawBottom = cropTop + (band.bottom + 1) * scaleY

  const paddingX = Math.max(8, probe.width * 0.03)
  const paddingY = Math.max(4, probe.height * 0.012)

  const x = Math.max(0, Math.round(rawX - paddingX))
  const y = Math.max(0, Math.round(rawY - paddingY))
  const right = Math.min(probe.width, Math.round(rawRight + paddingX))
  const bottom = Math.min(probe.height, Math.round(rawBottom + paddingY))
  const width = right - x
  const height = bottom - y

  if (width < probe.width * 0.1 || height < probe.height * 0.015) {
    return null
  }

  return { x, y, width, height }
}
