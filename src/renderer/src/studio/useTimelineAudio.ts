import { useEffect, useRef } from 'react'
import type { MediaProbe } from '@shared/media'
import type { TimelineDoc } from '@shared/timeline-schema'
import { evaluateClipKeys } from '@shared/timeline-keyframes'
import { assetUrl } from '../lib/asset-url'

/**
 * 时间线音频混音：播放音频轨与视频自带音频，并跟随关键帧音量。
 * 起点通过 getter 传入，避免播放头每帧变化导致 effect 重建。
 */
export function useTimelineAudio(
  doc: TimelineDoc | null,
  playing: boolean,
  getTimeMs: () => number
): void {
  const probeRef = useRef(new Map<string, Promise<MediaProbe | null>>())
  const getTimeRef = useRef(getTimeMs)
  getTimeRef.current = getTimeMs

  useEffect(() => {
    if (!playing || !doc) return

    const elements: {
      audio: HTMLAudioElement
      clip: TimelineDoc['clips'][number]
    }[] = []
    const timers: number[] = []
    const startSeconds = Math.max(0, getTimeRef.current()) / 1000
    const trackById = new Map(doc.tracks.map((track) => [track.id, track]))
    let cancelled = false
    let frame = 0

    const probeAudio = (path: string): Promise<MediaProbe | null> => {
      let cached = probeRef.current.get(path)
      if (!cached) {
        cached = window.api.media.probe(path).catch(() => null)
        probeRef.current.set(path, cached)
      }
      return cached
    }

    const playElement = (
      clip: TimelineDoc['clips'][number],
      url: string,
      volume: number,
      rate: number,
      delay: number,
      offset: number,
      duration: number
    ): void => {
      const audio = new Audio(url)
      audio.preload = 'auto'
      audio.volume = Math.max(0, Math.min(1, volume))
      audio.playbackRate = Math.max(0.25, Math.min(4, rate))
      audio.preservesPitch = clip.preservePitch
      elements.push({ audio, clip })

      const begin = (): void => {
        if (cancelled) return
        audio.currentTime = Math.max(0, offset)
        void audio.play().catch(() => undefined)
        timers.push(
          window.setTimeout(
            () => {
              if (!cancelled) audio.pause()
            },
            Math.max(0, duration) * 1000
          )
        )
      }

      if (delay <= 0.001) {
        begin()
      } else {
        timers.push(window.setTimeout(begin, delay * 1000))
      }
    }

    for (const clip of doc.clips) {
      if (clip.muted || !clip.media) continue
      const track = trackById.get(clip.trackId)
      if (track?.muted) continue
      const clipStart = clip.startMs / 1000
      const clipEnd = (clip.startMs + clip.durationMs) / 1000
      if (clipEnd <= startSeconds) continue

      const elapsed = Math.max(0, startSeconds - clipStart)
      const delay = Math.max(0, clipStart - startSeconds)
      const rate = Math.max(0.25, Math.min(4, clip.speed || 1))
      const offset = clip.sourceStartMs / 1000 + elapsed * rate
      const duration = clip.durationMs / 1000 - elapsed
      if (duration <= 0) continue

      if (clip.kind === 'audio') {
        const media = clip.media
        playElement(
          clip,
          assetUrl(media.path, media.scope),
          clip.volume,
          rate,
          delay,
          offset,
          duration
        )
      } else if (clip.kind === 'video') {
        const media = clip.media
        void probeAudio(media.path).then((probe) => {
          if (cancelled || !probe?.hasAudio) return
          playElement(
            clip,
            assetUrl(media.path, media.scope),
            clip.volume,
            rate,
            delay,
            offset,
            duration
          )
        })
      }
    }

    const updateVolumes = (): void => {
      if (cancelled) return
      const timeMs = getTimeRef.current()
      for (const { audio, clip } of elements) {
        const inside =
          timeMs >= clip.startMs && timeMs < clip.startMs + clip.durationMs
        const volume = inside
          ? evaluateClipKeys(clip, timeMs).volume
          : clip.volume
        audio.volume = Math.max(0, Math.min(1, volume))
      }
      frame = requestAnimationFrame(updateVolumes)
    }
    frame = requestAnimationFrame(updateVolumes)

    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      for (const timer of timers) window.clearTimeout(timer)
      for (const { audio } of elements) {
        audio.pause()
        audio.src = ''
      }
    }
  }, [playing, doc])
}
