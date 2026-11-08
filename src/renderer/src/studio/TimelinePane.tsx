import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { docDurationMs, formatTimecode, rulerSteps } from '@shared/timeline-layout'
import {
  MIN_CLIP_MS,
  clipsOfTrack,
  createClip,
  createTrack,
  mainTrackId,
  type TimelineClip,
  type TimelineTrack
} from '@shared/timeline-schema'
import { snapTargets, snapValue } from '@shared/timeline-snap'
import { Icon } from '../components/Icon'
import { useTimelineStore } from '../stores/timeline'
import { useSettingsStore } from '../stores/settings'
import { useUIStore } from '../stores/ui'
import { assetToClip, type PoolAsset } from './assets'
import { ClipMedia } from './ClipMedia'

const KIND_LETTER: Record<TimelineTrack['kind'], string> = {
  video: 'V',
  audio: 'A',
  subtitle: 'S'
}

type DragMode = 'move' | 'trim-start' | 'trim-end'

interface DragState {
  mode: DragMode
  clipId: string
  trackId: string
  startX: number
  startMs: number
  durationMs: number
  ripple: boolean
  startScrollLeft: number
}

interface PreviewState {
  startMs: number
  durationMs: number
  trackId: string
}

function trackHeight(track: TimelineTrack): number {
  if (track.height) return track.height
  if (track.kind === 'video') return 64
  if (track.kind === 'audio') return 56
  return 40
}

function clipClass(
  clip: TimelineClip,
  selected: boolean,
  issue?: { missing?: boolean; updateAvailable?: boolean }
): string {
  const kind = clip.kind === 'text' ? 'subtitle' : clip.kind
  return `studio-clip studio-clip--${kind} ${selected ? 'is-selected' : ''} ${
    issue?.missing ? 'is-missing' : ''
  } ${issue?.updateAvailable ? 'has-update' : ''} ${
    clip.transitionIn ? 'has-transition' : ''
  } ${clip.speed !== 1 ? 'has-speed' : ''}`
}

function subtitleText(content: string) {
  return {
    content,
    fontFamily: 'Arial',
    fontSize: 64,
    color: '#ffffff',
    bold: false,
    italic: false,
    align: 'center' as const,
    stroke: { color: '#000000', width: 2 },
    shadow: { color: '#000000', blur: 8, offsetX: 0, offsetY: 2 }
  }
}

export function TimelinePane() {
  const doc = useTimelineStore((state) => state.doc)
  const selectedIds = useTimelineStore((state) => state.selectedIds)
  const playheadMs = useTimelineStore((state) => state.playheadMs)
  const tool = useTimelineStore((state) => state.tool)
  const snap = useTimelineStore((state) => state.snap)
  const magnet = useTimelineStore((state) => state.magnet)
  const zoom = useTimelineStore((state) => state.zoom)
  const playing = useTimelineStore((state) => state.playing)
  const referenceIssues = useTimelineStore((state) => state.referenceIssues)
  const history = useTimelineStore((state) => state.history)
  const setTool = useTimelineStore((state) => state.setTool)
  const toggleSnap = useTimelineStore((state) => state.toggleSnap)
  const toggleMagnet = useTimelineStore((state) => state.toggleMagnet)
  const setPlayhead = useTimelineStore((state) => state.setPlayhead)
  const setZoom = useTimelineStore((state) => state.setZoom)
  const select = useTimelineStore((state) => state.select)
  const undo = useTimelineStore((state) => state.undo)
  const redo = useTimelineStore((state) => state.redo)
  const dispatch = useTimelineStore((state) => state.dispatch)
  const showToast = useUIStore((state) => state.showToast)
  const requestConfirm = useUIStore((state) => state.requestConfirm)
  const openSettings = useSettingsStore((state) => state.openPanel)
  const [transcribing, setTranscribing] = useState(false)
  const [transcribePercent, setTranscribePercent] = useState(0)

  const scrollRef = useRef<HTMLDivElement>(null)
  const lanesRef = useRef<HTMLDivElement>(null)
  const headsRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(900)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const previewRef = useRef<PreviewState | null>(null)
  const anchorRef = useRef<{ ms: number; x: number } | null>(null)

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const update = (): void => setWidth(element.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [doc?.id])

  const updatePreview = (value: PreviewState | null): void => {
    previewRef.current = value
    setPreview(value)
  }

  const autoScrollRef = useRef<number | null>(null)
  const autoScrollSpeedRef = useRef(0)

  const startAutoScroll = (speed: number): void => {
    autoScrollSpeedRef.current = speed
    if (autoScrollRef.current !== null) return
    const tick = (): void => {
      const element = scrollRef.current
      if (!element || autoScrollSpeedRef.current === 0) {
        autoScrollRef.current = null
        return
      }
      element.scrollLeft += autoScrollSpeedRef.current
      autoScrollRef.current = requestAnimationFrame(tick)
    }
    autoScrollRef.current = requestAnimationFrame(tick)
  }

  const stopAutoScroll = (): void => {
    autoScrollSpeedRef.current = 0
    if (autoScrollRef.current !== null) {
      cancelAnimationFrame(autoScrollRef.current)
      autoScrollRef.current = null
    }
  }

  const totalMs = doc ? Math.max(docDurationMs(doc), 1000) : 1000
  const pxPerMs = (width / totalMs) * zoom
  const mainId = doc ? mainTrackId(doc) : null
  const fps = doc?.video.fps ?? 30
  const steps = rulerSteps(pxPerMs, fps)
  const ticks: { ms: number; label: string }[] = []
  for (let ms = 0; ms <= totalMs; ms += steps.majorMs) {
    ticks.push({ ms, label: formatTimecode(ms, fps, steps.frameLevel) })
  }

  useEffect(() => {
    const anchor = anchorRef.current
    const element = scrollRef.current
    if (!anchor || !element) return
    anchorRef.current = null
    element.scrollLeft = Math.max(0, anchor.ms * pxPerMs - anchor.x)
  }, [zoom, pxPerMs])

  const seekRuler = (event: ReactPointerEvent<HTMLElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (useTimelineStore.getState().playing) useTimelineStore.getState().pause()
    setPlayhead((event.clientX - rect.left) / pxPerMs)
  }

  const seekLanes = (event: ReactPointerEvent<HTMLElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (useTimelineStore.getState().playing) useTimelineStore.getState().pause()
    setPlayhead((event.clientX - rect.left) / pxPerMs)
    select([])
  }

  const addSubtitle = (): void => {
    let track = doc?.tracks.find((item) => item.kind === 'subtitle')
    if (!track) {
      track = createTrack('subtitle', '字幕 1')
      dispatch({ op: 'addTrack', track })
    }

    const clip = createClip({
      trackId: track.id,
      kind: 'text',
      name: '新字幕',
      startMs: Math.max(0, Math.round(playheadMs)),
      durationMs: 3000,
      text: subtitleText('新字幕')
    })

    dispatch({ op: 'addClip', clip })
    select([clip.id])
  }

  const runAutoSubtitles = async (): Promise<void> => {
    if (transcribing) {
      void window.api.timeline.cancelTranscribe()
      return
    }

    const state = useTimelineStore.getState()
    const currentDoc = state.doc
    if (!currentDoc) return

    const clip = currentDoc.clips.find(
      (item) =>
        state.selectedIds.includes(item.id) &&
        item.media &&
        (item.kind === 'video' || item.kind === 'audio') &&
        !item.muted
    )
    if (!clip && currentDoc.clips.length === 0) {
      showToast('时间线还是空的，先添加片段', 'error')
      return
    }

    try {
      const status = await window.api.components.status()
      const ready = ['whisper-runtime', 'whisper-model'].every(
        (kind) =>
          status.find((item) => item.kind === kind)?.state === 'installed'
      )
      if (!ready) {
        requestConfirm({
          title: '需要本地字幕组件',
          message:
            '自动字幕需要「本地字幕运行时」和「Whisper Base 模型」，合计约 152MB。是否前往设置安装？',
          confirmLabel: '前往设置',
          onConfirm: () => openSettings('components')
        })
        return
      }
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : String(error),
        'error'
      )
      return
    }

    setTranscribing(true)
    setTranscribePercent(0)
    const unsubscribe = window.api.timeline.onTranscribeProgress((progress) => {
      setTranscribePercent(progress.percent)
    })

    try {
      const result = await window.api.timeline.transcribe(
        clip?.media
          ? {
              mode: 'clip',
              path: clip.media.path,
              scope: clip.media.scope,
              sourceStartMs: clip.sourceStartMs,
              durationMs: clip.durationMs,
              speed: clip.speed
            }
          : { mode: 'timeline', doc: currentDoc }
      )

      if (result.segments.length === 0) {
        showToast('没有识别到语音', 'error')
        return
      }

      const latest = useTimelineStore.getState()
      let track = latest.doc?.tracks.find((item) => item.kind === 'subtitle')
      if (!track) {
        track = createTrack('subtitle', '字幕 1')
        latest.dispatch({ op: 'addTrack', track })
      }

      const speed = Math.max(0.1, Math.min(10, clip?.speed || 1))
      const clips = result.segments.map((segment) =>
        createClip({
          trackId: track.id,
          kind: 'text',
          name: segment.text.slice(0, 60),
          startMs: Math.max(
            0,
            Math.round(
              clip ? clip.startMs + segment.startMs / speed : segment.startMs
            )
          ),
          durationMs: Math.max(
            200,
            Math.round(clip ? segment.durationMs / speed : segment.durationMs)
          ),
          text: subtitleText(segment.text)
        })
      )

      latest.dispatch({ op: 'addClips', clips })
      latest.select([clips[0].id])
      showToast(
        `已生成 ${clips.length} 条字幕${
          result.language ? `（${result.language}）` : ''
        }`
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message !== '已取消') showToast(message, 'error')
    } finally {
      unsubscribe()
      setTranscribing(false)
      setTranscribePercent(0)
    }
  }

  const importSubtitles = async (): Promise<void> => {
    try {
      const result = await window.api.timeline.importSubtitles()
      if (!result) return
      if (result.cues.length === 0) {
        showToast('没有解析到字幕，请检查文件格式', 'error')
        return
      }

      const latest = useTimelineStore.getState()
      if (!latest.doc) return
      let track = latest.doc.tracks.find((item) => item.kind === 'subtitle')
      if (!track) {
        track = createTrack('subtitle', '字幕 1')
        latest.dispatch({ op: 'addTrack', track })
      }

      const clips = result.cues.map((cue) =>
        createClip({
          trackId: track.id,
          kind: 'text',
          name: cue.text.slice(0, 60),
          startMs: cue.startMs,
          durationMs: Math.max(200, cue.endMs - cue.startMs),
          text: subtitleText(cue.text)
        })
      )

      latest.dispatch({ op: 'addClips', clips })
      latest.select([clips[0].id])
      showToast(`已从 ${result.name} 导入 ${clips.length} 条字幕`)
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : String(error),
        'error'
      )
    }
  }

  const beginDrag = (
    event: ReactPointerEvent<HTMLElement>,
    clip: TimelineClip,
    mode: DragMode
  ): void => {
    event.stopPropagation()
    event.preventDefault()
    select([clip.id])
    setDrag({
      mode,
      clipId: clip.id,
      trackId: clip.trackId,
      startX: event.clientX,
      startMs: clip.startMs,
      durationMs: clip.durationMs,
      ripple: event.altKey,
      startScrollLeft: scrollRef.current?.scrollLeft ?? 0
    })
    updatePreview({
      startMs: clip.startMs,
      durationMs: clip.durationMs,
      trackId: clip.trackId
    })
  }

  const handleClipPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
    clip: TimelineClip
  ): void => {
    if (tool === 'cut') {
      event.stopPropagation()
      const rect = event.currentTarget.getBoundingClientRect()
      const atMs = clip.startMs + (event.clientX - rect.left) / pxPerMs
      dispatch({ op: 'splitClips', clipIds: [clip.id], atMs })
      return
    }
    beginDrag(event, clip, 'move')
  }

  const zoomAt = (nextZoom: number, anchorX: number): void => {
    const element = scrollRef.current
    if (!element) return
    const ms = (element.scrollLeft + anchorX) / pxPerMs
    anchorRef.current = { ms, x: anchorX }
    setZoom(nextZoom)
  }

  const onWheel = (event: React.WheelEvent<HTMLDivElement>): void => {
    const element = scrollRef.current
    if (!element) return
    if (event.ctrlKey) {
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15
      zoomAt(zoom * factor, event.clientX - rect.left)
      return
    }
    if (event.shiftKey) {
      event.preventDefault()
      element.scrollLeft += event.deltaY || event.deltaX
    }
  }

  useEffect(() => {
    if (!playing) return
    const element = scrollRef.current
    if (!element) return
    const x = playheadMs * pxPerMs
    const margin = element.clientWidth * 0.8
    if (x < element.scrollLeft || x > element.scrollLeft + margin) {
      element.scrollLeft = Math.max(0, x - element.clientWidth * 0.3)
    }
  }, [playing, playheadMs, pxPerMs])

  useEffect(() => {
    if (!drag || !doc) return
    const targets = snapTargets(doc, drag.trackId, drag.clipId, playheadMs)
    const threshold = 8 / pxPerMs

    const onMove = (event: PointerEvent): void => {
      const snapOn = useTimelineStore.getState().snap
      const scrollDelta =
        (scrollRef.current?.scrollLeft ?? 0) - drag.startScrollLeft
      const deltaMs = (event.clientX - drag.startX + scrollDelta) / pxPerMs

      const element = scrollRef.current
      if (element && drag.mode === 'move') {
        const rect = element.getBoundingClientRect()
        const edge = 40
        if (event.clientX < rect.left + edge) startAutoScroll(-12)
        else if (event.clientX > rect.right - edge) startAutoScroll(12)
        else stopAutoScroll()
      }

      let targetTrackId = drag.trackId
      if (drag.mode === 'move' && lanesRef.current) {
        const rect = lanesRef.current.getBoundingClientRect()
        let y = event.clientY - rect.top
        for (const track of doc.tracks) {
          const height = trackHeight(track)
          if (y < height) {
            targetTrackId = track.id
            break
          }
          y -= height
        }
      }

      if (drag.mode === 'move') {
        const raw = drag.startMs + deltaMs
        const start = snapOn ? snapValue(raw, targets, threshold) : raw
        updatePreview({
          startMs: Math.max(0, start),
          durationMs: drag.durationMs,
          trackId: targetTrackId
        })
        return
      }
      if (drag.mode === 'trim-start') {
        const raw = drag.startMs + deltaMs
        const snapped = snapOn ? snapValue(raw, targets, threshold) : raw
        const start = Math.min(
          drag.startMs + drag.durationMs - MIN_CLIP_MS,
          Math.max(0, snapped)
        )
        updatePreview({
          startMs: start,
          durationMs: drag.durationMs - (start - drag.startMs),
          trackId: drag.trackId
        })
        return
      }
      const raw = drag.startMs + drag.durationMs + deltaMs
      const snapped = snapOn ? snapValue(raw, targets, threshold) : raw
      updatePreview({
        startMs: drag.startMs,
        durationMs: Math.max(MIN_CLIP_MS, snapped - drag.startMs),
        trackId: drag.trackId
      })
    }

    const onUp = (): void => {
      stopAutoScroll()
      const current = previewRef.current
      if (current) {
        if (
          drag.mode === 'move' &&
          (Math.round(current.startMs) !== drag.startMs || current.trackId !== drag.trackId)
        ) {
          dispatch({
            op: 'moveClips',
            moves: [
              {
                clipId: drag.clipId,
                startMs: Math.round(current.startMs),
                trackId: current.trackId
              }
            ],
            mode: 'insert'
          })
        } else if (drag.mode === 'trim-start') {
          const delta = Math.round(current.startMs - drag.startMs)
          if (delta !== 0) {
            dispatch({
              op: 'trimClip',
              clipId: drag.clipId,
              edge: 'start',
              deltaMs: delta,
              ripple: drag.ripple
            })
          }
        } else if (drag.mode === 'trim-end') {
          const delta = Math.round(current.durationMs - drag.durationMs)
          if (delta !== 0) {
            dispatch({
              op: 'trimClip',
              clipId: drag.clipId,
              edge: 'end',
              deltaMs: delta,
              ripple: drag.ripple
            })
          }
        }
      }
      setDrag(null)
      updatePreview(null)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [drag, doc, playheadMs, pxPerMs, dispatch])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target
      if (target instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(target.tagName)) {
        return
      }
      const state = useTimelineStore.getState()
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (state.selectedIds.length === 0) return
        event.preventDefault()
        dispatch({ op: 'removeClips', clipIds: state.selectedIds })
        state.select([])
        return
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) state.redo()
        else state.undo()
        return
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'k') {
        if (!state.doc || state.selectedIds.length === 0) return
        event.preventDefault()
        dispatch({ op: 'splitClips', clipIds: state.selectedIds, atMs: state.playheadMs })
        return
      }
      if (event.key.toLowerCase() === 'v') state.setTool('select')
      if (event.key.toLowerCase() === 'c') state.setTool('cut')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dispatch])

  if (!doc) {
    return <section className="studio-timeline" />
  }

  const isSelected = (id: string): boolean => selectedIds.includes(id)
  const dragClip =
    drag && preview ? doc.clips.find((clip) => clip.id === drag.clipId) ?? null : null

  return (
    <section className="studio-timeline">
      <div className="studio-timeline__toolbar">
        <button
          type="button"
          className={`studio-tool-btn ${tool === 'select' ? 'is-active' : ''}`}
          onClick={() => setTool('select')}
          title="选择 (V)"
        >
          <Icon name="cursor" size={13} />
          选择
        </button>
        <button
          type="button"
          className={`studio-tool-btn ${tool === 'cut' ? 'is-active' : ''}`}
          onClick={() => setTool('cut')}
          title="切割 (C)"
        >
          <Icon name="scissors" size={13} />
          切割
        </button>
        <button
          type="button"
          className="studio-tool-btn"
          onClick={addSubtitle}
          title="在播放头添加字幕"
        >
          <Icon name="text" size={13} />
          字幕
        </button>
        <button
          type="button"
          className={`studio-tool-btn ${transcribing ? 'is-active' : ''}`}
          onClick={() => void runAutoSubtitles()}
          title={
            transcribing
              ? '点击取消转写'
              : '选中片段时转写该片段；未选中时转写整条时间线'
          }
        >
          <Icon name="sparkles" size={13} />
          {transcribing
            ? transcribePercent > 0
              ? `转写 ${transcribePercent}%`
              : '转写中…'
            : '自动字幕'}
        </button>
        <button
          type="button"
          className="studio-tool-btn"
          onClick={() => void importSubtitles()}
          title="导入 SRT / VTT 字幕文件"
        >
          <Icon name="download" size={13} />
          导入字幕
        </button>
        <span className="studio-toolbar-divider" />
        <button
          type="button"
          className="studio-icon-btn"
          onClick={undo}
          disabled={history.past.length === 0}
          title="撤销 (Ctrl+Z)"
        >
          ↶
        </button>
        <button
          type="button"
          className="studio-icon-btn"
          onClick={redo}
          disabled={history.future.length === 0}
          title="重做 (Ctrl+Shift+Z)"
        >
          ↷
        </button>
        <span className="studio-toolbar-divider" />
        <button
          type="button"
          className={`studio-tool-btn ${snap ? 'is-active' : ''}`}
          onClick={toggleSnap}
        >
          <Icon name="target" size={13} />
          吸附
        </button>
        <button
          type="button"
          className={`studio-tool-btn ${magnet ? 'is-active' : ''}`}
          onClick={toggleMagnet}
        >
          <Icon name="magnet" size={13} />
          磁性
        </button>
        <span className="studio-toolbar-spacer" />
        <button
          type="button"
          className="studio-icon-btn"
          onClick={() => zoomAt(zoom / 1.6, width / 2)}
          disabled={zoom <= 0.5}
          title="缩小"
        >
          −
        </button>
        <span className="studio-zoom">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          className="studio-icon-btn"
          onClick={() => zoomAt(zoom * 1.6, width / 2)}
          disabled={zoom >= 4}
          title="放大"
        >
          ＋
        </button>
      </div>

      <div className="studio-timeline__body">
        <div className="studio-track-heads" ref={headsRef}>
          <div className="studio-ruler-corner" />
          {doc.tracks.map((track) => (
            <div
              key={track.id}
              className={`studio-track-head ${track.id === mainId ? 'is-main' : ''}`}
              style={{ height: trackHeight(track) }}
            >
              <div className="studio-track-head__main">
                <span className={`studio-track-kind studio-track-kind--${track.kind}`}>
                  {KIND_LETTER[track.kind]}
                </span>
                <span className="studio-track-head__name">{track.name}</span>
                {track.id === mainId ? (
                  <span className="studio-track-head__badge">主轨</span>
                ) : null}
              </div>
              <div className="studio-track-head__tools">
                <button type="button" className="studio-track-tool" title="可见">
                  ◉
                </button>
                <button type="button" className="studio-track-tool" title="锁定">
                  ▣
                </button>
              </div>
            </div>
          ))}
        </div>

        <div
          className="studio-tracks-scroll"
          ref={scrollRef}
          onWheel={onWheel}
          onScroll={() => {
            if (headsRef.current && scrollRef.current) {
              headsRef.current.scrollTop = scrollRef.current.scrollTop
            }
          }}
        >
          <div
            className="studio-tracks-content"
            style={{ width: Math.max(width, totalMs * pxPerMs) }}
          >
            <div className="studio-ruler" onPointerDown={seekRuler}>
              {ticks.map((tick) => (
                <span
                  key={tick.ms}
                  className="studio-ruler__tick"
                  style={{ left: tick.ms * pxPerMs }}
                >
                  {tick.label}
                </span>
              ))}
              {doc.markers.map((marker) => (
                <button
                  key={marker.id}
                  type="button"
                  className={`studio-ruler__marker ${
                    marker.durationMs ? 'is-range' : ''
                  }`}
                  style={{
                    left: marker.atMs * pxPerMs,
                    width:
                      marker.durationMs !== undefined
                        ? Math.max(10, marker.durationMs * pxPerMs)
                        : undefined,
                    backgroundColor:
                      marker.durationMs !== undefined && marker.color
                        ? `${marker.color}33`
                        : undefined
                  }}
                  title={`${marker.label} · ${formatTimecode(marker.atMs, fps)}`}
                  onPointerDown={(event) => {
                    event.stopPropagation()
                    setPlayhead(marker.atMs)
                  }}
                >
                  <span
                    className="studio-ruler__marker-dot"
                    style={marker.color ? { background: marker.color } : undefined}
                  />
                  <span className="studio-ruler__marker-label">{marker.label}</span>
                </button>
              ))}
            </div>

            <div className="studio-lanes" ref={lanesRef} onPointerDown={seekLanes}>
              {doc.tracks.map((track) => {
                const ghost =
                  dragClip &&
                  preview &&
                  preview.trackId === track.id &&
                  dragClip.trackId !== track.id
                    ? dragClip
                    : null
                return (
                  <div
                    key={track.id}
                    className="studio-lane"
                    style={{ height: trackHeight(track) }}
                    onDragOver={(event) => {
                      event.preventDefault()
                      event.dataTransfer.dropEffect = 'copy'
                    }}
                    onDrop={(event) => {
                      event.preventDefault()
                      const raw = event.dataTransfer.getData(
                        'application/x-cinelab-asset'
                      )
                      let asset: PoolAsset | null = null
                      try {
                        asset = JSON.parse(raw) as PoolAsset
                      } catch {
                        asset = null
                      }
                      if (!asset?.path) return
                      const rect = event.currentTarget.getBoundingClientRect()
                      const atMs = Math.max(0, (event.clientX - rect.left) / pxPerMs)
                      dispatch({
                        op: 'addClipsInSequence',
                        clips: [assetToClip(asset, track.id, 0)],
                        trackId: track.id,
                        atMs,
                        mode: 'insert'
                      })
                    }}
                  >
                    {clipsOfTrack(doc, track.id).map((clip) => {
                      const active = drag?.clipId === clip.id
                      if (active && preview && preview.trackId !== track.id) return null
                      const startMs = active && preview ? preview.startMs : clip.startMs
                      const durationMs = active && preview ? preview.durationMs : clip.durationMs
                      const issue = referenceIssues[clip.id]
                      return (
                        <div
                          key={clip.id}
                          className={clipClass(clip, isSelected(clip.id), issue)}
                          style={{
                            left: startMs * pxPerMs,
                            width: Math.max(2, durationMs * pxPerMs)
                          }}
                          onPointerDown={(event) => handleClipPointerDown(event, clip)}
                        >
                        <span className="studio-clip__label">
                          {clip.kind === 'text'
                            ? clip.text?.content || clip.name
                            : clip.name}
                        </span>
                        {issue?.missing ? (
                          <span className="studio-clip__issue is-missing">素材缺失</span>
                        ) : issue?.updateAvailable ? (
                          <span className="studio-clip__issue is-update">有新版本</span>
                        ) : null}
                        {clip.speed !== 1 ? (
                          <span className="studio-clip__speed">{clip.speed}×</span>
                        ) : null}
                        {clip.transitionIn ? (
                          <span className="studio-clip__transition">
                            {clip.transitionIn.type === 'fade' ? '淡' : '黑'}
                          </span>
                        ) : null}
                        <ClipMedia
                          clip={clip}
                          widthPx={Math.max(2, durationMs * pxPerMs)}
                        />
                          <div
                            className="studio-clip__handle studio-clip__handle--left"
                            onPointerDown={(event) => beginDrag(event, clip, 'trim-start')}
                          />
                          <div
                            className="studio-clip__handle studio-clip__handle--right"
                            onPointerDown={(event) => beginDrag(event, clip, 'trim-end')}
                          />
                        </div>
                      )
                    })}
                    {ghost && preview ? (
                      <div
                        className={`${clipClass(ghost, false)} is-dragging`}
                        style={{
                          left: preview.startMs * pxPerMs,
                          width: Math.max(2, preview.durationMs * pxPerMs)
                        }}
                      >
                        <span className="studio-clip__label">{ghost.name}</span>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>

            <div
              className="studio-playhead studio-playhead--lanes"
              style={{ left: playheadMs * pxPerMs }}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
