import type { TimelineClip, TimelineDoc } from '@shared/timeline-schema'
import { evaluateClipKeys, type EvaluatedClip } from '@shared/timeline-keyframes'
import { canvasFilterString } from '@shared/filters'
import { transitionState } from '@shared/timeline-transition'
import { assetUrl } from '../lib/asset-url'

export const MEDIA_READY_EVENT = 'cinelab:media-ready'

function notifyMediaReady(): void {
  window.dispatchEvent(new CustomEvent(MEDIA_READY_EVENT))
}

export interface RendererPools {
  videos: Map<string, HTMLVideoElement>
  images: Map<string, HTMLImageElement>
  failed: Set<string>
  proxies: Map<string, string>
  playing: boolean
}

export function createPools(): RendererPools {
  return {
    videos: new Map(),
    images: new Map(),
    failed: new Set(),
    proxies: new Map(),
    playing: false
  }
}

export interface RenderInput {
  ctx: CanvasRenderingContext2D
  doc: TimelineDoc
  timeMs: number
  pools: RendererPools
  playing?: boolean
}

const BLEND_TO_COMPOSITE: Record<string, GlobalCompositeOperation> = {
  normal: 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  add: 'lighter',
  lighten: 'lighten',
  darken: 'darken'
}

function mediaUrl(clip: TimelineClip): string | null {
  if (!clip.media) return null
  return assetUrl(clip.media.path, clip.media.scope)
}

function ensureVideo(pools: RendererPools, clip: TimelineClip): HTMLVideoElement | null {
  if (!clip.media || clip.media.kind !== 'video') return null
  const url = pools.proxies.get(clip.id) ?? mediaUrl(clip)
  if (!url) return null
  let video = pools.videos.get(clip.id)
  if (video) {
    if (video.src !== url) {
      video.src = url
      video.load()
    }
    return video
  }
  video = document.createElement('video')
  video.crossOrigin = 'anonymous'
  video.src = url
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.addEventListener('error', () => {
    const proxy = pools.proxies.get(clip.id)
    if (proxy) {
      pools.proxies.delete(clip.id)
      const fallback = mediaUrl(clip)
      if (fallback) {
        video.src = fallback
        video.load()
        return
      }
    }
    pools.failed.add(clip.id)
  })
  video.addEventListener('loadeddata', notifyMediaReady)
  video.addEventListener('seeked', () => {
    if (!pools.playing) notifyMediaReady()
  })
  video.load()
  pools.videos.set(clip.id, video)
  return video
}

function ensureImage(pools: RendererPools, clip: TimelineClip): HTMLImageElement | null {
  if (!clip.media || clip.media.kind !== 'image') return null
  const url = mediaUrl(clip)
  if (!url) return null
  let image = pools.images.get(clip.id)
  if (!image) {
    image = new Image()
    image.crossOrigin = 'anonymous'
    image.src = url
    image.addEventListener('error', () => pools.failed.add(clip.id))
    image.addEventListener('load', notifyMediaReady)
    pools.images.set(clip.id, image)
  }
  return image
}

function sourceSize(source: HTMLVideoElement | HTMLImageElement): [number, number] {
  if (source instanceof HTMLVideoElement) {
    return [source.videoWidth, source.videoHeight]
  }
  return [source.naturalWidth, source.naturalHeight]
}

interface DrawEffect {
  translateX?: number
  translateY?: number
  scale?: number
}

function drawVignette(ctx: CanvasRenderingContext2D, intensity: number): void {
  if (intensity <= 0) return
  const width = ctx.canvas.width
  const height = ctx.canvas.height
  const gradient = ctx.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.25,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.75
  )
  gradient.addColorStop(0, 'rgba(0,0,0,0)')
  gradient.addColorStop(1, `rgba(0,0,0,${Math.min(0.85, intensity * 0.7)})`)
  ctx.save()
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)
  ctx.restore()
}

function drawMedia(
  ctx: CanvasRenderingContext2D,
  clip: TimelineClip,
  source: HTMLVideoElement | HTMLImageElement,
  keys: EvaluatedClip,
  alpha = 1,
  effect?: DrawEffect
): void {
  const [sw, sh] = sourceSize(source)
  if (!sw || !sh) return

  const width = ctx.canvas.width
  const height = ctx.canvas.height
  const stretchX = clip.transform?.stretchX ?? 1
  const stretchY = clip.transform?.stretchY ?? 1

  // 等比适应画幅，避免非本比例素材被裁剪
  const fit = Math.min(width / sw, height / sh)
  const drawWidth = sw * fit * keys.scale * stretchX
  const drawHeight = sh * fit * keys.scale * stretchY
  const filterValue = canvasFilterString(clip.filter)

  ctx.save()
  if (filterValue) ctx.filter = filterValue
  ctx.globalAlpha = Math.min(1, Math.max(0, keys.opacity * alpha))
  ctx.globalCompositeOperation = BLEND_TO_COMPOSITE[clip.blend] ?? 'source-over'
  ctx.translate(
    width / 2 + keys.position.x * width + (effect?.translateX ?? 0),
    height / 2 + keys.position.y * height + (effect?.translateY ?? 0)
  )
  ctx.rotate((keys.rotation * Math.PI) / 180)
  if (effect?.scale && effect.scale !== 1) {
    ctx.scale(effect.scale, effect.scale)
  }
  ctx.drawImage(source, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight)
  ctx.restore()

  if (clip.filter?.vignette) {
    drawVignette(ctx, clip.filter.vignette)
  }
}

function drawText(
  ctx: CanvasRenderingContext2D,
  clip: TimelineClip,
  doc: TimelineDoc,
  keys: EvaluatedClip,
  alpha = 1
): void {
  const text = clip.text
  if (!text || !text.content) return

  const width = ctx.canvas.width
  const height = ctx.canvas.height
  const ratio = height / doc.video.height
  const fontSize = text.fontSize * ratio
  const lines = text.content.split('\n')
  const lineHeight = fontSize * 1.28
  const baseY = height - 120 * ratio
  const startY = baseY - (lines.length - 1) * lineHeight

  ctx.save()
  ctx.globalAlpha = Math.min(1, Math.max(0, keys.opacity * alpha))
  ctx.font = `${text.italic ? 'italic ' : ''}${text.bold ? 'bold ' : ''}${fontSize}px ${text.fontFamily}`
  ctx.textAlign = text.align
  ctx.textBaseline = 'middle'

  const x = text.align === 'left' ? 60 * ratio : text.align === 'right' ? width - 60 * ratio : width / 2

  if (text.background) {
    const padding = text.background.padding * ratio
    const widest = Math.max(...lines.map((line) => ctx.measureText(line).width))
    const boxWidth = widest + padding * 2
    const boxHeight = lines.length * lineHeight + padding * 1.2
    const boxX =
      text.align === 'left'
        ? x - padding
        : text.align === 'right'
          ? x - boxWidth + padding
          : x - boxWidth / 2
    const boxY = startY - lineHeight / 2 - padding * 0.6
    ctx.fillStyle = text.background.color
    ctx.beginPath()
    ctx.roundRect(boxX, boxY, boxWidth, boxHeight, text.background.radius * ratio)
    ctx.fill()
  }

  if (text.shadow) {
    ctx.shadowColor = text.shadow.color
    ctx.shadowBlur = text.shadow.blur * ratio
    ctx.shadowOffsetX = text.shadow.offsetX * ratio
    ctx.shadowOffsetY = text.shadow.offsetY * ratio
  }

  lines.forEach((line, index) => {
    const y = startY + index * lineHeight
    if (text.stroke && text.stroke.width > 0) {
      ctx.lineWidth = text.stroke.width * ratio
      ctx.strokeStyle = text.stroke.color
      ctx.lineJoin = 'round'
      ctx.strokeText(line, x, y)
    }
    ctx.fillStyle = text.color
    ctx.fillText(line, x, y)
  })

  ctx.restore()
}

function sourceTime(clip: TimelineClip, timeMs: number): number {
  return (
    clip.sourceStartMs / 1000 +
    ((timeMs - clip.startMs) / 1000) * clip.speed
  )
}

/** 同一轨道上紧邻当前片段、且尾部正好接上当前片段的上一片段 */
function previousClipForTransition(
  doc: TimelineDoc,
  clip: TimelineClip
): TimelineClip | null {
  const candidates = doc.clips
    .filter(
      (item) =>
        item.trackId === clip.trackId &&
        item.id !== clip.id &&
        item.startMs < clip.startMs
    )
    .sort(
      (a, b) =>
        a.startMs + a.durationMs - (b.startMs + b.durationMs)
    )

  const previous = candidates.at(-1)
  if (!previous) return null
  if (
    Math.abs(previous.startMs + previous.durationMs - clip.startMs) > 2
  ) {
    return null
  }
  return previous
}

function drawClipFrame(
  ctx: CanvasRenderingContext2D,
  clip: TimelineClip,
  timeMs: number,
  alpha: number,
  doc: TimelineDoc,
  pools: RendererPools,
  effect?: DrawEffect
): void {
  const keys = evaluateClipKeys(clip, timeMs)

  if (clip.kind === 'text') {
    drawText(ctx, clip, doc, keys, alpha)
    return
  }
  if (clip.kind === 'audio' || clip.muted) return
  if (pools.failed.has(clip.id)) return

  const source =
    clip.kind === 'image' ? ensureImage(pools, clip) : ensureVideo(pools, clip)
  if (!source) return

  if (source instanceof HTMLVideoElement) {
    if (source.readyState < 2) return
    const target = sourceTime(clip, timeMs)
    if (Math.abs(source.currentTime - target) > 0.04) {
      source.currentTime = Math.max(0, target)
    }
  } else if (!source.complete || !source.naturalWidth) {
    return
  }

  drawMedia(ctx, clip, source, keys, alpha, effect)
}

/** 把时间线在 timeMs 的一帧画到 canvas */
export function renderTimeline({ ctx, doc, timeMs, pools, playing }: RenderInput): void {
  const width = ctx.canvas.width
  const height = ctx.canvas.height

  pools.playing = Boolean(playing)

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, height)

  // 轨道顺序是从上到下，绘制时从下到上
  const tracks = [...doc.tracks].reverse()
  for (const track of tracks) {
    if (!track.visible || track.kind === 'audio') continue

    const active = doc.clips
      .filter(
        (clip) =>
          clip.trackId === track.id &&
          clip.startMs <= timeMs &&
          clip.startMs + clip.durationMs > timeMs
      )
      .sort((a, b) => a.startMs - b.startMs)

    for (const clip of active) {
      const localMs = timeMs - clip.startMs
      const transition = transitionState(clip.transitionIn, localMs)

      if (transition && clip.kind !== 'text') {
        const previous = previousClipForTransition(doc, clip)
        const drawPrevious = (alpha: number, effect?: DrawEffect): void => {
          if (!previous) return
          drawClipFrame(
            ctx,
            previous,
            clip.startMs + localMs,
            alpha,
            doc,
            pools,
            effect
          )
        }

        if (
          transition.type === 'wipe-left' ||
          transition.type === 'wipe-right'
        ) {
          drawPrevious(1)
          ctx.save()
          ctx.beginPath()
          if (transition.type === 'wipe-left') {
            ctx.rect(0, 0, width * transition.progress, height)
          } else {
            ctx.rect(
              width * (1 - transition.progress),
              0,
              width * transition.progress,
              height
            )
          }
          ctx.clip()
          drawClipFrame(ctx, clip, timeMs, 1, doc, pools)
          ctx.restore()
          continue
        }

        if (
          transition.type === 'slide-left' ||
          transition.type === 'slide-right'
        ) {
          const direction = transition.type === 'slide-left' ? 1 : -1
          drawPrevious(1, {
            translateX: -direction * width * transition.progress
          })
          drawClipFrame(ctx, clip, timeMs, 1, doc, pools, {
            translateX: direction * width * (1 - transition.progress)
          })
          continue
        }

        if (transition.type === 'zoom-in') {
          drawPrevious(1 - transition.progress)
          drawClipFrame(
            ctx,
            clip,
            timeMs,
            transition.progress,
            doc,
            pools,
            { scale: 0.85 + 0.15 * transition.progress }
          )
          continue
        }

        if (previous) {
          drawPrevious(transition.outgoingAlpha)
        }
        drawClipFrame(
          ctx,
          clip,
          timeMs,
          transition.incomingAlpha,
          doc,
          pools
        )
        if (transition.blackAlpha > 0) {
          ctx.save()
          ctx.globalAlpha = transition.blackAlpha
          ctx.fillStyle = '#000'
          ctx.fillRect(0, 0, width, height)
          ctx.restore()
        }
        continue
      }

      drawClipFrame(ctx, clip, timeMs, 1, doc, pools)
    }
  }
}

export async function waitForMedia(
  doc: TimelineDoc,
  timeMs: number,
  pools: RendererPools
): Promise<void> {
  const waits: Promise<void>[] = []

  const waitVideo = (clip: TimelineClip, targetTimeMs: number): void => {
    const video = pools.videos.get(clip.id)
    if (!video) return
    const target = sourceTime(clip, targetTimeMs)
    waits.push(
      new Promise((resolve) => {
        const done = (): void => resolve()
        if (Math.abs(video.currentTime - target) > 0.04) {
          video.addEventListener('seeked', done, { once: true })
          video.currentTime = Math.max(0, target)
        } else {
          done()
        }
        window.setTimeout(done, 2000)
      })
    )
  }

  for (const clip of doc.clips) {
    if (clip.kind !== 'video' || clip.muted) continue
    if (clip.startMs > timeMs || clip.startMs + clip.durationMs <= timeMs) {
      continue
    }

    const transition = transitionState(clip.transitionIn, timeMs - clip.startMs)
    if (transition) {
      const previous = previousClipForTransition(doc, clip)
      if (previous && previous.kind === 'video' && !previous.muted) {
        waitVideo(previous, clip.startMs + (timeMs - clip.startMs))
      }
    }

    waitVideo(clip, timeMs)
  }

  await Promise.all(waits)
}

/** 渲染单帧为 PNG data URL，给 AI 预览和缩略图使用 */
export async function renderFrameToDataUrl(
  doc: TimelineDoc,
  timeMs: number
): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = doc.video.width
  canvas.height = doc.video.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建画布')

  const pools = createPools()
  renderTimeline({ ctx, doc, timeMs, pools })
  await waitForMedia(doc, timeMs, pools)
  renderTimeline({ ctx, doc, timeMs, pools })
  return canvas.toDataURL('image/png')
}
