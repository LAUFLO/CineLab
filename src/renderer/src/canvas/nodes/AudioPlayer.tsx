import { useEffect, useRef, useState, type MouseEvent } from 'react'

interface AudioPlayerProps {
  src: string | null
  path?: string | null
  scope?: 'project' | 'global'
  busy?: boolean
  onCancel?: () => void
}

const WAVE_BARS = 64
const FLAT_BARS = Array.from({ length: WAVE_BARS }, () => 0.06)
const waveformCache = new Map<string, number[]>()

async function decodeWithWebAudio(src: string): Promise<number[]> {
  const response = await fetch(src)
  const buffer = await response.arrayBuffer()
  const context = new AudioContext()

  try {
    const audio = await context.decodeAudioData(buffer.slice(0))
    const channel = audio.getChannelData(0)
    const block = Math.max(1, Math.floor(channel.length / WAVE_BARS))
    const peaks: number[] = []

    for (let index = 0; index < WAVE_BARS; index += 1) {
      const start = index * block
      const end = Math.min(channel.length, start + block)
      let peak = 0
      for (let cursor = start; cursor < end; cursor += 1) {
        const value = Math.abs(channel[cursor])
        if (value > peak) peak = value
      }
      peaks.push(peak)
    }

    const max = Math.max(...peaks, 0.0001)
    return peaks.map((peak) => Math.max(0.06, peak / max))
  } finally {
    void context.close()
  }
}

async function computeWaveform(
  src: string,
  path?: string | null,
  scope?: 'project' | 'global'
): Promise<number[]> {
  const key = path ? `${scope ?? 'project'}:${path}` : src
  const cached = waveformCache.get(key)
  if (cached) return cached

  let values: number[] | null = null

  if (path) {
    try {
      const peaks = await window.api.media.audioPeaks({
        path,
        scope,
        buckets: WAVE_BARS
      })
      if (peaks.length > 0) values = peaks
    } catch {
      // 主进程无法解析时退回 Web Audio
    }
  }

  if (!values) {
    values = await decodeWithWebAudio(src)
  }

  waveformCache.set(key, values)
  return values
}

export function timeLabel(seconds: number, pad = true): string {
  const total = Math.max(0, Math.floor(seconds || 0))
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  return pad
    ? `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
    : `${minutes}:${String(rest).padStart(2, '0')}`
}

export function AudioPlayer({
  src,
  path,
  scope,
  busy,
  onCancel
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [peaks, setPeaks] = useState<number[]>([])
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    setPeaks([])
    setPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    if (!src) return

    let alive = true
    void computeWaveform(src, path, scope)
      .then((values) => {
        if (alive) setPeaks(values)
      })
      .catch(() => {
        if (alive) setPeaks([])
      })

    return () => {
      alive = false
    }
  }, [src, path, scope])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onTime = (): void => setCurrentTime(audio.currentTime)
    const onMeta = (): void => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0)
    const onEnded = (): void => setPlaying(false)
    const onPlay = (): void => setPlaying(true)
    const onPause = (): void => setPlaying(false)

    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('durationchange', onMeta)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)

    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('durationchange', onMeta)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
    }
  }, [src])

  const toggle = (): void => {
    const audio = audioRef.current
    if (!audio || busy || !src) return
    if (audio.paused) void audio.play()
    else audio.pause()
  }

  const seek = (event: MouseEvent<HTMLDivElement>): void => {
    const audio = audioRef.current
    if (!audio || busy || !duration) return
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = Math.min(
      1,
      Math.max(0, (event.clientX - rect.left) / rect.width)
    )
    audio.currentTime = ratio * duration
    setCurrentTime(audio.currentTime)
  }

  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0
  const bars = peaks.length > 0 ? peaks : FLAT_BARS

  return (
    <div className={`audio-node${busy ? ' is-busy' : ''}`}>
      <audio ref={audioRef} src={src ?? undefined} preload="metadata" />

      <div
        className="audio-node__wave-wrap nodrag nopan"
        onClick={seek}
        role="presentation"
      >
        <svg
          className="audio-node__wave"
          viewBox={`0 0 ${WAVE_BARS} 100`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {bars.map((peak, index) => {
            const height = Math.max(3, peak * 92)
            return (
              <rect
                key={index}
                x={index + 0.23}
                y={100 - height}
                width={0.54}
                height={height}
                rx={0.27}
              />
            )
          })}
        </svg>
        {!busy && duration > 0 ? (
          <div
            className="audio-node__playhead"
            style={{ left: `${progress * 100}%` }}
          />
        ) : null}
      </div>

      {busy ? (
        <div className="audio-node__busy">
          <div className="audio-node__pill">
            <span>生成中…</span>
            <button
              type="button"
              className="audio-node__cancel nodrag nopan"
              onClick={(event) => {
                event.stopPropagation()
                onCancel?.()
              }}
            >
              取消
            </button>
          </div>
        </div>
      ) : null}

      <div className="audio-node__controls">
        <span className="audio-node__time">{timeLabel(currentTime)}</span>
        <button
          type="button"
          className="audio-node__play nodrag nopan"
          onClick={toggle}
          disabled={busy || !src}
          title={playing ? '暂停' : '播放'}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path
                d="M7 5h4v14H7zM13 5h4v14h-4z"
                fill="currentColor"
                stroke="none"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path
                d="M8 5v14l11-7z"
                fill="currentColor"
                stroke="none"
              />
            </svg>
          )}
        </button>
        <span className="audio-node__time">
          {timeLabel(duration || 0)}
        </span>
      </div>
    </div>
  )
}
