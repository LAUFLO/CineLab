import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { docDurationMs, formatTimecode } from '@shared/timeline-layout'
import type { OutputRef } from '@shared/canvas-schema'
import type { TimelineVideoCodec } from '@shared/ipc-contract'
import type { TimelineDoc } from '@shared/timeline-schema'
import { assetUrl } from '../../lib/asset-url'
import { Icon } from '../../components/Icon'
import { Select } from '../../components/Select'
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

const FILM_STATUS_LABEL: Record<string, string> = {
  pending: '待生成',
  rendering: '渲染中',
  ready: '可导出',
  stale: '待更新',
  empty: '时间线为空',
  missing: '成片缺失'
}

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
      const doc = openDoc ?? (await window.api.timeline.load(studio.data.timelineId))
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
          (clip) =>
            clip.kind === 'audio' && !clip.muted && Boolean(clip.media)
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
      <div className={`cnode studio-node ${selected ? 'is-selected' : ''}`}>
        <div
          className="cnode__title"
          onDoubleClick={(event) => {
            event.stopPropagation()
            setTitleDraft(data.title)
            setEditingTitle(true)
          }}
        >
          <Icon name="film" size={12} />
          {editingTitle ? (
            <input
              className="cnode__title-input nodrag nopan"
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
          <span className={`studio-node__badge is-${filmStatus}`}>
            {FILM_STATUS_LABEL[filmStatus] ?? filmStatus}
          </span>
        </div>

        <div
          className="cnode__card studio-node__card"
          onDoubleClick={() => open()}
        >
          <div className="studio-node__preview">
            {assetSrc ? (
              <>
                <video
                  key={current?.id}
                  src={assetSrc}
                  className="studio-node__media"
                  muted
                  playsInline
                  preload="auto"
                  onLoadedMetadata={(event) => {
                    const video = event.currentTarget
                    video.currentTime = Math.min(0.1, video.duration || 0)
                  }}
                />
                <button
                  type="button"
                  className="studio-node__play nodrag nopan"
                  title="播放成片"
                  onClick={(event) => {
                    event.stopPropagation()
                    setPreviewOpen(true)
                  }}
                >
                  ▶
                </button>
              </>
            ) : (
              <button
                type="button"
                className="studio-node__empty nodrag nopan"
                onClick={open}
              >
                <Icon name="film" size={34} />
                <span>{clipCount > 0 ? '成片待生成' : '还没有素材'}</span>
                <span className="studio-node__empty-hint">
                  {clipCount > 0
                    ? '点下方「生成成片」'
                    : '双击进入剪辑室添加素材'}
                </span>
              </button>
            )}

            {busy ? (
              <div className="studio-node__progress">
                {filmStatus === 'rendering'
                  ? `渲染中 ${progress}%`
                  : `生成中 ${progress}%`}
              </div>
            ) : null}
          </div>

          <div className="studio-node__summary">
            <span className="studio-node__stats">
              {clipCount > 0
                ? `${clipCount} 个片段`
                : current
                  ? '成片'
                  : '暂无片段'}
              <span className="studio-node__dot">·</span>
              {formatTimecode(durationMs)}
              {current ? (
                <>
                  <span className="studio-node__dot">·</span>
                  {current.width ?? '—'}×{current.height ?? '—'}
                </>
              ) : null}
            </span>

            {outputs.length > 1 ? (
              <span className="studio-node__versions nodrag nopan">
                <button
                  type="button"
                  className="cnode__version-btn"
                  title="更早的版本"
                  disabled={currentIndex >= outputs.length - 1}
                  onClick={(event) => {
                    event.stopPropagation()
                    shiftVersion(1)
                  }}
                >
                  ‹
                </button>
                <span className="cnode__version-label">
                  {outputs.length - currentIndex}/{outputs.length}
                </span>
                <button
                  type="button"
                  className="cnode__version-btn"
                  title="更新的版本"
                  disabled={currentIndex <= 0}
                  onClick={(event) => {
                    event.stopPropagation()
                    shiftVersion(-1)
                  }}
                >
                  ›
                </button>
              </span>
            ) : null}
          </div>

          <div className="studio-node__actions nodrag nopan">
            <button
              type="button"
              className="studio-node__btn"
              title="进入剪辑室"
              onClick={open}
            >
              <Icon name="film" size={12} />
              剪辑室
            </button>
            <button
              type="button"
              className="studio-node__btn"
              title="导出字幕轨为 VTT"
              onClick={(event) => void exportSubtitles(event)}
            >
              VTT
            </button>
            <Select
              className="studio-node__codec nodrag nopan"
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
            <button
              type="button"
              className="studio-node__btn is-primary"
              onClick={(event) => void exportFilm(event)}
              disabled={filmStatus === 'empty' || filmStatus === 'missing'}
            >
              {busy ? '取消' : current ? '重新生成' : '生成成片'}
            </button>
          </div>
        </div>

        <Handle
          type="target"
          position={Position.Left}
          className="cnode__handle cnode__handle--left"
          title="接收素材连线"
        >
          <Icon name="plus" size={12} className="cnode__handle-icon" />
        </Handle>

        <Handle
          type="source"
          position={Position.Right}
          className="cnode__handle cnode__handle--right"
          title="把成片接到其他节点"
        >
          <Icon name="plus" size={12} className="cnode__handle-icon" />
        </Handle>
      </div>

      {previewOpen && current
        ? createPortal(
            <div
              className="image-preview"
              onPointerDown={() => setPreviewOpen(false)}
            >
              <div
                className="image-preview__player"
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
