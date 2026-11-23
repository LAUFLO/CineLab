import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { docDurationMs, formatTimecode } from '@shared/timeline-layout'
import type { OutputRef } from '@shared/canvas-schema'
import type { TimelineVideoCodec } from '@shared/ipc-contract'
import type { TimelineDoc } from '@shared/timeline-schema'
import { assetUrl } from '../../lib/asset-url'
import { Icon } from '../../components/Icon'

import {
  isStudioNode,
  useCanvasStore,
  type StudioNode
} from '../../stores/canvas'
import { useStudioStore } from '../../stores/studio'
import { useTimelineStore } from '../../stores/timeline'
import { useUIStore } from '../../stores/ui'
import { referencesFromDoc, upstreamSignature } from '../../studio/references'
import { VideoPlayer } from './VideoPlayer'
import { TimelineCanvas } from '../../studio/TimelineCanvas'
import { useTimelineAudio } from '../../studio/useTimelineAudio'
import {
  acquireAudioPlayback,
  acquireVideoPlayback,
  pauseAllPlayback,
  releaseAudioPlayback,
  releaseVideoPlayback
} from './playbackBudget'
import {
  getCachedTimeline,
  invalidateTimelineCache,
  setCachedTimeline
} from '../../studio/docCache'
import { Input, Button, Select } from '../../components/ui'

const FILM_STATUS_LABEL: Record<string, string> = {
  pending: '待生成',
  rendering: '渲染中',
  ready: '可导出',
  stale: '待更新',
  empty: '时间线为空',
  missing: '导出文件缺失'
}

const FILM_STATUS_TONE: Record<string, string> = {
  pending: 'text-fg-muted',
  ready: 'text-fg',
  rendering: 'text-fg',
  stale: 'border border-border-strong text-fg-muted',
  empty: 'text-fg-subtle',
  missing: 'text-fg-subtle'
}

const CARD_CLASS =
  'relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-card bg-surface-raised shadow-node transition-colors duration-[120ms]'
const CARD_BORDER_CLASS = 'border border-border group-hover:border-border-strong'
const CARD_SELECTED_BORDER_CLASS = 'border-2 border-border-selected'

const BTN_CLASS =
  '!h-7 gap-[5px] !rounded-md !border !border-border !bg-surface !px-2.5 !text-[11.5px] !font-normal !text-fg whitespace-nowrap hover:!bg-surface-hover hover:!text-fg'

export function StudioNodeView({ id, data, selected }: NodeProps<StudioNode>) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(data.title)
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [codec, setCodec] = useState<TimelineVideoCodec>('h264')
  const [previewOpen, setPreviewOpen] = useState(false)
  const patchStudioNode = useCanvasStore((state) => state.patchStudioNode)
  const removeEdges = useCanvasStore((state) => state.removeEdges)
  const setStudioFilmStatus = useCanvasStore(
    (state) => state.setStudioFilmStatus
  )
  const applyStudioOutput = useCanvasStore((state) => state.applyStudioOutput)
  const openStudio = useStudioStore((state) => state.openStudio)
  const showToast = useUIStore((state) => state.showToast)

  const outputs = data.outputs ?? []
  const selectedIndex = outputs.findIndex(
    (item) => item.id === data.selectedOutputId
  )
  const currentIndex = selectedIndex >= 0 ? selectedIndex : 0
  const current = outputs[currentIndex] ?? null
  const filmStatus = data.filmStatus ?? (current ? 'ready' : 'pending')
  const busy = exporting || filmStatus === 'rendering'
  const assetSrc = current ? assetUrl(current.path, current.scope) : null
  const clipCount = data.clipCount ?? 0
  const [previewDoc, setPreviewDoc] = useState<TimelineDoc | null>(null)
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const [previewTimeMs, setPreviewTimeMs] = useState(0)
  const [previewTab, setPreviewTab] = useState<'live' | 'exported'>('live')
  const previewTimeMsRef = useRef(previewTimeMs)
  previewTimeMsRef.current = previewTimeMs
  const studioOpen = useStudioStore((state) => state.open)
  const studioNodeId = useStudioStore((state) => state.nodeId)
  const isSelfOpen = studioOpen && studioNodeId === id
  const storeTimelineDoc = useTimelineStore((state) => state.doc)

  // 实时预览：剪辑室打开时用 store doc，否则用缓存或磁盘
  useEffect(() => {
    if (isSelfOpen) {
      setPreviewDoc(storeTimelineDoc)
      if (storeTimelineDoc) {
        setCachedTimeline(data.timelineId, storeTimelineDoc)
      }
      return
    }

    let alive = true
    const cached = getCachedTimeline(data.timelineId)
    if (cached) {
      setPreviewDoc(cached)
      return
    }
    void window.api.timeline
      .load(data.timelineId)
      .then((doc) => {
        if (!alive) return
        if (doc) setCachedTimeline(data.timelineId, doc)
        setPreviewDoc(doc)
      })
      .catch(() => {
        if (alive) setPreviewDoc(null)
      })
    return () => {
      alive = false
    }
  }, [id, data.timelineId, isSelfOpen, storeTimelineDoc])

  // 时间线保存后刷新；剪辑室打开时跳过，关闭时统一刷新（100ms debounce）
  useEffect(() => {
    let timer = 0
    const unsubscribe = window.api.timeline.onTimelineChanged((payload) => {
      if (payload.timelineId !== data.timelineId) return
      const state = useStudioStore.getState()
      if (state.open && state.nodeId === id) return
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        invalidateTimelineCache(payload.timelineId)
        void window.api.timeline
          .load(payload.timelineId)
          .then((doc) => {
            if (doc) setCachedTimeline(payload.timelineId, doc)
            setPreviewDoc(doc)
          })
          .catch(() => undefined)
      }, 100)
    })
    return () => {
      window.clearTimeout(timer)
      unsubscribe()
    }
  }, [id, data.timelineId])

  // 节点内播放时钟：从第 0 帧开始，播完回到第 0 帧
  useEffect(() => {
    if (!previewPlaying || !previewDoc) return
    const total = Math.max(docDurationMs(previewDoc), 1)
    let last = performance.now()
    let lastDraw = 0
    let frame = 0
    const tick = (now: number): void => {
      const delta = now - last
      last = now
      if (now - lastDraw >= 66) {
        lastDraw = now
        setPreviewTimeMs((current) => {
          const next = current + delta
          if (next >= total) {
            setPreviewPlaying(false)
            return 0
          }
          return next
        })
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [previewPlaying, previewDoc])

  // 节点内播放占用一个视频名额
  useEffect(() => {
    if (!previewPlaying) return
    const playbackId = `studio:${id}`
    acquireVideoPlayback(playbackId, () => setPreviewPlaying(false))
    return () => releaseVideoPlayback(playbackId)
  }, [previewPlaying, id])

  // 打开大预览时暂停节点小窗播放
  useEffect(() => {
    if (previewOpen) setPreviewPlaying(false)
  }, [previewOpen])

  // 关闭大预览或切到导出版本时释放出声名额
  useEffect(() => {
    if (!previewOpen || previewTab !== 'live') {
      releaseAudioPlayback('studio-preview')
    }
  }, [previewOpen, previewTab])

  useEffect(() => {
    if (!previewPlaying) releaseAudioPlayback('studio-preview')
  }, [previewPlaying])

  // 大预览实时预览出声
  useTimelineAudio(
    previewDoc,
    previewOpen && previewTab === 'live' && previewPlaying,
    () => previewTimeMsRef.current
  )

  const durationMs =
    data.durationMs && data.durationMs > 0
      ? data.durationMs
      : Math.round((current?.duration ?? 0) * 1000)

  useEffect(() => {
    if (!previewOpen) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setPreviewOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [previewOpen])

  const submitTitle = (): void => {
    const next = titleDraft.trim()
    setEditingTitle(false)
    if (next && next !== data.title) patchStudioNode(id, { title: next })
  }

  const open = (event?: React.MouseEvent): void => {
    event?.stopPropagation()
    openStudio(id)
  }

  const shiftVersion = (delta: number): void => {
    const next = outputs[currentIndex + delta]
    if (next) patchStudioNode(id, { selectedOutputId: next.id })
  }

  const deleteVersion = async (event: React.MouseEvent): Promise<void> => {
    event.stopPropagation()
    if (!current) return
    if (!window.confirm('删除这个导出版本？将同时删除文件，且不可恢复。')) {
      return
    }

    const output = current
    const remaining = outputs.filter((item) => item.id !== output.id)
    const nextSelected = remaining[0]

    const state = useCanvasStore.getState()
    const stillReferenced = state.nodes.some((node) => {
      if (node.id === id) return false
      const nodeOutputs = (node.data as { outputs?: { path: string }[] }).outputs
      return nodeOutputs?.some((item) => item.path === output.path) ?? false
    })

    patchStudioNode(id, {
      outputs: remaining,
      selectedOutputId: nextSelected?.id,
      filmStatus: remaining.length > 0 ? 'ready' : 'pending'
    })

    if (remaining.length === 0) {
      const edges = state.edges.filter((edge) => edge.source === id)
      if (edges.length > 0) {
        removeEdges(edges.map((edge) => edge.id))
      }
    }

    if (!stillReferenced) {
      await window.api.export.deleteFile(output.path).catch(() => undefined)
    }

    showToast(
      stillReferenced ? '已删除版本（文件仍被其他节点引用）' : '已删除版本和文件'
    )
  }

  const loadStudioDoc = async (): Promise<{
    studio: StudioNode
    doc: TimelineDoc | null
  } | null> => {
    const state = useCanvasStore.getState()
    const studio = state.nodes.find((node) => node.id === id)
    if (!studio || !isStudioNode(studio)) {
      showToast('找不到对应的剪辑室节点', 'error')
      return null
    }

    const studioState = useStudioStore.getState()
    const openDoc =
      studioState.open && studioState.nodeId === id
        ? useTimelineStore.getState().doc
        : null

    try {
      const doc =
        openDoc ?? (await window.api.timeline.load(studio.data.timelineId))
      return { studio, doc }
    } catch (error) {
      setStudioFilmStatus(id, current ? 'stale' : 'pending')
      showToast(error instanceof Error ? error.message : String(error), 'error')
      return null
    }
  }

  const exportFilm = async (event?: React.MouseEvent): Promise<void> => {
    event?.stopPropagation()
    if (busy) {
      void window.api.timeline.cancelExport()
      return
    }

    const loaded = await loadStudioDoc()
    if (!loaded) return
    const { studio, doc } = loaded

    if (!doc || doc.clips.length === 0) {
      setStudioFilmStatus(id, 'empty')
      showToast('时间线为空，先进入剪辑室添加素材', 'error')
      return
    }

    const studioState = useStudioStore.getState()
    if (studioState.open && studioState.nodeId === id) {
      await window.api.timeline.save(studio.data.timelineId, doc)
    }

    pauseAllPlayback()
    setPreviewPlaying(false)
    showToast('导出中，画布预览已暂停')
    setExporting(true)
    setProgress(0)
    setStudioFilmStatus(id, 'rendering')

    const unsubscribe = window.api.timeline.onExportProgress((value) => {
      setProgress(Math.round((value.frame / value.total) * 100))
    })

    try {
      const result = await window.api.timeline.export(doc, { codec })
      if (result.canceled) {
        setStudioFilmStatus(id, current ? 'stale' : 'pending')
        showToast('已取消导出')
        return
      }
      if (!result.ok || !result.path) {
        setStudioFilmStatus(id, current ? 'stale' : 'pending')
        showToast('导出失败', 'error')
        return
      }

      const uniqueVideoPaths = [
        ...new Set(
          doc.clips
            .filter(
              (clip) =>
                clip.kind === 'video' && !clip.muted && Boolean(clip.media)
            )
            .map((clip) => clip.media!.path)
        )
      ]
      const videoHasAudio = (
        await Promise.all(
          uniqueVideoPaths.map((path) =>
            window.api.media
              .probe(path)
              .then((probe) => probe.hasAudio)
              .catch(() => false)
          )
        )
      ).some(Boolean)
      const hasAudio =
        videoHasAudio ||
        doc.clips.some(
          (clip) => clip.kind === 'audio' && !clip.muted && Boolean(clip.media)
        )

      const output: OutputRef = {
        id: `film_${Date.now().toString(36)}`,
        path: result.path,
        scope: 'project',
        kind: 'video',
        createdAt: new Date().toISOString(),
        model: '剪辑室',
        width: doc.video.width,
        height: doc.video.height,
        duration: docDurationMs(doc) / 1000,
        fps: doc.video.fps,
        hasAudio
      }

      applyStudioOutput(id, output)
      patchStudioNode(id, {
        upstreamAck: upstreamSignature(
          referencesFromDoc(doc),
          useCanvasStore.getState().nodes
        )
      })
      showToast(`已导出成片：${result.path}`)
    } catch (error) {
      setStudioFilmStatus(id, current ? 'stale' : 'pending')
      showToast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      unsubscribe()
      setExporting(false)
      setProgress(0)
      showToast('导出结束，画布预览已恢复')
    }
  }

  const exportSubtitles = async (event: React.MouseEvent): Promise<void> => {
    event.stopPropagation()

    const loaded = await loadStudioDoc()
    if (!loaded) return
    const { doc } = loaded

    if (!doc) {
      showToast('时间线为空，先添加字幕', 'error')
      return
    }

    try {
      const path = await window.api.timeline.exportVtt(doc)
      showToast(`字幕已导出：${path}`)
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
    }
  }

  return (
    <>
      <div
        data-cnode
        data-node-kind="studio"
        data-selected={selected || undefined}
        className="group relative flex h-full w-full flex-col"
      >
        <div
          className="flex h-7 shrink-0 items-center gap-[5px] overflow-hidden pl-1 text-xs whitespace-nowrap text-fg-muted group-data-[selected]:text-fg"
          onDoubleClick={(event) => {
            event.stopPropagation()
            setTitleDraft(data.title)
            setEditingTitle(true)
          }}
        >
          <Icon name="film" size={12} />
          {editingTitle ? (
            <Input
              className="nodrag nopan !h-5 !w-[140px] !rounded-md !border-border-strong !bg-surface-hover !px-1.5 !text-xs"
              value={titleDraft}
              autoFocus
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={submitTitle}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submitTitle()
                if (event.key === 'Escape') setEditingTitle(false)
              }}
              onClick={(event) => event.stopPropagation()}
            />
          ) : (
            <span>{data.title}</span>
          )}
          <span
            className={`ml-auto rounded-pill bg-surface-hover px-[7px] py-px text-[10px] leading-4 whitespace-nowrap ${
              FILM_STATUS_TONE[filmStatus] ?? 'text-fg-muted'
            }`}
          >
            {FILM_STATUS_LABEL[filmStatus] ?? filmStatus}
          </span>
        </div>

        <div
          data-node-card
          className={`${CARD_CLASS} ${
            selected ? CARD_SELECTED_BORDER_CLASS : CARD_BORDER_CLASS
          }`}
          onDoubleClick={() => open()}
        >
          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-media-bg">
            {previewDoc && previewDoc.clips.length > 0 ? (
              <>
                <TimelineCanvas
                  doc={previewDoc}
                  timeMs={previewTimeMs}
                  playing={previewPlaying}
                  renderScale={0.35}
                  className="block max-h-full max-w-full"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="none"
                  className="nodrag nopan absolute top-1/2 left-1/2 !h-11 !w-11 -translate-x-1/2 -translate-y-1/2 !rounded-full !border !border-white/35 !bg-black/45 !text-[15px] !text-white hover:!bg-black/[0.65] hover:!text-white"
                  title={previewPlaying ? '暂停预览' : '播放预览'}
                  onClick={(event) => {
                    event.stopPropagation()
                    if (previewPlaying) {
                      setPreviewPlaying(false)
                    } else {
                      setPreviewTimeMs(0)
                      setPreviewPlaying(true)
                    }
                  }}
                >
                  {previewPlaying ? '❚❚' : '▶'}
                </Button>
                {assetSrc ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="none"
                    className="nodrag nopan absolute top-2 right-2 !h-7 !w-7 !rounded-full !border !border-border !bg-surface/80 !text-fg-muted hover:!bg-surface hover:!text-fg"
                    title="查看导出版本"
                    onClick={(event) => {
                      event.stopPropagation()
                      setPreviewOpen(true)
                    }}
                  >
                    <Icon name="film" size={13} />
                  </Button>
                ) : null}
              </>
            ) : assetSrc ? (
              <>
                <video
                  key={current?.id}
                  src={assetSrc}
                  className="h-full w-full object-contain"
                  muted
                  playsInline
                  preload="auto"
                  onLoadedMetadata={(event) => {
                    const video = event.currentTarget
                    video.currentTime = Math.min(0.1, video.duration || 0)
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="none"
                  className="nodrag nopan absolute top-1/2 left-1/2 !h-11 !w-11 -translate-x-1/2 -translate-y-1/2 !rounded-full !border !border-white/35 !bg-black/45 !text-[15px] !text-white hover:!bg-black/[0.65] hover:!text-white"
                  title="播放成片"
                  onClick={(event) => {
                    event.stopPropagation()
                    setPreviewOpen(true)
                  }}
                >
                  ▶
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="none"
                className="nodrag nopan flex !h-full w-full !flex-col !items-center !justify-center gap-1.5 !rounded-none !text-xs !font-normal !text-fg-subtle hover:!bg-transparent hover:!text-fg-muted"
                onClick={open}
              >
                <Icon name="film" size={34} />
                <span>{clipCount > 0 ? '当前为实时预览' : '还没有素材'}</span>
                <span className="text-[10.5px] text-fg-subtle opacity-80">
                  {clipCount > 0
                    ? '点下方「导出成片」'
                    : '双击进入剪辑室添加素材'}
                </span>
              </Button>
            )}

            {busy ? (
              <div className="absolute bottom-2.5 left-2.5 rounded-md bg-black/[0.62] px-2 py-[3px] text-[11px] text-white">
                {filmStatus === 'rendering'
                  ? `渲染中 ${progress}%`
                  : `生成中 ${progress}%`}
              </div>
            ) : null}
          </div>

          <div className="flex h-7 shrink-0 items-center justify-between gap-2 border-t border-divider px-3 text-[11px] text-fg-subtle">
            <span className="flex min-w-0 items-center gap-1.5 overflow-hidden truncate whitespace-nowrap">
              {clipCount > 0
                ? `${clipCount} 个片段`
                : current
                  ? '导出版本'
                  : '暂无片段'}
              <span className="text-fg-subtle opacity-70">·</span>
              {formatTimecode(durationMs)}
              {current ? (
                <>
                  <span className="text-fg-subtle opacity-70">·</span>
                  {current.width ?? '—'}×{current.height ?? '—'}
                </>
              ) : null}
            </span>

            {outputs.length > 1 ? (
              <span className="nodrag nopan inline-flex shrink-0 items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="none"
                  className="!h-[18px] !w-[18px] !rounded-pill !text-[11px] !text-inherit enabled:hover:!bg-white/16 disabled:!cursor-default disabled:!opacity-35"
                  title="更早的版本"
                  disabled={currentIndex >= outputs.length - 1}
                  onClick={(event) => {
                    event.stopPropagation()
                    shiftVersion(1)
                  }}
                >
                  ‹
                </Button>
                <span className="px-0.5 tabular-nums">
                  {outputs.length - currentIndex}/{outputs.length}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="none"
                  className="!h-[18px] !w-[18px] !rounded-pill !text-[11px] !text-inherit enabled:hover:!bg-white/16 disabled:!cursor-default disabled:!opacity-35"
                  title="更新的版本"
                  disabled={currentIndex <= 0}
                  onClick={(event) => {
                    event.stopPropagation()
                    shiftVersion(-1)
                  }}
                >
                  ›
                </Button>
              </span>
            ) : null}

            {current ? (
              <Button
                type="button"
                variant="ghost"
                size="none"
                className="!h-[18px] !w-[18px] !rounded-pill !text-[11px] !text-inherit enabled:hover:!bg-white/16"
                title="删除这个导出版本"
                onClick={(event) => void deleteVersion(event)}
              >
                <Icon name="trash" size={10} />
              </Button>
            ) : null}
          </div>

          <div className="nodrag nopan flex items-center gap-1.5 px-2.5 pb-2.5">
            <Button
              type="button"
              variant="ghost"
              size="none"
              className={BTN_CLASS}
              title="进入剪辑室"
              onClick={open}
            >
              <Icon name="film" size={12} />
              剪辑室
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="none"
              className={BTN_CLASS}
              title="导出字幕轨为 VTT"
              onClick={(event) => void exportSubtitles(event)}
            >
              VTT
            </Button>
            <Select
              className="nodrag nopan !h-7 !w-auto !min-w-0 !flex-none !rounded-md !bg-surface !px-2 !text-[11.5px]"
              title="导出编码"
              value={codec}
              disabled={busy}
              options={[
                { value: 'h264', label: 'H.264' },
                { value: 'hevc', label: 'HEVC' },
                { value: 'av1', label: 'AV1' }
              ]}
              onChange={(value) => setCodec(value as TimelineVideoCodec)}
            />
            <Button
              type="button"
              variant="primary"
              size="none"
              className="ml-auto !h-7 !rounded-md !border-0 !px-2.5 !text-[11.5px] !font-semibold disabled:!cursor-not-allowed disabled:!opacity-40"
              onClick={(event) => void exportFilm(event)}
              disabled={filmStatus === 'empty' || filmStatus === 'missing'}
            >
              {busy ? '取消导出' : current ? '重新导出' : '导出成片'}
            </Button>
          </div>
        </div>

        <Handle
          type="target"
          position={Position.Left}
          data-handle="left"
          title="接收素材连线"
        >
          <Icon name="plus" size={12} />
        </Handle>

        <Handle
          type="source"
          position={Position.Right}
          data-handle="right"
          title="把成片接到其他节点"
        >
          <Icon name="plus" size={12} />
        </Handle>
      </div>

      {previewOpen && (current || (previewDoc && previewDoc.clips.length > 0))
        ? createPortal(
            <div
              className="fixed inset-0 z-[250] flex items-center justify-center bg-overlay p-12"
              onPointerDown={() => setPreviewOpen(false)}
            >
              <div
                className="relative flex aspect-video max-h-[calc(100vh-96px)] w-[min(1280px,calc(100vw-96px))] items-center justify-center overflow-hidden rounded-card bg-media-bg shadow-float"
                onPointerDown={(event) => event.stopPropagation()}
              >
                <div className="nodrag nopan absolute top-3 left-3 z-10 flex gap-1 rounded-pill bg-black/45 p-1 backdrop-blur">
                  <Button
                    type="button"
                    variant="ghost"
                    size="none"
                    className={`!h-7 !rounded-pill !px-3 !text-[11.5px] ${
                      previewTab === 'live' ? '!bg-white/18 !text-white' : '!text-white/70'
                    }`}
                    onClick={() => setPreviewTab('live')}
                    disabled={!previewDoc || previewDoc.clips.length === 0}
                  >
                    实时预览
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="none"
                    className={`!h-7 !rounded-pill !px-3 !text-[11.5px] ${
                      previewTab === 'exported' ? '!bg-white/18 !text-white' : '!text-white/70'
                    }`}
                    onClick={() => setPreviewTab('exported')}
                    disabled={!current}
                  >
                    导出版本
                  </Button>
                </div>

                {previewTab === 'live' && previewDoc && previewDoc.clips.length > 0 ? (
                  <>
                    <TimelineCanvas
                      doc={previewDoc}
                      timeMs={previewTimeMs}
                      playing={previewPlaying}
                      renderScale={0.5}
                      className="block max-h-full max-w-full"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="none"
                      className="nodrag nopan absolute bottom-6 left-1/2 !h-11 !w-11 -translate-x-1/2 !rounded-full !border !border-white/35 !bg-black/45 !text-[15px] !text-white hover:!bg-black/[0.65] hover:!text-white"
                      title={previewPlaying ? '暂停预览' : '播放预览'}
                      onClick={() => {
                        if (previewPlaying) {
                          releaseAudioPlayback('studio-preview')
                          setPreviewPlaying(false)
                        } else {
                          acquireAudioPlayback('studio-preview', () =>
                            setPreviewPlaying(false)
                          )
                          setPreviewTimeMs(0)
                          setPreviewPlaying(true)
                        }
                      }}
                    >
                      {previewPlaying ? '❚❚' : '▶'}
                    </Button>
                  </>
                ) : previewTab === 'live' ? (
                  <div className="flex h-full w-full items-center justify-center text-[12px] text-white/60">
                    时间线为空
                  </div>
                ) : current ? (
                  <VideoPlayer
                    src={assetUrl(current.path, current.scope)}
                    path={current.path}
                    fps={current.fps}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[12px] text-white/60">
                    还没有导出版本
                  </div>
                )}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  )
}
