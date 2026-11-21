import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import {
  docDurationMs,
  formatTimecode,
  rulerSteps
} from '@shared/timeline-layout'
import {
  MIN_CLIP_MS,
  clipEnd,
  clipsOfTrack,
  createClip,
  createTrack,
  mainTrackId,
  type TimelineClip,
  type TimelineTrack
} from '@shared/timeline-schema'
import type { TimelineCommand } from '@shared/timeline-commands'
import { snapTargets, snapValue } from '@shared/timeline-snap'
import { Icon } from '../components/Icon'
import { IconButton, Button, cn } from '../components/ui'
import { useTimelineStore } from '../stores/timeline'
import {
  shortcutMatches,
  useShortcutLabel
} from '../shortcuts/useShortcut'
import { useSettingsStore } from '../stores/settings'
import { useUIStore } from '../stores/ui'
import { assetToClip, type PoolAsset } from './assets'
import { ClipMedia } from './ClipMedia'

const KIND_LETTER: Record<TimelineTrack['kind'], string> = {
  video: 'V',
  audio: 'A',
  subtitle: 'S'
}

const KIND_TONE: Record<TimelineTrack['kind'], string> = {
  video: 'text-group-cyan',
  audio: 'text-group-lime',
  subtitle: 'text-group-amber'
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
  issue?: { missing?: boolean; updateAvailable?: boolean },
  dragging?: boolean
): string {
  return cn(
    'studio-clip absolute top-0.5 bottom-0.5 flex cursor-pointer touch-none select-none items-center overflow-hidden rounded-md border px-1.5',
    selected ? 'border-border-selected' : 'border-border',
    clipTone(clip),
    selected ? 'z-[2] shadow-[0_0_0_1px_var(--border-selected)]' : '',
    dragging ? 'pointer-events-none opacity-55' : '',
    issue?.missing
      ? 'opacity-55 after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:border after:border-dashed after:border-border-strong after:content-[""]'
      : '',
    issue?.updateAvailable
      ? 'outline-1 -outline-offset-1 outline-border-strong'
      : ''
  )
}

/** 音频片段用斜纹底纹，颜色取 group-lime token */
const CLIP_AUDIO_TONE =
  'bg-[repeating-linear-gradient(90deg,color-mix(in_srgb,var(--group-lime)_12%,transparent)_0_2px,color-mix(in_srgb,var(--group-lime)_3%,transparent)_2px_4px)]'

/** 片段底色按素材类型取 token；图片沿用基础底色 */
function clipTone(clip: TimelineClip): string {
  if (clip.kind === 'text') return 'bg-group-amber/14'
  if (clip.kind === 'video') return 'bg-group-cyan/10'
  if (clip.kind === 'audio') return CLIP_AUDIO_TONE
  return 'bg-surface-raised'
}

const CLIP_LABEL =
  'relative z-[1] truncate text-[10px] [text-shadow:0_1px_4px_var(--overlay)]'

const CLIP_BADGE =
  'pointer-events-none absolute right-1.5 top-1 max-w-[calc(100%-12px)] truncate rounded-md border border-border-strong bg-surface px-[5px] text-[10px] leading-4 text-fg'

const CLIP_META =
  'pointer-events-none absolute bottom-1 rounded-md border border-border bg-surface px-1 text-[10px] leading-[15px] text-fg'

const PANEL_ROOT =
  'flex min-h-0 min-w-0 flex-col overflow-hidden rounded-card border border-border bg-surface [grid-area:timeline]'

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
  const undoShortcut = useShortcutLabel('timeline.undo')
  const redoShortcut = useShortcutLabel('timeline.redo')
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
      showToast(error instanceof Error ? error.message : String(error), 'error')
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
      showToast(error instanceof Error ? error.message : String(error), 'error')
    }
  }

  const freezingRef = useRef(false)

  const freezeFrame = async (): Promise<void> => {
    if (freezingRef.current) return
    const state = useTimelineStore.getState()
    const doc = state.doc
    if (!doc) return
    const playhead = state.playheadMs
    const trackById = new Map(doc.tracks.map((track) => [track.id, track]))
    const candidates = doc.clips.filter(
      (clip) =>
        clip.startMs < playhead &&
        clipEnd(clip) > playhead &&
        trackById.get(clip.trackId)?.locked !== true &&
        (clip.kind === 'video' || clip.kind === 'image') &&
        clip.media
    )
    const source =
      candidates.find((clip) => state.selectedIds.includes(clip.id)) ??
      candidates[0]
    if (!source?.media) {
      showToast('把播放头移到视频或图片片段上', 'error')
      return
    }
    if (source.media.scope === 'global') {
      showToast('冻结帧暂只支持项目内素材', 'error')
      return
    }

    const atMs = Math.min(
      clipEnd(source) - 1,
      Math.max(source.startMs + 1, playhead)
    )

    freezingRef.current = true
    try {
      let media = source.media
      if (source.kind === 'video') {
        const seconds =
          (source.sourceStartMs + (atMs - source.startMs) * source.speed) / 1000
        const result = await window.api.media.extractFrame({
          path: source.media.path,
          mode: 'current',
          time: seconds
        })
        media = {
          path: result.asset.path,
          kind: 'image',
          scope: 'project'
        }
      }

      const clip = createClip({
        trackId: source.trackId,
        kind: 'image',
        name: '冻结帧',
        startMs: atMs,
        durationMs: 2000,
        media
      })
      dispatch({
        op: 'addClipsInSequence',
        clips: [clip],
        trackId: source.trackId,
        atMs,
        mode: 'insert'
      })
      state.select([clip.id])
      showToast('已插入 2 秒冻结帧')
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      freezingRef.current = false
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
          (Math.round(current.startMs) !== drag.startMs ||
            current.trackId !== drag.trackId)
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
      if (
        target instanceof HTMLElement &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
      ) {
        return
      }

      const state = useTimelineStore.getState()
      const doc = state.doc
      if (!doc) return
      const targets = state.selectedIds.length
        ? doc.clips.filter((clip) => state.selectedIds.includes(clip.id))
        : doc.clips.filter(
            (clip) =>
              clip.startMs < state.playheadMs &&
              clipEnd(clip) > state.playheadMs
          )

      if (shortcutMatches(event, 'timeline.deleteRipple')) {
        if (state.selectedIds.length === 0) return
        event.preventDefault()
        dispatch({
          op: 'removeClips',
          clipIds: state.selectedIds,
          ripple: true
        })
        state.select([])
        return
      }

      if (shortcutMatches(event, 'timeline.delete')) {
        if (state.selectedIds.length === 0) return
        event.preventDefault()
        dispatch({
          op: 'removeClips',
          clipIds: state.selectedIds,
          ripple: false
        })
        state.select([])
        return
      }

      if (shortcutMatches(event, 'timeline.undo')) {
        event.preventDefault()
        state.undo()
        return
      }

      if (shortcutMatches(event, 'timeline.redo')) {
        event.preventDefault()
        state.redo()
        return
      }

      if (shortcutMatches(event, 'timeline.splitAtPlayhead')) {
        if (targets.length === 0) return
        event.preventDefault()
        dispatch({
          op: 'splitClips',
          clipIds: targets.map((clip) => clip.id),
          atMs: state.playheadMs
        })
        return
      }

      if (shortcutMatches(event, 'timeline.splitSelected')) {
        if (state.selectedIds.length === 0) return
        event.preventDefault()
        dispatch({
          op: 'splitClips',
          clipIds: state.selectedIds,
          atMs: state.playheadMs
        })
        return
      }

      const trimStart = shortcutMatches(event, 'timeline.trimStart')
      const trimEnd = shortcutMatches(event, 'timeline.trimEnd')
      if (trimStart || trimEnd) {
        const commands: TimelineCommand[] = []
        for (const clip of targets) {
          const end = clipEnd(clip)
          if (state.playheadMs <= clip.startMs || state.playheadMs >= end) {
            continue
          }
          commands.push({
            op: 'trimClip',
            clipId: clip.id,
            edge: trimStart ? 'start' : 'end',
            deltaMs: trimStart
              ? state.playheadMs - clip.startMs
              : state.playheadMs - end,
            ripple: state.magnet || event.shiftKey
          })
        }
        if (commands.length > 0) {
          event.preventDefault()
          dispatch({
            op: 'batch',
            commands,
            label: trimStart ? '删除左侧' : '删除右侧'
          })
        }
        return
      }

      if (shortcutMatches(event, 'timeline.freeze')) {
        event.preventDefault()
        void freezeFrame()
        return
      }

      if (shortcutMatches(event, 'timeline.mute')) {
        const selected = targets.filter((clip) =>
          state.selectedIds.includes(clip.id)
        )
        if (selected.length === 0) return
        event.preventDefault()
        const shouldMute = !selected.every((clip) => clip.muted)
        dispatch({
          op: 'batch',
          label: '切换静音',
          commands: selected.map((clip) => ({
            op: 'updateClip',
            clipId: clip.id,
            patch: { muted: shouldMute }
          }))
        })
        return
      }

      if (shortcutMatches(event, 'timeline.snap')) {
        event.preventDefault()
        state.toggleSnap()
        return
      }

      if (shortcutMatches(event, 'timeline.tool.select')) {
        state.setTool('select')
        return
      }

      if (shortcutMatches(event, 'timeline.tool.cut')) {
        state.setTool('cut')
        return
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dispatch, showToast])

  if (!doc) {
    return <section className={PANEL_ROOT} />
  }

  const isSelected = (id: string): boolean => selectedIds.includes(id)
  const dragClip =
    drag && preview
      ? (doc.clips.find((clip) => clip.id === drag.clipId) ?? null)
      : null

  return (
    <section className={PANEL_ROOT}>
      <div className="flex h-10 shrink-0 items-center gap-0.5 border-b border-divider px-2">
        <Button
          type="button"
          variant="ghost"
          size="none"
          className={`h-7 gap-1 !rounded-md px-2 text-xs !font-normal whitespace-nowrap ${
            tool === 'select' ? '!bg-surface-hover !text-fg' : ''
          }`}
          onClick={() => setTool('select')}
          title="选择 (V)"
        >
          <Icon name="cursor" size={13} />
          选择
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="none"
          className={`h-7 gap-1 !rounded-md px-2 text-xs !font-normal whitespace-nowrap ${
            tool === 'cut' ? '!bg-surface-hover !text-fg' : ''
          }`}
          onClick={() => setTool('cut')}
          title="切割 (C)"
        >
          <Icon name="scissors" size={13} />
          切割
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="none"
          className="h-7 gap-1 !rounded-md px-2 text-xs !font-normal whitespace-nowrap"
          onClick={addSubtitle}
          title="在播放头添加字幕"
        >
          <Icon name="text" size={13} />
          字幕
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="none"
          className={`h-7 gap-1 !rounded-md px-2 text-xs !font-normal whitespace-nowrap ${
            transcribing ? '!bg-surface-hover !text-fg' : ''
          }`}
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
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="none"
          className="h-7 gap-1 !rounded-md px-2 text-xs !font-normal whitespace-nowrap"
          onClick={() => void importSubtitles()}
          title="导入 SRT / VTT 字幕文件"
        >
          <Icon name="download" size={13} />
          导入字幕
        </Button>
        <span className="mx-1 h-4 w-px bg-divider" />
        <IconButton
          label={`撤销 (${undoShortcut})`}
          onClick={undo}
          disabled={history.past.length === 0}
        >
          ↶
        </IconButton>
        <IconButton
          label={`重做 (${redoShortcut})`}
          onClick={redo}
          disabled={history.future.length === 0}
        >
          ↷
        </IconButton>
        <span className="mx-1 h-4 w-px bg-divider" />
        <Button
          type="button"
          variant="ghost"
          size="none"
          className={`h-7 gap-1 !rounded-md px-2 text-xs !font-normal whitespace-nowrap ${
            snap ? '!bg-surface-hover !text-fg' : ''
          }`}
          onClick={toggleSnap}
        >
          <Icon name="target" size={13} />
          吸附
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="none"
          className={`h-7 gap-1 !rounded-md px-2 text-xs !font-normal whitespace-nowrap ${
            magnet ? '!bg-surface-hover !text-fg' : ''
          }`}
          onClick={toggleMagnet}
        >
          <Icon name="magnet" size={13} />
          磁性
        </Button>
        <span className="flex-1" />
        <IconButton
          label="缩小"
          onClick={() => zoomAt(zoom / 1.6, width / 2)}
          disabled={zoom <= 0.5}
        >
          −
        </IconButton>
        <span className="min-w-9 text-center text-[11px] text-fg-subtle">
          {Math.round(zoom * 100)}%
        </span>
        <IconButton
          label="放大"
          onClick={() => zoomAt(zoom * 1.6, width / 2)}
          disabled={zoom >= 4}
        >
          ＋
        </IconButton>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div
          className="w-[140px] shrink-0 overflow-hidden border-r border-divider"
          ref={headsRef}
        >
          <div className="h-7 border-b border-divider bg-surface" />
          {doc.tracks.map((track) => (
            <div
              key={track.id}
              className={`flex items-center justify-between gap-1 border-b border-divider bg-surface px-2 ${
                track.id === mainId
                  ? 'shadow-[inset_2px_0_0_var(--pick-bar)]'
                  : ''
              }`}
              style={{ height: trackHeight(track) }}
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <span
                  className={`inline-flex h-4 w-4 items-center justify-center rounded-md bg-surface-hover text-[9px] font-bold ${KIND_TONE[track.kind]}`}
                >
                  {KIND_LETTER[track.kind]}
                </span>
                <span className="truncate text-[11px] text-fg-muted">
                  {track.name}
                </span>
                {track.id === mainId ? (
                  <span className="whitespace-nowrap rounded-[3px] bg-surface-hover px-1 py-px text-[9px] text-fg-subtle">
                    主轨
                  </span>
                ) : null}
              </div>
              <div className="flex shrink-0 gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="none"
                  className="h-[18px] w-[18px] !rounded-md text-[9px] !font-normal !text-fg-subtle hover:!text-fg"
                  title="可见"
                >
                  ◉
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="none"
                  className="h-[18px] w-[18px] !rounded-md text-[9px] !font-normal !text-fg-subtle hover:!text-fg"
                  title="锁定"
                >
                  ▣
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div
          className="min-w-0 flex-1 overflow-auto"
          ref={scrollRef}
          onWheel={onWheel}
          onScroll={() => {
            if (headsRef.current && scrollRef.current) {
              headsRef.current.scrollTop = scrollRef.current.scrollTop
            }
          }}
        >
          <div
            className="relative min-h-full"
            style={{ width: Math.max(width, totalMs * pxPerMs) }}
          >
            <div
              className="relative h-7 cursor-ew-resize border-b border-divider"
              onPointerDown={seekRuler}
            >
              {ticks.map((tick) => (
                <span
                  key={tick.ms}
                  className="pointer-events-none absolute top-0 flex h-full items-center whitespace-nowrap border-l border-divider pl-1 text-[10px] text-fg-subtle [transform:translateX(-0.5px)]"
                  style={{ left: tick.ms * pxPerMs }}
                >
                  {tick.label}
                </span>
              ))}
              {doc.markers.map((marker) => (
                <Button
                  key={marker.id}
                  type="button"
                  variant="ghost"
                  size="none"
                  className={`absolute bottom-0 z-[3] h-3 max-w-24 gap-0.5 overflow-hidden whitespace-nowrap text-left text-[9px] leading-none !font-normal [transform:translateX(-3px)] hover:!bg-transparent ${
                    marker.durationMs
                      ? '!justify-start !rounded-[2px] px-0.5 !text-fg'
                      : '!justify-start !rounded-none'
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
                    className="h-1.5 w-1.5 shrink-0 rounded-[1px] bg-pick-bar [transform:rotate(45deg)]"
                    style={
                      marker.color ? { background: marker.color } : undefined
                    }
                  />
                  <span className="truncate">{marker.label}</span>
                </Button>
              ))}
            </div>

            <div className="relative" ref={lanesRef} onPointerDown={seekLanes}>
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
                    className="relative border-b border-divider"
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
                      const atMs = Math.max(
                        0,
                        (event.clientX - rect.left) / pxPerMs
                      )
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
                      if (active && preview && preview.trackId !== track.id)
                        return null
                      const startMs =
                        active && preview ? preview.startMs : clip.startMs
                      const durationMs =
                        active && preview ? preview.durationMs : clip.durationMs
                      const issue = referenceIssues[clip.id]
                      return (
                        <div
                          key={clip.id}
                          className={clipClass(
                            clip,
                            isSelected(clip.id),
                            issue
                          )}
                          style={{
                            left: startMs * pxPerMs,
                            width: Math.max(2, durationMs * pxPerMs)
                          }}
                          onPointerDown={(event) =>
                            handleClipPointerDown(event, clip)
                          }
                        >
                          <span
                            className={`${CLIP_LABEL} ${
                              isSelected(clip.id)
                                ? 'text-fg'
                                : 'text-fg-muted'
                            }`}
                          >
                            {clip.kind === 'text'
                              ? clip.text?.content || clip.name
                              : clip.name}
                          </span>
                          {issue?.missing ? (
                            <span className={`${CLIP_BADGE} border-dashed`}>
                              素材缺失
                            </span>
                          ) : issue?.updateAvailable ? (
                            <span className={CLIP_BADGE}>有新版本</span>
                          ) : null}
                          {clip.speed !== 1 ? (
                            <span className={`${CLIP_META} left-1.5`}>
                              {clip.speed}×
                            </span>
                          ) : null}
                          {clip.transitionIn ? (
                            <span className={`${CLIP_META} right-1.5`}>
                              {{
                                fade: '淡',
                                'dip-black': '黑',
                                'wipe-left': '擦',
                                'wipe-right': '擦',
                                'slide-left': '滑',
                                'slide-right': '滑',
                                'zoom-in': '缩'
                              }[clip.transitionIn.type] ?? '转'}
                            </span>
                          ) : null}
                          <ClipMedia
                            clip={clip}
                            widthPx={Math.max(2, durationMs * pxPerMs)}
                          />
                          <div
                            className={`absolute inset-y-0 left-0 z-[3] w-1.5 cursor-ew-resize ${
                              isSelected(clip.id)
                                ? 'bg-border-selected opacity-30'
                                : ''
                            }`}
                            onPointerDown={(event) =>
                              beginDrag(event, clip, 'trim-start')
                            }
                          />
                          <div
                            className={`absolute inset-y-0 right-0 z-[3] w-1.5 cursor-ew-resize ${
                              isSelected(clip.id)
                                ? 'bg-border-selected opacity-30'
                                : ''
                            }`}
                            onPointerDown={(event) =>
                              beginDrag(event, clip, 'trim-end')
                            }
                          />
                        </div>
                      )
                    })}
                    {ghost && preview ? (
                      <div
                        className={clipClass(ghost, false, undefined, true)}
                        style={{
                          left: preview.startMs * pxPerMs,
                          width: Math.max(2, preview.durationMs * pxPerMs)
                        }}
                      >
                        <span className={`${CLIP_LABEL} text-fg-muted`}>
                          {ghost.name}
                        </span>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>

            <div
              className="pointer-events-none absolute top-0 bottom-0 z-[3] w-px bg-pick-bar before:absolute before:-left-1 before:top-0 before:h-2 before:w-[9px] before:bg-pick-bar before:content-[''] before:[clip-path:polygon(0_0,100%_0,50%_100%)]"
              style={{ left: playheadMs * pxPerMs }}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
