import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react'
import { NODE_META, TITLE_HEIGHT, type NodeKind } from '@shared/canvas-schema'
import { Icon, type IconName } from '../../components/Icon'
import {
  nodeSize,
  useCanvasStore,
  type CineNode
} from '../../stores/canvas'
import { useGenerationStore } from '../../stores/generation'
import { useGenerationHistoryStore } from '../../stores/generation-history'
import { useUIStore } from '../../stores/ui'
import { useLibraryStore } from '../../stores/library'
import { useStudioStore } from '../../stores/studio'
import { TextEditorDialog } from './TextEditorDialog'
import { renderMarkdown } from './text-markdown'
import { createStudioFromNode } from '../../studio/nodes'
import { assetUrl } from '../../lib/asset-url'
import { AudioPlayer, timeLabel } from './AudioPlayer'
import { NodeToolbar } from './NodeToolbar'
import { PanoramaViewer } from './PanoramaViewer'
import { VideoPlayer } from './VideoPlayer'
import { StudyNodeCard } from './StudyNodeCard'

const NODE_ICON: Record<NodeKind, IconName> = {
  text: 'text',
  image: 'image',
  video: 'video',
  audio: 'audio',
  study: 'film'
}

export function CineNodeView({ id, data, selected }: NodeProps<CineNode>) {
  const meta = NODE_META[data.kind]
  const { screenToFlowPosition } = useReactFlow()
  const openMenu = useUIStore((state) => state.openMenu)
  const showToast = useUIStore((state) => state.showToast)
  const patchNodeData = useCanvasStore((state) => state.patchNodeData)
  const resizeNode = useCanvasStore((state) => state.resizeNode)
  const multiSelected = useCanvasStore(
    (state) => state.nodes.filter((node) => node.selected).length > 1
  )
  const storyboardIndex = useCanvasStore((state) => {
    const self = state.nodes.find((node) => node.id === id)
    const parent = self?.parentId
      ? state.nodes.find((node) => node.id === self.parentId)
      : undefined
    if (!parent || parent.type !== 'group') return 0
    if (parent.data.mode !== 'storyboard' || parent.data.showIndex === false) {
      return 0
    }
    const siblings = state.nodes.filter(
      (node) => node.parentId === parent.id
    )
    return siblings.findIndex((node) => node.id === id) + 1
  })
  const cancelGeneration = useGenerationStore((state) => state.cancel)
  const openLibraryPicker = useLibraryStore((state) => state.openPicker)
  const nodeWidth = useCanvasStore((state) => {
    const found = state.nodes.find((entry) => entry.id === id)
    return found ? nodeSize(found).width : meta.width
  })
  const toolbarAlign = 'center' as const
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(data.title)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [panoramaOpen, setPanoramaOpen] = useState(false)
  const [textEditorOpen, setTextEditorOpen] = useState(false)
  const [previewRatio, setPreviewRatio] = useState<number | null>(null)

  const submitTitle = (): void => {
    const next = titleDraft.trim()
    setEditingTitle(false)
    if (next && next !== data.title) patchNodeData(id, { title: next })
  }

  const openTextEditor = (event: React.MouseEvent): void => {
    event.stopPropagation()
    setTextEditorOpen(true)
  }

  const saveText = (text: string): void => {
    patchNodeData(id, { text, status: 'done' })
    setTextEditorOpen(false)
  }

  const retryGeneration = (): void => {
    const entry = useGenerationHistoryStore
      .getState()
      .entries.find((item) => item.nodeId === id)
    if (!entry) {
      showToast('找不到上次生成参数，请在提示词栏重新生成', 'error')
      return
    }
    patchNodeData(id, { status: 'queued', progress: 0, error: undefined })
    void useGenerationStore.getState().run(entry.request)
  }

  const outputs = data.outputs ?? []
  const selectedIndex = outputs.findIndex((item) => item.id === data.selectedOutputId)
  const currentIndex = selectedIndex >= 0 ? selectedIndex : 0
  const current = outputs[currentIndex] ?? null

  const assetSrc = current ? assetUrl(current.path, current.scope) : data.outputUrl
  const isBusy = data.status === 'queued' || data.status === 'running'
  const canPanorama = Boolean(
    current &&
      current.kind === 'image' &&
      (current.op === 'panorama' ||
        (previewRatio !== null && previewRatio >= 1.8))
  )

  const shiftVersion = (delta: number): void => {
    const next = outputs[currentIndex + delta]
    if (next) {
      patchNodeData(id, { selectedOutputId: next.id })
      if (next.width && next.height) {
        resizeNode(id, Math.round((nodeWidth * next.height) / next.width) + TITLE_HEIGHT)
      }
    }
  }

  const exportCurrent = async (): Promise<void> => {
    if (!current) return
    const result = await window.api.export.asset(current.path, data.title)
    if (result.ok) {
      showToast(`已导出：${result.path ?? ''}`)
    } else if (!result.canceled) {
      showToast(result.error ?? '导出失败', 'error')
    }
  }

  const openFromHandle = (event: React.MouseEvent): void => {
    event.stopPropagation()
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }

    openMenu({
      screen: { x: rect.right + 10, y: rect.top - 6 },
      flow: screenToFlowPosition(center),
      source: { nodeId: id, handle: 'source' }
    })
  }

  const createStudio = (event: React.MouseEvent): void => {
    event.stopPropagation()
    const studioId = createStudioFromNode(id)
    if (studioId) useStudioStore.getState().openStudio(studioId)
  }

  useEffect(() => {
    if (!previewOpen) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setPreviewOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [previewOpen])

  return (
    <>
    <div className={`cnode ${selected ? 'is-selected' : ''}`}>
      {selected && !multiSelected && current && !isBusy && data.kind !== 'study' ? (
        <NodeToolbar
          nodeId={id}
          kind={data.kind}
          current={current}
          align={toolbarAlign}
          onDownload={() => void exportCurrent()}
          onExpand={() => {
            if (data.kind === 'text') setTextEditorOpen(true)
            else setPreviewOpen(true)
          }}
          onEdit={
            data.kind === 'text'
              ? () => setTextEditorOpen(true)
              : undefined
          }
          libraryAction={
            current.kind !== 'text'
              ? {
                  label: current.scope === 'global' ? '已入库' : '入库',
                  title:
                    current.scope === 'global'
                      ? '已在资产库，点击再存一份'
                      : '添加到资产库',
                  onClick: () =>
                    openLibraryPicker([
                      {
                        sourcePath: current.path,
                        scope: current.scope ?? 'project',
                        name: data.title
                      }
                    ])
                }
              : undefined
          }
        />      ) : null}

      {selected && !multiSelected && !current && !isBusy ? (
        <div className="cnode__toolbar cnode__toolbar--minimal nodrag nopan">
          {data.kind === 'text' ? (
            <button
              type="button"
              className="cnode__toolbar-btn"
              title="编辑文本（支持 Markdown）"
              onClick={(event) => {
                event.stopPropagation()
                setTextEditorOpen(true)
              }}
            >
              <Icon name="edit" size={14} />
              <span>编辑</span>
            </button>
          ) : null}
          <button
            type="button"
            className="cnode__toolbar-btn"
            title="用当前节点创建剪辑室"
            onClick={createStudio}
          >
            <Icon name="film" size={14} />
            <span>剪辑室</span>
          </button>
        </div>
      ) : null}

      <div
        className="cnode__title"
        onDoubleClick={(event) => {
          event.stopPropagation()
          setTitleDraft(data.title)
          setEditingTitle(true)
        }}
      >
        <Icon name={NODE_ICON[data.kind]} size={12} />
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
        {data.kind === 'audio' ? (
          current?.duration ? (
            <span className="cnode__title-time">
              {timeLabel(current.duration, false)}
            </span>
          ) : null
        ) : data.status === 'done' ? (
          <span className="cnode__badge">已完成</span>
        ) : null}
        {data.status === 'error' ? <span className="cnode__badge is-error">失败</span> : null}
      </div>

      <div className="cnode__card">
        <div className={`cnode__preview cnode__preview--${data.kind}`}>
          {data.kind === 'study' ? (
            <StudyNodeCard nodeId={id} data={data} />
          ) : (
            <>
          {data.kind === 'audio' ? (
            <AudioPlayer
              src={assetSrc ?? null}
              path={current?.path}
              scope={current?.scope}
              busy={isBusy}
              onCancel={() => void cancelGeneration(id)}
            />
          ) : assetSrc && current?.kind === 'text' ? (
            <div
              className="cnode__text cnode__text--markdown"
              onDoubleClick={openTextEditor}
              dangerouslySetInnerHTML={{
                __html: renderMarkdown(data.text ?? '文本已生成')
              }}
            />
          ) : assetSrc && (current?.kind === 'video' || data.kind === 'video') ? (
            <VideoPlayer
              src={assetSrc}
              path={current?.path}
              fps={current?.fps}
            />
          ) : assetSrc ? (
            <img src={assetSrc} alt="" className="cnode__media" loading="lazy" />
          ) : (
            <Icon
              name={NODE_ICON[data.kind]}
              size={data.kind === 'text' ? 44 : 40}
              className="cnode__placeholder"
            />
          )}

          {!assetSrc && data.kind === 'text' && data.text ? (
            <div
              className="cnode__text cnode__text--markdown"
              onDoubleClick={openTextEditor}
              dangerouslySetInnerHTML={{
                __html: renderMarkdown(data.text)
              }}
            />
          ) : null}

          {isBusy && data.kind !== 'audio' ? (
            <div className="cnode__generating">
              <div className="cnode__generating-pill">
                {data.status === 'queued' ? '排队中…' : '生成中…'}
              </div>
              <button
                type="button"
                className="cnode__cancel nodrag nopan"
                onClick={(event) => {
                  event.stopPropagation()
                  void cancelGeneration(id)
                }}
              >
                取消任务
              </button>
            </div>
          ) : null}

          {data.status === 'error' ? (
            <div className="cnode__error" title={data.error}>
              <span className="cnode__error-text">
                {data.error ?? '生成失败'}
              </span>
              <button
                type="button"
                className="cnode__retry nodrag nopan"
                onClick={(event) => {
                  event.stopPropagation()
                  retryGeneration()
                }}
              >
                重新生成
              </button>
            </div>
          ) : null}

          {data.kind === 'text' && !isBusy ? (
            <button
              type="button"
              className="cnode__text-edit nodrag nopan"
              title="编辑文本（支持 Markdown）"
              onClick={openTextEditor}
            >
              <Icon name="edit" size={12} />
              编辑
            </button>
          ) : null}

          {outputs.length > 1 && !isBusy ? (
            <div className="cnode__versions nodrag nopan">
              <button
                type="button"
                className="cnode__version-btn"
                title="更早的版本"
                disabled={currentIndex >= outputs.length - 1}
                onClick={() => shiftVersion(1)}
              >
                <Icon name="chevron-left" size={11} />
              </button>
              <span className="cnode__version-label">
                {outputs.length - currentIndex}/{outputs.length}
              </span>
              <button
                type="button"
                className="cnode__version-btn"
                title="更新的版本"
                disabled={currentIndex <= 0}
                onClick={() => shiftVersion(-1)}
              >
                <Icon name="chevron-right" size={11} />
              </button>
            </div>
          ) : null}
            </>
          )}
        </div>

        {storyboardIndex > 0 ? (
          <span className="cnode__index">
            {String(storyboardIndex).padStart(2, '0')}
          </span>
        ) : null}
      </div>

      <Handle
        type="target"
        position={Position.Left}
        className="cnode__handle cnode__handle--left"
        title="接收上游连线"
      >
        <Icon name="plus" size={12} className="cnode__handle-icon" />
      </Handle>

      <Handle
        type="source"
        position={Position.Right}
        className="cnode__handle cnode__handle--right"
        title="生成下游节点"
        onClick={openFromHandle}
      >
        <Icon name="plus" size={12} className="cnode__handle-icon" />
      </Handle>
    </div>
    <TextEditorDialog
      open={textEditorOpen}
      title={data.title}
      initialText={data.text ?? ''}
      onClose={() => setTextEditorOpen(false)}
      onSave={saveText}
    />
    {previewOpen &&
    current &&
    (current.kind === 'image' || current.kind === 'video')
      ? createPortal(
          <div
            className="image-preview"
            onPointerDown={() => setPreviewOpen(false)}
          >
            {canPanorama ? (
              <button
                type="button"
                className="image-preview__panorama"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => {
                  setPreviewOpen(false)
                  setPanoramaOpen(true)
                }}
              >
                全景查看
              </button>
            ) : null}
            {current.kind === 'image' ? (
              <img
                src={assetUrl(current.path, current.scope)}
                alt=""
                onLoad={(event) => {
                  const image = event.currentTarget
                  setPreviewRatio(
                    image.naturalHeight > 0
                      ? image.naturalWidth / image.naturalHeight
                      : null
                  )
                }}
                onPointerDown={(event) => event.stopPropagation()}
              />
            ) : (
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
            )}
          </div>,
          document.body
        )
      : null}

      <PanoramaViewer
        open={panoramaOpen && Boolean(current)}
        src={current ? assetUrl(current.path, current.scope) : ''}
        onClose={() => setPanoramaOpen(false)}
      />
    </>
  )
}
