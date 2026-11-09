import { useEffect, useMemo, useState } from 'react'
import type { TimelineClip } from '@shared/timeline-schema'
import { assetUrl } from '../lib/asset-url'

const MAX_FRAMES = 8
const FRAME_WIDTH_PX = 80
const POOL_INTERVAL_MS = 1000

/** 时间线片段内的多帧缩略图 / 音频波形 */
export function ClipMedia({ clip, widthPx }: { clip: TimelineClip; widthPx: number }) {
  const [pool, setPool] = useState<string[]>([])
  const [wave, setWave] = useState<{ src: string; totalMs: number } | null>(null)
  const path = clip.media?.path
  const scope = clip.media?.scope
  const kind = clip.media?.kind

  // 抽帧池固定按时间间隔生成，缩放时不重新抽帧
  const poolCount = Math.min(
    MAX_FRAMES,
    Math.max(2, Math.ceil(Math.max(clip.durationMs, 1) / POOL_INTERVAL_MS))
  )
  // 显示帧数随像素宽度变化，极窄片段允许 1 帧
  const frameCount = Math.min(
    MAX_FRAMES,
    Math.max(1, Math.ceil(Math.max(widthPx, 1) / FRAME_WIDTH_PX))
  )

  useEffect(() => {
    setPool([])
    setWave(null)
    if (!path || !kind) return

    let cancelled = false

    if (kind === 'image') {
      setPool([assetUrl(path, scope)])
      return
    }

    if (kind === 'video') {
      const step = clip.durationMs / poolCount
      const times = Array.from(
        { length: poolCount },
        (_, index) => (clip.sourceStartMs + step * index) / 1000
      )
      void Promise.all(times.map((at) => window.api.media.thumbnail(path, at, 'video')))
        .then((urls) => {
          if (cancelled) return
          setPool(urls.filter((url): url is string => Boolean(url)))
        })
        .catch(() => undefined)
      return () => {
        cancelled = true
      }
    }

    if (kind === 'audio') {
      void Promise.all([
        window.api.media.thumbnail(path, 0, 'audio'),
        window.api.media.probe(path).catch(() => null)
      ])
        .then(([src, probe]) => {
          if (cancelled || !src) return
          const totalMs = probe?.duration
            ? probe.duration * 1000
            : clip.sourceStartMs + clip.durationMs
          setWave({ src, totalMs })
        })
        .catch(() => undefined)
    }

    return () => {
      cancelled = true
    }
  }, [path, scope, kind, clip.sourceStartMs, clip.durationMs, poolCount])

  const frames = useMemo(() => {
    if (pool.length === 0) return []
    if (frameCount >= pool.length) return pool
    return Array.from(
      { length: frameCount },
      (_, index) => pool[Math.min(pool.length - 1, Math.floor((index * pool.length) / frameCount))]
    )
  }, [pool, frameCount])

  if (frames.length > 0) {
    return (
      <div
        className="studio-clip__frames is-repeat"
        style={{ backgroundImage: `url(${frames[0]})` }}
      />
    )
  }

  if (wave) {
    const clipMs = Math.max(clip.durationMs, 1)
    const totalMs = Math.max(wave.totalMs, 1)
    const offsetMs = clip.sourceStartMs % totalMs
    const offsetPx = -((offsetMs / clipMs) * widthPx)
    return (
      <div
        className="studio-clip__wave"
        style={{
          backgroundImage: `url(${wave.src})`,
          backgroundSize: `${Math.max((totalMs / clipMs) * 100, 2)}% 100%`,
          backgroundRepeat: 'repeat-x',
          backgroundPositionX: `${offsetPx}px`
        }}
      />
    )
  }

  return null
}
