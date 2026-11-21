import { useEffect, useId, useRef, useState } from 'react'
import { useViewport } from '@xyflow/react'
import { Icon } from '../../components/Icon'
import { Button } from '../../components/ui'
import {
  acquireVideoPlayback,
  releaseVideoPlayback
} from './playbackBudget'
import { VideoPlayer, type VideoPlayerHandle } from './VideoPlayer'

interface VideoPreviewProps {
  src: string | null
  path?: string | null
  fps?: number
  /** 节点逻辑宽度，用于按缩放比例判断是否缩得太小 */
  nodeWidth?: number
  /** 成片/封面兜底（剪辑室节点用） */
  poster?: string | null
  onTimeChange?: (time: number) => void
  onDurationChange?: (duration: number) => void
}

const PLAY_BUTTON_CLASS =
  'nodrag nopan !absolute top-1/2 left-1/2 !h-[46px] !w-[46px] -translate-x-1/2 -translate-y-1/2 !rounded-pill !border !border-[var(--media-control-border)] !bg-[var(--media-control-bg)] !text-media-text shadow-float backdrop-blur-[10px] hover:!bg-[color-mix(in_srgb,var(--media-control-bg)_75%,var(--media-text))] hover:!text-media-text'

/**
 * 画布视频节点的默认封面 + 点击播放包装。
 * 默认只渲染封面图，不挂载 <video>；点击播放后才挂载 VideoPlayer。
 * 缩得太小或离开视口时回退到封面并释放播放名额。
 */
export function VideoPreview({
  src,
  path,
  fps,
  nodeWidth = 480,
  poster,
  onTimeChange,
  onDurationChange
}: VideoPreviewProps) {
  const viewport = useViewport()
  const id = useId()
  const playerRef = useRef<VideoPlayerHandle>(null)
  const [active, setActive] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [thumb, setThumb] = useState<string | null>(poster ?? null)
  const [thumbFailed, setThumbFailed] = useState(false)

  const screenWidth = nodeWidth * viewport.zoom
  const tooSmall = viewport.zoom < 0.5 || screenWidth < 200

  // 封面图：成片优先，其次 ffmpeg 抽首帧
  useEffect(() => {
    setThumbFailed(false)
    if (poster) {
      setThumb(poster)
      return
    }
    if (!path) {
      setThumb(null)
      return
    }

    let alive = true
    void window.api.media
      .thumbnail(path, 0, 'video')
      .then((url) => {
        if (alive) setThumb(url)
      })
      .catch(() => {
        if (alive) setThumb(null)
      })

    return () => {
      alive = false
    }
  }, [poster, path])

  // 缩得太小：停止播放并回封面
  useEffect(() => {
    if (!tooSmall) return
    setActive(false)
    setPlaying(false)
    releaseVideoPlayback(id)
  }, [tooSmall, id])

  // 卸载：释放名额
  useEffect(() => {
    return () => releaseVideoPlayback(id)
  }, [id])

  // 挂载 VideoPlayer 后开始播放
  useEffect(() => {
    if (!active) return
    const timer = window.setTimeout(() => playerRef.current?.play(), 0)
    return () => window.clearTimeout(timer)
  }, [active])

  // 源变化：回封面
  useEffect(() => {
    setActive(false)
    setPlaying(false)
    releaseVideoPlayback(id)
  }, [src, id])

  const start = (): void => {
    if (!src || tooSmall) return
    setActive(true)
  }

  const handlePlay = (): void => {
    setPlaying(true)
    acquireVideoPlayback(id, () => playerRef.current?.pause())
  }

  const handlePause = (): void => {
    setPlaying(false)
    releaseVideoPlayback(id)
  }

  const handleEnded = (): void => {
    setPlaying(false)
    releaseVideoPlayback(id)
    setActive(false)
  }

  return (
    <div className="relative h-full w-full min-h-0 min-w-0 overflow-hidden bg-media-bg">
      {active && src ? (
        <VideoPlayer
          ref={playerRef}
          src={src}
          path={path}
          fps={fps}
          onTimeChange={onTimeChange}
          onDurationChange={onDurationChange}
          onPlay={handlePlay}
          onPause={handlePause}
          onEnded={handleEnded}
        />
      ) : thumb && !thumbFailed ? (
        <img
          src={thumb}
          alt=""
          className="h-full w-full object-contain"
          onError={() => setThumbFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-fg-subtle">
          <Icon name="film" size={30} />
        </div>
      )}

      {!active && src && !tooSmall ? (
        <Button
          type="button"
          variant="ghost"
          size="none"
          className={PLAY_BUTTON_CLASS}
          onClick={start}
          title="播放"
        >
          <Icon name="play" size={18} />
        </Button>
      ) : null}

      {active && playing && !tooSmall ? (
        <Button
          type="button"
          variant="ghost"
          size="none"
          className={`${PLAY_BUTTON_CLASS} !h-9 !w-9 opacity-0 transition-opacity hover:opacity-100`}
          onClick={() => {
            playerRef.current?.pause()
            setActive(false)
          }}
          title="关闭预览"
        >
          <Icon name="close" size={16} />
        </Button>
      ) : null}
    </div>
  )
}
