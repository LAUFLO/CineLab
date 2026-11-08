import { useEffect, useRef, useState } from 'react'
import type { MediaProbe } from '@shared/media'
import type { TimelineDoc } from '@shared/timeline-schema'
import { docDurationMs } from '@shared/timeline-layout'
import { evaluateClipKeys } from '@shared/timeline-keyframes'
import { assetUrl } from '../lib/asset-url'
import { useTimelineStore } from '../stores/timeline'
import { createPools, MEDIA_READY_EVENT, renderTimeline } from './renderer'

export function PreviewStage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const poolsRef = useRef(createPools())
  const probeRef = useRef(new Map<string, Promise<MediaProbe | null>>())
  const [proxyVersion, setProxyVersion] = useState(0)
  const [mediaVersion, setMediaVersion] = useState(0)
  const doc = useTimelineStore((state) => state.doc)
  const playheadMs = useTimelineStore((state) => state.playheadMs)
  const playing = useTimelineStore((state) => state.playing)

  useEffect(() => {
    const onReady = (): void => setMediaVersion((value) => value + 1)
    window.addEventListener(MEDIA_READY_EVENT, onReady)
    return () => window.removeEventListener(MEDIA_READY_EVENT, onReady)
  }, [])

  const proxySignature = doc
    ? doc.clips
        .filter((clip) => clip.kind === 'video' && clip.media)
        .map((clip) => `${clip.id}:${clip.media!.scope}:${clip.media!.path}`)
        .join('|')
    : ''

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !doc) return
    if (canvas.width !== doc.video.width || canvas.height !== doc.video.height) {
      canvas.width = doc.video.width
      canvas.height = doc.video.height
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    renderTimeline({
      ctx,
      doc,
      timeMs: playheadMs,
      pools: poolsRef.current,
      playing
    })
  }, [doc, playheadMs, playing, proxyVersion, mediaVersion])

  // 后台生成 540p 代理，生成后切换视频源
  useEffect(() => {
    if (!doc) return
    let cancelled = false
    const pools = poolsRef.current
    for (const clip of doc.clips) {
      if (clip.kind !== 'video' || !clip.media) continue
      if (pools.proxies.has(clip.id)) continue
      void window.api.media
        .proxy(clip.media.path)
        .then((proxy) => {
          if (cancelled || !proxy) return
          pools.proxies.set(clip.id, assetUrl(proxy, 'project'))
          pools.failed.delete(clip.id)
          pools.videos.delete(clip.id)
          setProxyVersion((value) => value + 1)
        })
        .catch(() => undefined)
    }
    return () => {
      cancelled = true
    }
    // 只依赖素材集合，片段位置变化不重新请求代理
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proxySignature])

  useEffect(() => {
    if (!playing || !doc) return
    let last = performance.now()
    let frame = 0
    const total = Math.max(docDurationMs(doc), 1)

    const tick = (now: number): void => {
      const delta = now - last
      last = now
      const state = useTimelineStore.getState()
      const next = Math.min(total, state.playheadMs + delta)
      state.setPlayhead(next)
      if (next >= total) {
        state.pause()
        return
      }
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, doc])

  // 播放时混合音频轨与视频自带的音频
  useEffect(() => {
    if (!playing || !doc) return

    const elements: { audio: HTMLAudioElement; clip: TimelineDoc['clips'][number] }[] = []
    const timers: number[] = []
    const startSeconds = useTimelineStore.getState().playheadMs / 1000
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
          window.setTimeout(() => {
            if (!cancelled) audio.pause()
          }, Math.max(0, duration) * 1000)
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

    // 音量关键帧：直接跟随时间线播放头更新元素音量
    const updateVolumes = (): void => {
      if (cancelled) return
      const timeMs = useTimelineStore.getState().playheadMs
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

  return <canvas ref={canvasRef} className="studio-preview__canvas" />
}
