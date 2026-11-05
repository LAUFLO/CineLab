import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react'
import { NODE_META, TITLE_HEIGHT, type NodeKind } from '@shared/canvas-schema'
import { Icon, type IconName } from '../../components/Icon'
import { useCanvasStore, type CineNode } from '../../stores/canvas'
import { useGenerationStore } from '../../stores/generation'
import { useUIStore } from '../../stores/ui'
import { useLibraryStore } from '../../stores/library'
import { assetUrl } from '../../lib/asset-url'
import { NodeToolbar } from './NodeToolbar'

const NODE_ICON: Record<NodeKind, IconName> = {
  text: 'text',
  image: 'image',
  video: 'video',
  audio: 'audio'
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
  const cancelGeneration = useGenerationStore((state) => state.cancel)
  const openLibraryPicker = useLibraryStore((state) => state.openPicker)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(data.title)
  const [previewOpen, setPreviewOpen] = useState(false)

  const submitTitle = (): void => {
    const next = titleDraft.trim()
    setEditingTitle(false)
    if (next && next !== data.title) patchNodeData(id, { title: next })
  }

  const outputs = data.outputs ?? []
  const selectedIndex = outputs.findIndex((item) => item.id === data.selectedOutputId)
  const currentIndex = selectedIndex >= 0 ? selectedIndex : 0
  const current = outputs[currentIndex] ?? null

  const assetSrc = current ? assetUrl(current.path, current.scope) : data.outputUrl
  const isBusy = data.status === 'queued' || data.status === 'running'

  const shiftVersion = (delta: number): void => {
    const next = outputs[currentIndex + delta]
    if (next) {
      patchNodeData(id, { selectedOutputId: next.id })
      if (next.width && next.height) {
        resizeNode(id, Math.round((meta.width * next.height) / next.width) + TITLE_HEIGHT)
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
      {selected && !multiSelected && current && !isBusy ? (
        <NodeToolbar
          nodeId={id}
          kind={data.kind}
          current={current}
          onDownload={() => void exportCurrent()}
          onExpand={() => setPreviewOpen(true)}
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
        {data.status === 'done' ? <span className="cnode__badge">已完成</span> : null}
        {data.status === 'error' ? <span className="cnode__badge is-error">失败</span> : null}
      </div>

      <div className="cnode__card" style={{ minHeight: meta.height }}>
        <div className={`cnode__preview cnode__preview--${data.kind}`}>
          {assetSrc && current?.kind === 'text' ? (
            <p className="cnode__text">{data.text ?? '文本已生成'}</p>
          ) : assetSrc && current?.kind === 'audio' ? (
            <audio src={assetSrc} controls className="cnode__audio" />
          ) : assetSrc && (current?.kind === 'video' || data.kind === 'video') ? (
            <video src={assetSrc} className="cnode__media" muted playsInline controls />
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
            <p className="cnode__text">{data.text}</p>
          ) : null}

          {isBusy ? (
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

          {data.status === 'error' && data.error ? (
            <div className="cnode__error" title={data.error}>
              {data.error}
            </div>
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
        </div>
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
    {previewOpen && current?.kind === 'image'
      ? createPortal(
          <div
            className="image-preview"
            onPointerDown={() => setPreviewOpen(false)}
          >
            <img
              src={`cinelab-asset://local/${current.path}`}
              alt=""
              onPointerDown={(event) => event.stopPropagation()}
            />
          </div>,
          document.body
        )
      : null}
    </>
  )
}
