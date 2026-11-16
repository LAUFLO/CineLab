import { useEffect, useState } from 'react'
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
import { Input, Button, Select } from '../../components/ui'

const FILM_STATUS_LABEL: Record<string, string> = {
  pending: '待生成',
  rendering: '渲染中',
  ready: '可导出',
  stale: '待更新',
  empty: '时间线为空',
  missing: '成片缺失'
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
  'relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-card border bg-surface-raised shadow-node transition-colors duration-[120ms]'

const BTN_CLASS =
  '!h-7 gap-[5px] !rounded-[7px] !border !border-border !bg-surface !px-2.5 !text-[11.5px] !font-normal !text-fg whitespace-nowrap hover:!bg-surface-hover hover:!text-fg'

export function StudioNodeView({ id, data, selected }: NodeProps<StudioNode>) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(data.title)
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [codec, setCodec] = useState<TimelineVideoCodec>('h264')
  const [previewOpen, setPreviewOpen] = useState(false)
  const patchStudioNode = useCanvasStore((state) => state.patchStudioNode)
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
        showToast('已取消生成成片')
        return
      }
      if (!result.ok || !result.path) {
        setStudioFilmStatus(id, current ? 'stale' : 'pending')
        showToast('生成成片失败', 'error')
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
      showToast(`成片已生成：${result.path}`)
    } catch (error) {
      setStudioFilmStatus(id, current ? 'stale' : 'pending')
      showToast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      unsubscribe()
      setExporting(false)
      setProgress(0)
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
              className="nodrag nopan !h-5 !w-[140px] !rounded-[5px] !border-border-strong !bg-surface-hover !px-1.5 !text-xs"
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
            selected
              ? 'border-border-selected'
              : 'border-border group-hover:border-border-strong'
          }`}
          onDoubleClick={() => open()}
        >
          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-media-bg">
            {assetSrc ? (
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
                <span>{clipCount > 0 ? '成片待生成' : '还没有素材'}</span>
                <span className="text-[10.5px] text-fg-subtle opacity-80">
                  {clipCount > 0
                    ? '点下方「生成成片」'
                    : '双击进入剪辑室添加素材'}
                </span>
              </Button>
            )}

            {busy ? (
              <div className="absolute bottom-2.5 left-2.5 rounded-[6px] bg-black/[0.62] px-2 py-[3px] text-[11px] text-white">
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
                  ? '成片'
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
              className="nodrag nopan !h-7 !w-auto !min-w-0 !flex-none !rounded-[7px] !bg-surface !px-2 !text-[11.5px]"
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
              className="ml-auto !h-7 !rounded-[7px] !border-0 !px-2.5 !text-[11.5px] !font-semibold disabled:!cursor-not-allowed disabled:!opacity-40"
              onClick={(event) => void exportFilm(event)}
              disabled={filmStatus === 'empty' || filmStatus === 'missing'}
            >
              {busy ? '取消' : current ? '重新生成' : '生成成片'}
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

      {previewOpen && current
        ? createPortal(
            <div
              className="fixed inset-0 z-[250] flex items-center justify-center bg-black/[0.72] p-12"
              onPointerDown={() => setPreviewOpen(false)}
            >
              <div
                className="aspect-video max-h-[calc(100vh-96px)] w-[min(1280px,calc(100vw-96px))] overflow-hidden rounded-[10px] bg-media-bg shadow-float"
                onPointerDown={(event) => event.stopPropagation()}
              >
                <VideoPlayer
                  src={assetUrl(current.path, current.scope)}
                  path={current.path}
                  fps={current.fps}
                />
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  )
}
