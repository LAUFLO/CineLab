import type { TimelineClip, TimelineDoc } from '@shared/timeline-schema'
import { volumeExpression } from '@shared/timeline-keyframes'
import { audioFxFilters } from '@shared/audio-fx'
import { probeMedia } from '../media/ffmpeg'
import { resolveMediaPath } from '../media/paths'

export interface AudioInput {
  clip: TimelineClip
  path: string
}

export interface AudioFilterPlan {
  filters: string[]
  labels: string[]
  outputLabel: string
}

function atempoChain(speed: number): string[] {
  const parts: string[] = []
  let remaining = speed

  while (remaining > 2.0001) {
    parts.push('atempo=2')
    remaining /= 2
  }
  while (remaining < 0.4999) {
    parts.push('atempo=0.5')
    remaining /= 0.5
  }
  if (Math.abs(remaining - 1) > 0.0001) {
    parts.push(`atempo=${remaining.toFixed(4)}`)
  }

  return parts
}

function nextClipForTransition(
  doc: TimelineDoc,
  clip: TimelineClip
): TimelineClip | null {
  const end = clip.startMs + clip.durationMs
  const next = doc.clips
    .filter(
      (item) =>
        item.trackId === clip.trackId &&
        item.id !== clip.id &&
        item.startMs >= end &&
        item.transitionIn
    )
    .sort((a, b) => a.startMs - b.startMs)[0]

  if (!next) return null
  if (Math.abs(next.startMs - end) > 2) return null
  return next
}

/** 收集所有可混音的音频片段：音频轨 + 有音轨的视频 */
export async function collectAudioInputs(
  projectRoot: string,
  doc: TimelineDoc
): Promise<AudioInput[]> {
  const audio: AudioInput[] = []
  const probeCache = new Map<string, boolean>()
  const trackById = new Map(doc.tracks.map((track) => [track.id, track]))

  for (const clip of doc.clips) {
    if (clip.muted || !clip.media) continue
    if (clip.kind !== 'audio' && clip.kind !== 'video') continue
    const track = trackById.get(clip.trackId)
    if (track?.muted) continue

    try {
      const path = await resolveMediaPath(projectRoot, clip.media.path)
      const needsProbe =
        clip.kind === 'video' ||
        (clip.kind === 'audio' && clip.media.kind === 'video')
      if (needsProbe) {
        let hasAudio = probeCache.get(path)
        if (hasAudio === undefined) {
          hasAudio =
            (await probeMedia(path).catch(() => null))?.hasAudio ?? false
          probeCache.set(path, hasAudio)
        }
        if (!hasAudio) continue
      }
      audio.push({ clip, path })
    } catch {
      // 素材缺失时跳过
    }
  }

  return audio
}

/**
 * 生成音频 filter graph：
 * - 按源片段裁剪、变速、音量关键帧、淡入淡出、延迟
 * - 同轨下一片段有转场时，延长上一片段尾部并交叉淡化
 */
export function buildAudioFilters(
  doc: TimelineDoc,
  inputs: AudioInput[],
  startIndex = 0
): AudioFilterPlan {
  const filters: string[] = []
  const labels: string[] = []

  inputs.forEach((item, index) => {
    const { clip } = item
    const sourceStart = Math.max(0, clip.sourceStartMs) / 1000
    const duration = Math.max(0.01, clip.durationMs) / 1000
    const speed = Math.max(0.1, Math.min(10, clip.speed || 1))
    const next = nextClipForTransition(doc, clip)
    const tail = next?.transitionIn
      ? Math.max(0, next.transitionIn.durationMs) / 1000
      : 0
    const outputDuration = duration + tail
    const sourceDuration = outputDuration * speed
    const delayMs = Math.max(0, Math.round(clip.startMs))

    const parts = [
      `atrim=start=${sourceStart.toFixed(3)}:duration=${sourceDuration.toFixed(
        3
      )}`,
      'asetpts=PTS-STARTPTS'
    ]

    if (speed !== 1) {
      if (clip.preservePitch) {
        parts.push(...atempoChain(speed))
      } else {
        parts.push(
          'aresample=48000',
          `asetrate=${Math.round(48000 * speed)}`,
          'aresample=48000'
        )
      }
    }

    const fxFilters = audioFxFilters(clip.audioFx)
    if (fxFilters.length > 0) {
      parts.push(...fxFilters)
      if (clip.audioFx?.loudness) {
        parts.push(`atrim=duration=${outputDuration.toFixed(3)}`)
      }
    }

    const volumeExpr = volumeExpression(clip)
    parts.push(
      `apad=whole_dur=${outputDuration.toFixed(3)}`,
      volumeExpr
        ? `volume='${volumeExpr}'`
        : `volume=${Math.max(0, clip.volume)}`
    )

    const transitionFade = clip.transitionIn
      ? Math.max(0, clip.transitionIn.durationMs) / 1000
      : 0
    const fadeIn = Math.max(clip.fadeInMs / 1000, transitionFade)
    if (fadeIn > 0) {
      parts.push(`afade=t=in:st=0:d=${fadeIn.toFixed(3)}`)
    }

    const fadeOut =
      tail > 0 ? tail : Math.min(duration, clip.fadeOutMs / 1000)
    if (fadeOut > 0) {
      const outStart = Math.max(
        0,
        outputDuration - fadeOut
      )
      parts.push(`afade=t=out:st=${outStart.toFixed(3)}:d=${fadeOut.toFixed(3)}`)
    }

    if (delayMs > 0) parts.push(`adelay=${delayMs}:all=1`)

    filters.push(
      `[${startIndex + index}:a:0]${parts.join(',')}[a${index}]`
    )
    labels.push(`[a${index}]`)
  })

  if (labels.length > 1) {
    filters.push(
      `${labels.join('')}amix=inputs=${labels.length}:normalize=0[outa]`
    )
    return { filters, labels, outputLabel: '[outa]' }
  }

  if (labels.length === 1) {
    filters.push('[a0]anull[outa]')
    return { filters, labels, outputLabel: '[outa]' }
  }

  return { filters, labels, outputLabel: '' }
}
