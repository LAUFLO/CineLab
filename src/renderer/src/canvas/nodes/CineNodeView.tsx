import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Handle,
  Position,
  useReactFlow,
  useViewport,
  type NodeProps
} from '@xyflow/react'
import {
  NODE_META,
  TITLE_HEIGHT,
  mediaFrameNodeSize,
  mediaFramePixels,
  type NodeKind,
  type OutputRef
} from '@shared/canvas-schema'
import { Icon, type IconName } from '../../components/Icon'
import {
  absolutePosition,
  nodeSize,
  useCanvasStore,
  type CineNode
} from '../../stores/canvas'
import { useGenerationStore } from '../../stores/generation'
import { useGenerationHistoryStore } from '../../stores/generation-history'
import {
  cancelStemTaskFromNode,
  retryStemTask
} from '../../stores/stem-tasks'
import { useUIStore } from '../../stores/ui'
import { useLibraryStore } from '../../stores/library'
import { useStudioStore } from '../../stores/studio'
import { useSettingsStore } from '../../stores/settings'
import { TextEditorDialog } from './TextEditorDialog'
import { MARKDOWN_CLASS, renderMarkdown } from './text-markdown'
import { createStudioFromNode } from '../../studio/nodes'
import { assetUrl } from '../../lib/asset-url'
import { AudioPlayer, timeLabel } from './AudioPlayer'
import { AudioActionBar, type AudioActionMode } from './AudioActionBar'
import { NodeToolbar } from './NodeToolbar'
import { PanoramaViewer } from './PanoramaViewer'
import { VideoPlayer } from './VideoPlayer'
import { VideoPreview } from './VideoPreview'
import { StudyNodeCard } from './StudyNodeCard'
import { Button, Dialog, Input } from '../../components/ui'

const NODE_ICON: Record<NodeKind, IconName> = {
  text: 'text',
  image: 'image',
  video: 'video',
  audio: 'audio',
  study: 'film'
}

const VERSION_BTN_CLASS =
  '!h-5 !w-5 shrink-0 !rounded-md !p-0 !text-fg-muted enabled:hover:!bg-surface-hover enabled:hover:!text-fg disabled:!cursor-default disabled:!opacity-25'

export function CineNodeView({ id, data, selected }: NodeProps<CineNode>) {
  const meta = NODE_META[data.kind]
  const { screenToFlowPosition, fitView } = useReactFlow()
  const openMenu = useUIStore((state) => state.openMenu)
  const showToast = useUIStore((state) => state.showToast)
  const patchNodeData = useCanvasStore((state) => state.patchNodeData)
  const applyOutput = useCanvasStore((state) => state.applyOutput)
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
    const siblings = state.nodes.filter((node) => node.parentId === parent.id)
    return siblings.findIndex((node) => node.id === id) + 1
  })
  const cancelGeneration = useGenerationStore((state) => state.cancel)
  const openLibraryPicker = useLibraryStore((state) => state.openPicker)
  const allNodes = useCanvasStore((state) => state.nodes)
  const currentNode = allNodes.find((entry) => entry.id === id)
  const nodeWidth = currentNode ? nodeSize(currentNode).width : meta.width
  const nodeHeight = currentNode
    ? nodeSize(currentNode).height
    : meta.height + TITLE_HEIGHT
  const absolute = currentNode ? absolutePosition(currentNode, allNodes) : null
  const viewport = useViewport()
  const audioAnchor = absolute
    ? {
        left: absolute.x * viewport.zoom + viewport.x,
        top: absolute.y * viewport.zoom + viewport.y,
        width: nodeWidth * viewport.zoom,
        height: nodeHeight * viewport.zoom
      }
    : null
  const toolbarAlign = 'center' as const
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(data.title)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [panoramaOpen, setPanoramaOpen] = useState(false)
  const [ocrOpen, setOcrOpen] = useState(false)
  const textEditorOpen = useUIStore((state) => state.textEditorNodeId === id)
  const closeTextEditor = useUIStore((state) => state.closeTextEditor)
  const [previewRatio, setPreviewRatio] = useState<number | null>(null)
  const [audioMode, setAudioMode] = useState<AudioActionMode | null>(null)
  const [audioSelection, setAudioSelection] = useState({ start: 0, end: 0 })
  const [audioRate, setAudioRate] = useState(1)
  const [audioBusy, setAudioBusy] = useState(false)

  const submitTitle = (): void => {
    const next = titleDraft.trim()
    setEditingTitle(false)
    if (next && next !== data.title) patchNodeData(id, { title: next })
  }

  const openTextEditor = (event?: React.MouseEvent): void => {
    event?.stopPropagation()
    useUIStore.getState().openTextEditor(id)
  }

  const saveText = (text: string): void => {
    useCanvasStore
      .getState()
      .applyCommands([{ type: 'updateText', nodeId: id, text }])
    patchNodeData(id, { status: 'done' })
    closeTextEditor()
  }

  const uploadPlaceholderAsset = (): void => {
    const kind = data.kind
    if (kind !== 'image' && kind !== 'video' && kind !== 'audio') {
      showToast('这个节点不支持上传素材', 'error')
      return
    }

    const input = document.createElement('input')
    input.type = 'file'
    input.accept =
      kind === 'image' ? 'image/*' : kind === 'video' ? 'video/*' : 'audio/*'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      void (async () => {
        try {
          const asset = await window.api.scene.uploadAsset({
            kind,
            mime:
              file.type ||
              (kind === 'image'
                ? 'image/png'
                : kind === 'video'
                  ? 'video/mp4'
                  : 'audio/mpeg'),
            data: await file.arrayBuffer()
          })
          const output = {
            id: asset.id,
            path: asset.path,
            kind: asset.kind,
            createdAt: asset.createdAt,
            model: asset.model,
            width: asset.width,
            height: asset.height,
            duration: asset.duration,
            fps: asset.fps,
            hasAudio: asset.hasAudio
          }
          patchNodeData(id, {
            status: 'done',
            assetOnly: true,
            outputs: [output],
            selectedOutputId: output.id,
            workflowSlot: undefined
          })
          useUIStore.getState().requestFitView()
          showToast('素材已上传')
        } catch (error) {
          showToast(
            error instanceof Error ? error.message : String(error),
            'error'
          )
        }
      })()
    }
    input.click()
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
  const selectedIndex = outputs.findIndex(
    (item) => item.id === data.selectedOutputId
  )
  const currentIndex = selectedIndex >= 0 ? selectedIndex : 0
  const current = outputs[currentIndex] ?? null

  const assetSrc = current
    ? assetUrl(current.path, current.scope)
    : data.outputUrl
  const isBusy = data.status === 'queued' || data.status === 'running'
  const stemMode =
    data.stemMode === 'vocal' || data.stemMode === 'background'
      ? data.stemMode
      : null
  const stemProgress =
    typeof data.progress === 'number' ? Math.round(data.progress) : null
  const busyLabel =
    data.status === 'queued'
      ? `排队中${
          typeof data.stemQueuePosition === 'number'
            ? ` · 第 ${data.stemQueuePosition} 位`
            : '…'
        }`
      : stemMode
        ? `分离中${stemProgress !== null ? ` ${stemProgress}%` : '…'}`
        : null
  const cancelBusy = (): void => {
    if (cancelStemTaskFromNode(id)) return
    void cancelGeneration(id)
  }
  const canPanorama = Boolean(
    current &&
    current.kind === 'image' &&
    (current.op === 'panorama' ||
      (previewRatio !== null && previewRatio >= 1.8))
  )

  const selectOutput = (output: OutputRef): void => {
    patchNodeData(id, { selectedOutputId: output.id })
    if (
      (data.kind === 'image' || data.kind === 'video') &&
      output.width &&
      output.height
    ) {
      const frame = data.mediaFrame ?? 'standard'
      const size = mediaFrameNodeSize(
        output.width,
        output.height,
        mediaFramePixels(frame)
      )
      resizeNode(id, size.height, size.width)
      if (currentNode?.parentId) {
        useCanvasStore.getState().syncGroupBounds(currentNode.parentId)
      }
    }
  }

  const shiftVersion = (delta: number): void => {
    const next = outputs[currentIndex + delta]
    if (next) selectOutput(next)
  }

  const exportCurrent = async (): Promise<void> => {
    if (!current) return
    const result = await window.api.export.asset(
      current.path,
      data.title,
      current.scope
    )
    if (result.ok) {
      showToast(`已导出：${result.path ?? ''}`)
    } else if (!result.canceled) {
      showToast(result.error ?? '导出失败', 'error')
    }
  }

  const openAudioTrim = (): void => {
    if (!current) return
    const duration = current.duration ?? 0
    if (!duration) {
      showToast('无法读取音频时长', 'error')
      return
    }
    setAudioSelection({ start: 0, end: duration })
    setAudioRate(1)
    setAudioBusy(false)
    setAudioMode('trim')
  }

  const openAudioSpeed = (): void => {
    if (!current) return
    setAudioRate(1)
    setAudioBusy(false)
    setAudioMode('speed')
  }

  const submitAudio = async (): Promise<void> => {
    if (!current || !audioMode || audioBusy || !absolute) return

    if (
      audioMode === 'trim' &&
      audioSelection.end - audioSelection.start < 0.1
    ) {
      showToast('截取区间太短', 'error')
      return
    }

    const label =
      audioMode === 'trim' ? '截取' : `变速 ${audioRate.toFixed(2)}x`
    const targetId = useCanvasStore
      .getState()
      .addPendingNodes(
        'audio',
        { x: absolute.x + nodeWidth + 48, y: absolute.y },
        1,
        `${data.title} · ${label}`,
        id
      )[0]

    setAudioBusy(true)

    try {
      if (audioMode === 'trim') {
        const { asset } = await window.api.media.trimAudio({
          path: current.path,
          ...(current.scope ? { scope: current.scope } : {}),
          start: audioSelection.start,
          end: audioSelection.end
        })
        applyOutput(targetId, asset, 'audio-trim')
        showToast(
          `已截取 ${timeLabel(audioSelection.end - audioSelection.start)} 音频`
        )
      } else {
        const { asset } = await window.api.media.audioSpeed({
          path: current.path,
          ...(current.scope ? { scope: current.scope } : {}),
          rate: audioRate
        })
        applyOutput(targetId, asset, 'audio-speed')
        showToast(`已变速 ${audioRate.toFixed(2)}x`)
      }
      setAudioMode(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      patchNodeData(targetId, { status: 'error', error: message })
      showToast(message, 'error')
    } finally {
      setAudioBusy(false)
    }
  }

  const openFromHandle = (event: React.MouseEvent): void => {
    event.stopPropagation()
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const center = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    }

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
    if (!selected) setAudioMode(null)
  }, [selected])

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
      <div
        data-cnode
        data-selected={selected || undefined}
        className="group relative flex h-full w-full flex-col"
        onDoubleClick={(event) => {
          const target = event.target as HTMLElement
          if (target.closest('button, input, textarea, a')) return
          event.stopPropagation()
          void fitView({
            nodes: currentNode ? [currentNode] : [{ id }],
            padding: '19%',
            duration: 300,
            maxZoom: 2
          })
        }}
      >
        {selected &&
        !multiSelected &&
        current &&
        !isBusy &&
        data.kind !== 'study' ? (
          <NodeToolbar
            nodeId={id}
            kind={data.kind}
            current={current}
            align={toolbarAlign}
            onDownload={() => void exportCurrent()}
            onExpand={() => {
              if (data.kind === 'text') openTextEditor()
              else setPreviewOpen(true)
            }}
            onEdit={data.kind === 'text' ? () => openTextEditor() : undefined}
            onAudioTrim={data.kind === 'audio' ? openAudioTrim : undefined}
            onAudioSpeed={data.kind === 'audio' ? openAudioSpeed : undefined}
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
          />
        ) : null}

        {selected && !multiSelected && !current && !isBusy ? (
          <div className="nodrag nopan absolute bottom-[calc(100%+var(--node-toolbar-offset,10px))] left-1/2 z-10 flex h-9 items-center gap-px rounded-card border border-border bg-surface px-1.5 text-fg whitespace-nowrap shadow-float [translate:-50%_0] [transform:scale(var(--canvas-zoom-inverse,1))] [transform-origin:bottom_center]">
            {data.kind === 'text' ? (
              <Button
                type="button"
                variant="ghost"
                size="none"
                className="!h-7 gap-[3px] !rounded-md !px-[5px] !text-xs !font-normal"
                title="编辑文本（支持 Markdown）"
                onClick={(event) => {
                  event.stopPropagation()
                  openTextEditor()
                }}
              >
                <Icon name="edit" size={14} />
                <span>编辑</span>
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="none"
              className="!h-7 gap-[3px] !rounded-md !px-[5px] !text-xs !font-normal"
              title="用当前节点创建剪辑室"
              onClick={createStudio}
            >
              <Icon name="film" size={14} />
              <span>剪辑室</span>
            </Button>
          </div>
        ) : null}

        <div
          className="flex h-7 shrink-0 items-center gap-[5px] overflow-hidden pl-1 text-xs whitespace-nowrap text-fg-muted group-data-[selected]:text-fg"
          onDoubleClick={(event) => {
            event.stopPropagation()
            setTitleDraft(data.title)
            setEditingTitle(true)
          }}
        >
          <Icon name={NODE_ICON[data.kind]} size={12} />
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
            <span className="min-w-0 truncate">{data.title}</span>
          )}
          {data.kind !== 'audio' && data.status === 'done' ? (
            <span className="ml-1.5 shrink-0 text-[10px] text-success">
              已完成
            </span>
          ) : null}
          {data.status === 'error' ? (
            <span className="ml-1.5 shrink-0 text-[10px] text-danger">
              失败
            </span>
          ) : null}
          <div className="ml-auto flex shrink-0 items-center gap-1 pl-1">
            {data.kind === 'audio' && current?.duration ? (
              <span className="pr-0.5 text-[11px] tabular-nums text-fg-subtle">
                {timeLabel(current.duration, false)}
              </span>
            ) : null}
            {outputs.length > 1 && !isBusy ? (
              <div
                className="nodrag nopan flex items-center gap-0.5"
                onDoubleClick={(event) => event.stopPropagation()}
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="none"
                  className={VERSION_BTN_CLASS}
                  title="更早的版本"
                  disabled={currentIndex >= outputs.length - 1}
                  onClick={() => shiftVersion(1)}
                >
                  <Icon name="chevron-left" size={11} />
                </Button>
                <span className="min-w-[24px] text-center text-[11px] leading-none tabular-nums text-fg-subtle">
                  {outputs.length - currentIndex}/{outputs.length}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="none"
                  className={VERSION_BTN_CLASS}
                  title="更新的版本"
                  disabled={currentIndex <= 0}
                  onClick={() => shiftVersion(-1)}
                >
                  <Icon name="chevron-right" size={11} />
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        <div
          data-node-card
          className={`relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-card bg-surface-raised shadow-node transition-colors duration-[120ms] ${
            selected
              ? 'border-2 border-border-selected'
              : 'border border-border group-hover:border-border-strong'
          }`}
        >
          <div
            className={`relative flex min-h-0 flex-1 overflow-hidden ${
              data.kind === 'study' || data.kind === 'audio'
                ? 'items-stretch justify-start'
                : 'items-center justify-center'
            } ${data.kind === 'study' ? 'px-[10px] pt-2 pb-[10px]' : ''}`}
          >
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
                    busyProgress={stemMode ? stemProgress : null}
                    busyLabel={busyLabel ?? undefined}
                    onCancel={cancelBusy}
                    selecting={audioMode === 'trim'}
                    selection={audioMode === 'trim' ? audioSelection : null}
                    onSelect={(start, end) => setAudioSelection({ start, end })}
                  />
                ) : assetSrc && current?.kind === 'text' ? (
                  <div
                    className={MARKDOWN_CLASS}
                    dangerouslySetInnerHTML={{
                      __html: renderMarkdown(data.text ?? '文本已生成')
                    }}
                  />
                ) : assetSrc &&
                  (current?.kind === 'video' || data.kind === 'video') ? (
                  <VideoPreview
                    src={assetSrc}
                    path={current?.path}
                    fps={current?.fps}
                    nodeWidth={nodeWidth}
                  />
                ) : assetSrc ? (
                  <img
                    src={assetSrc}
                    alt=""
                    className="h-full w-full object-contain"
                    loading="lazy"
                  />
                ) : data.workflowSlot === 'upload' ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="none"
                    className="nodrag nopan flex flex-col items-center gap-2 rounded-md border border-dashed border-border-strong px-4 py-3 !text-[11px] !font-normal text-fg-subtle transition-colors hover:border-link hover:text-fg"
                    onClick={(event) => {
                      event.stopPropagation()
                      uploadPlaceholderAsset()
                    }}
                  >
                    <Icon name="plus" size={20} />
                    <span>点击上传素材</span>
                  </Button>
                ) : data.workflowSlot === 'generate' ? (
                  <div className="flex flex-col items-center gap-1.5 text-[11px] text-fg-subtle">
                    <Icon name="image" size={28} />
                    <span>待生成</span>
                  </div>
                ) : data.kind === 'text' && data.text ? null : (
                  <Icon
                    name={NODE_ICON[data.kind]}
                    size={data.kind === 'text' ? 44 : 40}
                    className="shrink-0 text-fg-subtle"
                  />
                )}

                {!assetSrc && data.kind === 'text' && data.text ? (
                  <div
                    className={MARKDOWN_CLASS}
                    dangerouslySetInnerHTML={{
                      __html: renderMarkdown(data.text)
                    }}
                  />
                ) : null}

                {current?.layer ? (
                  <span className="nodrag nopan pointer-events-none absolute top-2 left-2 z-[4] max-w-[calc(100%-16px)] truncate rounded-pill bg-black/[0.46] px-2 py-0.5 text-[10px] leading-4 whitespace-nowrap text-white backdrop-blur-[4px]">
                    {current.layer.zIndex === 0
                      ? '底图'
                      : current.layer.name?.trim() ||
                        `图层 ${current.layer.zIndex}`}
                  </span>
                ) : null}

                {current?.textRecognition?.text ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="none"
                    className="nodrag nopan !absolute top-2 right-2 z-[5] !h-[22px] !rounded-pill !bg-black/[0.46] !px-2 !text-[10px] !font-normal !tracking-[0.04em] !text-white backdrop-blur-[4px] hover:!bg-black/[0.62] hover:!text-white"
                    title="查看文字识别结果"
                    onClick={(event) => {
                      event.stopPropagation()
                      setOcrOpen(true)
                    }}
                  >
                    OCR
                  </Button>
                ) : null}

                {isBusy && data.kind !== 'audio' ? (
                  <div className="absolute inset-0 z-[2] flex flex-col items-center justify-center bg-surface-raised">
                    <div className="rounded-card border border-border bg-canvas px-3.5 py-2 text-xs text-fg">
                      {busyLabel ?? '生成中…'}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="none"
                      className="nodrag nopan absolute bottom-3.5 left-1/2 -translate-x-1/2 !text-[11px] !font-normal !text-fg-subtle hover:!bg-transparent hover:!text-fg"
                      onClick={(event) => {
                        event.stopPropagation()
                        cancelBusy()
                      }}
                    >
                      取消任务
                    </Button>
                  </div>
                ) : null}

                {data.status === 'error' ? (
                  <div
                    className="absolute inset-x-2 bottom-2 flex max-h-[52px] items-center gap-2 overflow-hidden rounded-md bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] px-2 py-1.5 text-[11px] leading-[1.5] text-danger"
                    title={data.error}
                  >
                    <span className="line-clamp-2 min-w-0 flex-1">
                      {data.error ?? '生成失败'}
                    </span>
                    {stemMode ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="none"
                        className="nodrag nopan !h-6 shrink-0 !rounded-md !border !border-[color-mix(in_srgb,var(--danger)_45%,transparent)] !bg-transparent !px-2 !text-[11px] !font-normal !text-danger hover:!bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] hover:!text-danger"
                        onClick={(event) => {
                          event.stopPropagation()
                          useSettingsStore.getState().openPanel('components')
                        }}
                      >
                        检查组件
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="none"
                        className="nodrag nopan !h-6 shrink-0 !rounded-md !border !border-[color-mix(in_srgb,var(--danger)_45%,transparent)] !bg-transparent !px-2 !text-[11px] !font-normal !text-danger hover:!bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] hover:!text-danger"
                        onClick={(event) => {
                          event.stopPropagation()
                          useSettingsStore.getState().openPanel('models')
                        }}
                      >
                        检查模型配置
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="none"
                      className="nodrag nopan !h-6 shrink-0 !rounded-md !border !border-[color-mix(in_srgb,var(--danger)_45%,transparent)] !bg-transparent !px-2 !text-[11px] !font-normal !text-danger hover:!bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] hover:!text-danger"
                      onClick={(event) => {
                        event.stopPropagation()
                        if (stemMode) void retryStemTask(id)
                        else retryGeneration()
                      }}
                    >
                      {stemMode ? '重试分离' : '重新生成'}
                    </Button>
                  </div>
                ) : null}

              </>
            )}
          </div>

          {storyboardIndex > 0 ? (
            <span className="pointer-events-none absolute bottom-2.5 left-2.5 z-[2] text-xl leading-none font-semibold text-white/[0.92] [text-shadow:0_1px_4px_rgba(0,0,0,0.55)]">
              {String(storyboardIndex).padStart(2, '0')}
            </span>
          ) : null}
        </div>

        {data.kind === 'audio' && audioMode && selected ? (
          <AudioActionBar
            mode={audioMode}
            duration={current?.duration ?? 0}
            selection={audioSelection}
            rate={audioRate}
            busy={audioBusy}
            anchor={audioAnchor}
            onSelectionChange={(start, end) =>
              setAudioSelection({ start, end })
            }
            onRateChange={setAudioRate}
            onClose={() => setAudioMode(null)}
            onSubmit={() => void submitAudio()}
          />
        ) : null}

        <Handle
          type="target"
          position={Position.Left}
          data-handle="left"
          title="接收上游连线"
        >
          <Icon name="plus" size={12} />
        </Handle>

        <Handle
          type="source"
          position={Position.Right}
          data-handle="right"
          title="生成下游节点"
          onClick={openFromHandle}
        >
          <Icon name="plus" size={12} />
        </Handle>
      </div>
      <TextEditorDialog
        open={textEditorOpen}
        title={data.title}
        initialText={data.text ?? ''}
        onClose={closeTextEditor}
        onSave={saveText}
      />
      <Dialog
        open={ocrOpen}
        onClose={() => setOcrOpen(false)}
        title="文字识别结果"
        size="md"
      >
        <div className="max-h-[50vh] overflow-y-auto text-[13px] leading-[1.8] break-words whitespace-pre-wrap text-fg">
          {current?.textRecognition?.text ?? ''}
        </div>
      </Dialog>
      {previewOpen &&
      current &&
      (current.kind === 'image' || current.kind === 'video')
        ? createPortal(
            <div
              className="fixed inset-0 z-[250] flex items-center justify-center bg-overlay p-12 [&_img]:max-h-full [&_img]:max-w-full [&_img]:rounded-card [&_img]:object-contain [&_img]:shadow-float [&_video]:max-h-full [&_video]:max-w-full [&_video]:rounded-card [&_video]:object-contain [&_video]:shadow-float"
              onPointerDown={() => setPreviewOpen(false)}
            >
              {canPanorama ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="none"
                  className="absolute top-5 right-5 z-[2] !h-[34px] !rounded-md !border !border-white/24 !bg-black/55 !px-3.5 !text-xs !font-normal !text-white backdrop-blur-[8px] hover:!bg-black/[0.72] hover:!text-white"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => {
                    setPreviewOpen(false)
                    setPanoramaOpen(true)
                  }}
                >
                  全景查看
                </Button>
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
                  className="aspect-video max-h-[calc(100vh-96px)] w-[min(1280px,calc(100vw-96px))] overflow-hidden rounded-card bg-media-bg shadow-float"
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
