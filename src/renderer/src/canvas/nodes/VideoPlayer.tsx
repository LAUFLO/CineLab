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
import { Button, Input } from '../../components/ui'

interface VideoPlayerProps {
  src: string | null
  path?: string | null
  fps?: number
  onTimeChange?: (time: number) => void
  onDurationChange?: (duration: number) => void
  onPlay?: () => void
  onPause?: () => void
  onEnded?: () => void
  /** 节点小窗强制静音时隐藏音量按钮 */
  hideVolume?: boolean
}

export interface VideoPlayerHandle {
  seek: (time: number) => void
  play: () => void
  pause: () => void
}

const BTN_CLASS =
  '!h-[26px] !w-[26px] shrink-0 !rounded-pill !bg-[color-mix(in_srgb,var(--media-control-bg)_62%,transparent)] !text-media-text opacity-[0.94] shadow-[0_1px_4px_rgba(0,0,0,0.32)] backdrop-blur-[6px] hover:!bg-[color-mix(in_srgb,var(--media-control-bg)_92%,transparent)] hover:!text-media-text hover:opacity-100 @max-[360px]:!h-[22px] @max-[360px]:!w-[22px]'

const TIME_SHADOW = '[text-shadow:0_1px_3px_rgba(0,0,0,0.55)]'

export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  function VideoPlayer(
    {
      src,
      path,
      fps,
      onTimeChange,
      onDurationChange,
      onPlay,
      onPause,
      onEnded,
      hideVolume
    },
    ref
  ) {
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
        const nextDuration = Number.isFinite(video.duration)
          ? video.duration
          : 0
        setDuration(nextDuration)
        onDurationChange?.(nextDuration)
        // 只加载 metadata 时部分编码不会绘制首帧，轻推一下让视频节点显示画面
        if (video.currentTime === 0 && nextDuration > 0) {
          try {
            video.currentTime = Math.min(0.001, nextDuration)
          } catch {
            // 某些源不支持 seek 时保持黑帧，不影响播放
          }
        }
      }
      const handlePlay = (): void => {
        setPlaying(true)
        onPlay?.()
      }
      const handlePause = (): void => {
        setPlaying(false)
        onPause?.()
      }
      const handleEnded = (): void => {
        setPlaying(false)
        onEnded?.()
      }
      const onVolume = (): void => setMuted(video.muted)

      video.addEventListener('timeupdate', onTime)
      video.addEventListener('loadedmetadata', onMeta)
      video.addEventListener('durationchange', onMeta)
      video.addEventListener('play', handlePlay)
      video.addEventListener('pause', handlePause)
      video.addEventListener('ended', handleEnded)
      video.addEventListener('volumechange', onVolume)

      return () => {
        video.removeEventListener('timeupdate', onTime)
        video.removeEventListener('loadedmetadata', onMeta)
        video.removeEventListener('durationchange', onMeta)
        video.removeEventListener('play', handlePlay)
        video.removeEventListener('pause', handlePause)
        video.removeEventListener('ended', handleEnded)
        video.removeEventListener('volumechange', onVolume)
      }
    }, [src, onTimeChange, onDurationChange, onPlay, onPause, onEnded])

    // 卸载时释放解码器，避免画布上累积 video 元素
    useEffect(() => {
      const video = videoRef.current
      return () => {
        if (!video) return
        video.pause()
        video.removeAttribute('src')
        video.load()
      }
    }, [])

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
      if (video.paused) void video.play().catch(() => undefined)
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
        void videoRef.current?.play().catch(() => undefined)
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
        className={`video-node relative h-full w-full min-h-0 min-w-0 overflow-hidden bg-media-bg @container [&:fullscreen]:h-screen [&:fullscreen]:w-screen`}
      >
        <video
          ref={videoRef}
          src={src ?? undefined}
          preload="metadata"
          playsInline
          muted={muted}
          className="block h-full w-full object-contain"
          onClick={toggle}
        />

        {!playing && src ? (
          <Button
            type="button"
            variant="ghost"
            size="none"
            className="nodrag nopan !absolute top-1/2 left-1/2 !h-[46px] !w-[46px] -translate-x-1/2 -translate-y-1/2 !rounded-pill !border !border-[var(--media-control-border)] !bg-[var(--media-control-bg)] !text-media-text shadow-float backdrop-blur-[10px] hover:!bg-[color-mix(in_srgb,var(--media-control-bg)_75%,var(--media-text))] hover:!text-media-text"
            onClick={toggle}
            title="播放"
          >
            <Icon name="play" size={18} />
          </Button>
        ) : null}

        <div className="nodrag nopan absolute inset-x-2 bottom-2 flex flex-col gap-1.5">
          <Input
            type="range"
            className="[&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-media-text !h-[3px] w-full cursor-pointer appearance-none !rounded-pill !border-0 !bg-transparent !bg-[linear-gradient(to_right,var(--media-text)_var(--video-progress),color-mix(in_srgb,var(--media-text)_24%,transparent)_var(--video-progress))] !p-0"
            min={0}
            max={duration || 0}
            step={0.01}
            value={Math.min(currentTime, duration || 0)}
            style={progressStyle}
            onChange={(event) => seek(Number(event.target.value))}
            aria-label="播放进度"
          />

          <div className="flex min-h-7 items-center gap-[5px] text-media-text @max-[360px]:gap-[3px]">
            <Button
              type="button"
              variant="ghost"
              size="none"
              className={BTN_CLASS}
              onClick={toggle}
              title={playing ? '暂停' : '播放'}
            >
              <Icon name={playing ? 'pause' : 'play'} size={14} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="none"
              className={BTN_CLASS}
              onClick={() => stepFrame(-1)}
              title="上一帧"
            >
              <Icon name="step-back" size={14} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="none"
              className={BTN_CLASS}
              onClick={() => stepFrame(1)}
              title="下一帧"
            >
              <Icon name="step-forward" size={14} />
            </Button>

            <span
              className={`ml-1 text-[11px] whitespace-nowrap tabular-nums opacity-[0.94] ${TIME_SHADOW} @max-[360px]:ml-0.5 @max-[360px]:text-[10px] @max-[250px]:hidden`}
            >
              {timeLabel(currentTime, false)} / {timeLabel(duration, false)}
            </span>
            <span
              className={`text-[10px] whitespace-nowrap opacity-70 ${TIME_SHADOW} @max-[360px]:hidden`}
            >
              F {Math.round(currentTime * frameRate)}
            </span>

            <span className="flex-1" />

            {hideVolume ? null : (
              <Button
                type="button"
                variant="ghost"
                size="none"
                className={BTN_CLASS}
                onClick={toggleMute}
                title={muted ? '取消静音' : '静音'}
              >
                <Icon name={muted ? 'volume-mute' : 'volume'} size={15} />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="none"
              className={BTN_CLASS}
              onClick={toggleFullscreen}
              title={fullscreen ? '退出全屏' : '全屏'}
            >
              <Icon name="fullscreen" size={14} />
            </Button>
          </div>
        </div>
      </div>
    )
  }
)
