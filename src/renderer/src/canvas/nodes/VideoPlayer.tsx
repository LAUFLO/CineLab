import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties
} from 'react'
import { Icon } from '../../components/Icon'
import { timeLabel } from './AudioPlayer'

interface VideoPlayerProps {
  src: string | null
  path?: string | null
  fps?: number
  onTimeChange?: (time: number) => void
}

export interface VideoPlayerHandle {
  seek: (time: number) => void
  play: () => void
  pause: () => void
}

export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  function VideoPlayer({ src, path, fps, onTimeChange }, ref) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [muted, setMuted] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const [frameRate, setFrameRate] = useState(fps && fps > 0 ? fps : 24)

  useEffect(() => {
    if (fps && fps > 0) {
      setFrameRate(fps)
      return
    }
    if (!path) return

    let alive = true
    void window.api.media
      .probe(path)
      .then((info) => {
        if (alive && info.fps && info.fps > 0) setFrameRate(info.fps)
      })
      .catch(() => undefined)

    return () => {
      alive = false
    }
  }, [fps, path])

  useEffect(() => {
    setPlaying(false)
    setCurrentTime(0)
    setDuration(0)
  }, [src])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onTime = (): void => {
      setCurrentTime(video.currentTime)
      onTimeChange?.(video.currentTime)
    }
    const onMeta = (): void => {
      const nextDuration = Number.isFinite(video.duration) ? video.duration : 0
      setDuration(nextDuration)
      // 只加载 metadata 时部分编码不会绘制首帧，轻推一下让视频节点显示画面
      if (video.currentTime === 0 && nextDuration > 0) {
        try {
          video.currentTime = Math.min(0.001, nextDuration)
        } catch {
          // 某些源不支持 seek 时保持黑帧，不影响播放
        }
      }
    }
    const onPlay = (): void => setPlaying(true)
    const onPause = (): void => setPlaying(false)
    const onEnded = (): void => setPlaying(false)
    const onVolume = (): void => setMuted(video.muted)

    video.addEventListener('timeupdate', onTime)
    video.addEventListener('loadedmetadata', onMeta)
    video.addEventListener('durationchange', onMeta)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('ended', onEnded)
    video.addEventListener('volumechange', onVolume)

    return () => {
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('loadedmetadata', onMeta)
      video.removeEventListener('durationchange', onMeta)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('ended', onEnded)
      video.removeEventListener('volumechange', onVolume)
    }
  }, [src, onTimeChange])

  useEffect(() => {
    const onChange = (): void => {
      setFullscreen(document.fullscreenElement === containerRef.current)
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggle = (): void => {
    const video = videoRef.current
    if (!video || !src) return
    if (video.paused) void video.play()
    else video.pause()
  }

  const stepFrame = (direction: -1 | 1): void => {
    const video = videoRef.current
    if (!video || !src) return
    video.pause()
    const next = Math.min(
      Number.isFinite(video.duration) ? video.duration : currentTime,
      Math.max(0, video.currentTime + direction / frameRate)
    )
    video.currentTime = next
    setCurrentTime(next)
  }

  const seek = (value: number): void => {
    const video = videoRef.current
    if (!video || !src) return
    video.currentTime = value
    setCurrentTime(value)
  }

  const toggleMute = (): void => {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
    setMuted(video.muted)
  }

  const toggleFullscreen = (): void => {
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void containerRef.current?.requestFullscreen()
    }
  }

  useImperativeHandle(ref, () => ({
    seek: (time: number) => {
      seek(Math.max(0, Math.min(time, duration || time)))
      onTimeChange?.(time)
    },
    play: () => {
      void videoRef.current?.play()
    },
    pause: () => videoRef.current?.pause()
  }))

  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0
  const progressStyle = {
    '--video-progress': `${progress * 100}%`
  } as CSSProperties

  return (
    <div
      ref={containerRef}
      className={`video-node${playing ? ' is-playing' : ''}`}
    >
      <video
        ref={videoRef}
        src={src ?? undefined}
        preload="metadata"
        playsInline
        muted={muted}
        onClick={toggle}
      />

      <div className="video-node__shade" />

      {!playing && src ? (
        <button
          type="button"
          className="video-node__center nodrag nopan"
          onClick={toggle}
          title="播放"
        >
          <Icon name="play" size={18} />
        </button>
      ) : null}

      <div className="video-node__footer nodrag nopan">
        <input
          type="range"
          className="video-node__progress"
          min={0}
          max={duration || 0}
          step={0.01}
          value={Math.min(currentTime, duration || 0)}
          style={progressStyle}
          onChange={(event) => seek(Number(event.target.value))}
          aria-label="播放进度"
        />

        <div className="video-node__controls">
          <button
            type="button"
            className="video-node__btn"
            onClick={toggle}
            title={playing ? '暂停' : '播放'}
          >
            <Icon name={playing ? 'pause' : 'play'} size={14} />
          </button>
          <button
            type="button"
            className="video-node__btn"
            onClick={() => stepFrame(-1)}
            title="上一帧"
          >
            <Icon name="step-back" size={14} />
          </button>
          <button
            type="button"
            className="video-node__btn"
            onClick={() => stepFrame(1)}
            title="下一帧"
          >
            <Icon name="step-forward" size={14} />
          </button>

          <span className="video-node__time">
            {timeLabel(currentTime, false)} / {timeLabel(duration, false)}
          </span>
          <span className="video-node__frame">
            F {Math.round(currentTime * frameRate)}
          </span>

          <span className="video-node__spacer" />

          <button
            type="button"
            className="video-node__btn"
            onClick={toggleMute}
            title={muted ? '取消静音' : '静音'}
          >
            <Icon name={muted ? 'volume-mute' : 'volume'} size={15} />
          </button>
          <button
            type="button"
            className="video-node__btn"
            onClick={toggleFullscreen}
            title={fullscreen ? '退出全屏' : '全屏'}
          >
            <Icon name="fullscreen" size={14} />
          </button>
        </div>
      </div>
    </div>
  )
})
