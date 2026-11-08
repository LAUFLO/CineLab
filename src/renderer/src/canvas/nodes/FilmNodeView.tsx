import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { docDurationMs, formatTimecode } from '@shared/timeline-layout'
import type { OutputRef } from '@shared/canvas-schema'
import type { TimelineVideoCodec } from '@shared/ipc-contract'
import { assetUrl } from '../../lib/asset-url'
import { Icon } from '../../components/Icon'
import {
  isStudioNode,
  useCanvasStore,
  type FilmNode
} from '../../stores/canvas'
import { useStudioStore } from '../../stores/studio'
import { useTimelineStore } from '../../stores/timeline'
import { useUIStore } from '../../stores/ui'
import { referencesFromDoc, upstreamSignature } from '../../studio/references'
import { VideoPlayer } from './VideoPlayer'

const STATUS_LABEL: Record<string, string> = {
  pending: '待生成',
  rendering: '渲染中',
  ready: '可导出',
  stale: '待更新',
  empty: '时间线为空',
  missing: '剪辑室缺失'
}

function statusTone(filmStatus: string | undefined): string {
  return filmStatus ?? 'pending'
}

export function FilmNodeView({ id, data, selected }: NodeProps<FilmNode>) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(data.title)
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [codec, setCodec] = useState<TimelineVideoCodec>('h264')
  const [previewOpen, setPreviewOpen] = useState(false)
  const patchFilmNode = useCanvasStore((state) => state.patchFilmNode)
  const setFilmStatus = useCanvasStore((state) => state.setFilmStatus)
  const applyFilmOutput = useCanvasStore((state) => state.applyFilmOutput)
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
    if (next && next !== data.title) patchFilmNode(id, { title: next })
  }

  const shiftVersion = (delta: number): void => {
    const next = outputs[currentIndex + delta]
    if (next) patchFilmNode(id, { selectedOutputId: next.id })
  }

  const openSourceStudio = (event: React.MouseEvent): void => {
    event.stopPropagation()
    if (data.studioNodeId) openStudio(data.studioNodeId)
  }

  const exportFilm = async (event?: React.MouseEvent): Promise<void> => {
    event?.stopPropagation()
    if (busy) {
      void window.api.timeline.cancelExport()
      return
    }

    const state = useCanvasStore.getState()
    const studio = data.studioNodeId
      ? state.nodes.find((node) => node.id === data.studioNodeId)
      : undefined
    if (!studio || !isStudioNode(studio)) {
      setFilmStatus(id, 'missing')
      showToast('找不到对应的剪辑室节点', 'error')
      return
    }

    const studioState = useStudioStore.getState()
    const openDoc =
      studioState.open && studioState.nodeId === studio.id
        ? useTimelineStore.getState().doc
        : null

    let doc = openDoc
    try {
      if (doc) {
        await window.api.timeline.save(studio.data.timelineId, doc)
      } else {
        doc = await window.api.timeline.load(studio.data.timelineId)
      }
    } catch (error) {
      setFilmStatus(id, current ? 'stale' : 'pending')
      showToast(
        error instanceof Error ? error.message : String(error),
        'error'
      )
      return
    }

    if (!doc || doc.clips.length === 0) {
      setFilmStatus(id, 'empty')
      showToast('时间线为空，先进入剪辑室添加素材', 'error')
      return
    }

    setExporting(true)
    setProgress(0)
    setFilmStatus(id, 'rendering')

    const unsubscribe = window.api.timeline.onExportProgress((value) => {
      setProgress(Math.round((value.frame / value.total) * 100))
    })

    try {
      const result = await window.api.timeline.export(doc, { codec })
      if (result.canceled) {
        setFilmStatus(id, current ? 'stale' : 'pending')
        showToast('已取消生成成片')
        return
      }
      if (!result.ok || !result.path) {
        setFilmStatus(id, current ? 'stale' : 'pending')
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

      applyFilmOutput(id, output)
      patchFilmNode(id, {
        upstreamAck: upstreamSignature(
          referencesFromDoc(doc),
          useCanvasStore.getState().nodes
        )
      })
      showToast(`成片已生成：${result.path}`)
    } catch (error) {
      setFilmStatus(id, current ? 'stale' : 'pending')
      showToast(
        error instanceof Error ? error.message : String(error),
        'error'
      )
    } finally {
      unsubscribe()
      setExporting(false)
      setProgress(0)
    }
  }

  const exportSubtitles = async (
    event: React.MouseEvent
  ): Promise<void> => {
    event.stopPropagation()

    const state = useCanvasStore.getState()
    const studio = data.studioNodeId
      ? state.nodes.find((node) => node.id === data.studioNodeId)
      : undefined
    if (!studio || !isStudioNode(studio)) {
      showToast('找不到对应的剪辑室节点', 'error')
      return
    }

    const studioState = useStudioStore.getState()
    const openDoc =
      studioState.open && studioState.nodeId === studio.id
        ? useTimelineStore.getState().doc
        : null

    let doc = openDoc
    try {
      if (doc) {
        await window.api.timeline.save(studio.data.timelineId, doc)
      } else {
        doc = await window.api.timeline.load(studio.data.timelineId)
      }
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : String(error),
        'error'
      )
      return
    }

    if (!doc) {
      showToast('时间线为空，先添加字幕', 'error')
      return
    }

    try {
      const path = await window.api.timeline.exportVtt(doc)
      showToast(`字幕已导出：${path}`)
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : String(error),
        'error'
      )
    }
  }

  return (
    <>
      <div className={`cnode film-node ${selected ? 'is-selected' : ''}`}>
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
          <span className={`film-node__badge is-${statusTone(filmStatus)}`}>
            {STATUS_LABEL[filmStatus] ?? filmStatus}
          </span>
        </div>

        <div className="cnode__card film-node__card">
          <div className="film-node__preview">
            {assetSrc ? (
              <>
                <video
                  key={current.id}
                  src={assetSrc}
                  className="film-node__media"
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
                  className="film-node__play nodrag nopan"
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
              <div className="film-node__empty">
                <Icon name="film" size={34} />
                <span>还没有成片</span>
              </div>
            )}

            {busy ? (
              <div className="film-node__progress">
                {filmStatus === 'rendering'
                  ? `渲染中 ${progress}%`
                  : `生成中 ${progress}%`}
              </div>
            ) : null}
          </div>

          <div className="film-node__bar">
            <span className="film-node__meta">
              {current
                ? `${current.width ?? '—'}×${current.height ?? '—'} · ${formatTimecode(
                    Math.round((current.duration ?? 0) * 1000)
                  )}`
                : '未生成'}
            </span>

            {outputs.length > 1 ? (
              <span className="film-node__versions nodrag nopan">
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

          <div className="film-node__actions nodrag nopan">
            <button
              type="button"
              className="film-node__btn"
              onClick={(event) => {
                event.stopPropagation()
                if (data.studioNodeId) openStudio(data.studioNodeId)
              }}
              disabled={!data.studioNodeId}
            >
              剪辑室
            </button>
            <button
              type="button"
              className="film-node__btn"
              title="导出字幕轨为 VTT"
              onClick={(event) => void exportSubtitles(event)}
              disabled={!data.studioNodeId}
            >
              VTT
            </button>
            <select
              className="film-node__codec nodrag nopan"
              title="导出编码"
              value={codec}
              disabled={busy}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) =>
                setCodec(event.target.value as TimelineVideoCodec)
              }
            >
              <option value="h264">H.264</option>
              <option value="hevc">HEVC</option>
              <option value="av1">AV1</option>
            </select>
            <button
              type="button"
              className="film-node__btn is-primary"
              onClick={(event) => void exportFilm(event)}
              disabled={filmStatus === 'empty' || filmStatus === 'missing'}
            >
              {busy
                ? '取消'
                : current
                  ? '重新生成'
                  : '生成成片'}
            </button>
          </div>
        </div>

        <Handle
          type="target"
          position={Position.Left}
          className="cnode__handle cnode__handle--left film-node__handle--passive"
          isConnectable={false}
          title="由剪辑室自动派生"
        />

        <Handle
          type="source"
          position={Position.Right}
          className="cnode__handle cnode__handle--right"
          title="作为素材接到其他节点"
        >
          <Icon name="plus" size={12} className="cnode__handle-icon" />
        </Handle>
      </div>

      {previewOpen && current ? createPortal(
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
      ) : null}
    </>
  )
}
