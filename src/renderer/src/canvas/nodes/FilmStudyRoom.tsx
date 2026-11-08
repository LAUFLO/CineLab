import { useEffect, useMemo, useRef, useState } from 'react'
import { assetUrl } from '../../lib/asset-url'
import { useFilmStudyStore } from '../../stores/film-study'
import { Icon } from '../../components/Icon'
import { VideoPlayer, type VideoPlayerHandle } from './VideoPlayer'

const ITEM_WIDTH = 104
const ITEM_GAP = 6
const STEP = ITEM_WIDTH + ITEM_GAP
const PADDING = 12

function studyTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = Math.max(0, seconds - minutes * 60)
  return `${String(minutes).padStart(2, '0')}:${rest.toFixed(1).padStart(4, '0')}`
}

export function FilmStudyRoom() {
  const study = useFilmStudyStore((state) => state.study)
  const closeRoom = useFilmStudyStore((state) => state.closeRoom)
  const playerRef = useRef<VideoPlayerHandle>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [viewportWidth, setViewportWidth] = useState(900)

  useEffect(() => {
    setSelectedIndex(0)
    setScrollLeft(0)
  }, [study?.id])

  useEffect(() => {
    if (!study) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeRoom()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [study, closeRoom])

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const resize = new ResizeObserver(() => {
      setViewportWidth(element.clientWidth)
    })
    resize.observe(element)
    setViewportWidth(element.clientWidth)
    return () => resize.disconnect()
  }, [study?.id])

  const frames = study?.frames ?? []
  const selected = frames[selectedIndex]
  const totalWidth = frames.length * STEP + PADDING * 2
  const startIndex = Math.max(
    0,
    Math.floor((scrollLeft - PADDING) / STEP) - 3
  )
  const endIndex = Math.min(
    frames.length,
    startIndex + Math.ceil(viewportWidth / STEP) + 8
  )

  const seekFrame = (index: number): void => {
    const frame = frames[index]
    if (!frame) return
    setSelectedIndex(index)
    playerRef.current?.seek(frame.time)
  }

  const onTimeChange = (time: number): void => {
    if (!study || study.frameInterval <= 0) return
    const index = Math.max(
      0,
      Math.min(
        frames.length - 1,
        Math.round(time / study.frameInterval)
      )
    )
    setSelectedIndex((current) => (current === index ? current : index))
  }

  const sourceUrl = useMemo(
    () =>
      study
        ? assetUrl(study.sourcePath, study.sourceScope ?? 'project')
        : null,
    [study]
  )

  if (!study) return null

  return (
    <div className="film-study-room" onPointerDown={closeRoom}>
      <div
        className="film-study-room__panel"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="film-study-room__head">
          <div className="film-study-room__title">
            <Icon name="film" size={15} />
            <span>拉片室</span>
            <span className="film-study-room__source">
              {study.sourceName}
            </span>
          </div>
          <div className="film-study-room__head-meta">
            <span>{study.frames.length} 帧</span>
            <span>{study.frameInterval}s / 帧</span>
            <span>{study.fps ? `${study.fps.toFixed(0)} fps` : ''}</span>
          </div>
          <button
            type="button"
            className="icon-btn"
            title="关闭拉片室"
            onClick={closeRoom}
          >
            <Icon name="close" size={14} />
          </button>
        </header>

        <div className="film-study-room__body">
          <div className="film-study-room__player">
            <VideoPlayer
              ref={playerRef}
              src={sourceUrl}
              path={study.sourcePath}
              fps={study.fps}
              onTimeChange={onTimeChange}
            />
          </div>

          <aside className="film-study-room__side">
            <div className="film-study-room__side-title">当前时间点</div>
            <div className="film-study-room__time">
              {selected ? studyTime(selected.time) : '00:00.0'}
            </div>
            <div className="film-study-room__side-title">帧信息</div>
            <div className="film-study-room__kv">
              <span>帧序号</span>
              <strong>{selected?.index ?? 0} / {frames.length}</strong>
            </div>
            <div className="film-study-room__kv">
              <span>抽帧间隔</span>
              <strong>{study.frameInterval}s</strong>
            </div>
            <div className="film-study-room__kv">
              <span>片长</span>
              <strong>{studyTime(study.duration)}</strong>
            </div>

            <div className="film-study-room__notice">
              帧备注和段落笔记将在 P1 加入。点击下方帧可跳转视频，播放时帧选择会跟随当前时间。
            </div>
          </aside>
        </div>

        <div
          ref={scrollRef}
          className="film-study-timeline"
          onScroll={(event) => setScrollLeft(event.currentTarget.scrollLeft)}
        >
          <div
            className="film-study-timeline__spacer"
            style={{ width: totalWidth }}
          >
            {frames.slice(startIndex, endIndex).map((frame, offset) => {
              const index = startIndex + offset
              return (
                <button
                  key={frame.index}
                  type="button"
                  className={`film-study-frame${
                    index === selectedIndex ? ' is-active' : ''
                  }`}
                  style={{ left: PADDING + index * STEP }}
                  onClick={() => seekFrame(index)}
                  title={`${studyTime(frame.time)} · 第 ${frame.index} 帧`}
                >
                  <img
                    src={assetUrl(frame.file, 'project')}
                    alt=""
                    loading="lazy"
                  />
                  <span>{studyTime(frame.time)}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
