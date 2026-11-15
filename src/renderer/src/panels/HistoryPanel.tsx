import { useEffect, useMemo } from 'react'
import { useReactFlow } from '@xyflow/react'
import type { NodeKind, OutputRef } from '@shared/canvas-schema'
import type { GeneratedAsset } from '@shared/generation'
import { Icon } from '../components/Icon'
import { assetUrl } from '../lib/asset-url'
import { isGroupNode, nodeOutputs, useCanvasStore } from '../stores/canvas'
import { useGenerationStore } from '../stores/generation'
import {
  useGenerationHistoryStore,
  type GenerationHistoryEntry
} from '../stores/generation-history'
import { useLibraryStore } from '../stores/library'
import { useUIStore } from '../stores/ui'
import { Button, IconButton } from '../components/ui'

interface HistoryItem {
  key: string
  nodeId: string
  title: string
  output: OutputRef
}

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const ACTION_BAR = 'flex gap-0.5 opacity-0 group-hover:opacity-100'
const ACTION_BAR_STATIC = 'flex gap-0.5 opacity-100'
const ACTION_BUTTON =
  'h-7 w-7 !rounded-[7px] hover:!bg-surface hover:!text-fg'
const THUMB =
  'flex h-11 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[8px]'
const THUMB_ERROR =
  'bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-danger'
const ROW_SUB = 'mt-[3px] flex gap-2.5 text-[11px]'

function toAsset(output: OutputRef): GeneratedAsset {
  return {
    id: output.id,
    path: output.path,
    kind: output.kind,
    createdAt: output.createdAt,
    model: output.model,
    width: output.width,
    height: output.height,
    duration: output.duration,
    fps: output.fps,
    hasAudio: output.hasAudio
  }
}

export function HistoryPanel() {
  const open = useUIStore((state) => state.historyOpen)
  const close = useUIStore((state) => state.closeHistory)
  const showToast = useUIStore((state) => state.showToast)
  const nodes = useCanvasStore((state) => state.nodes)
  const addAssetNodes = useCanvasStore((state) => state.addAssetNodes)
  const { fitView } = useReactFlow()

  const items = useMemo<HistoryItem[]>(() => {
    return nodes
      .filter((node) => !isGroupNode(node))
      .flatMap((node) =>
        nodeOutputs(node).map((output) => ({
          key: `${node.id}:${output.id}`,
          nodeId: node.id,
          title: node.data.title,
          output
        }))
      )
      .sort((a, b) =>
        (b.output.createdAt ?? '').localeCompare(a.output.createdAt ?? '')
      )
  }, [nodes])

  const historyEntries = useGenerationHistoryStore((state) => state.entries)
  const removeHistory = useGenerationHistoryStore((state) => state.remove)
  const failures = useMemo(
    () =>
      historyEntries.filter(
        (entry) => entry.status === 'error' || entry.status === 'cancelled'
      ),
    [historyEntries]
  )

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, close])

  if (!open) return null

  const locate = (item: HistoryItem): void => {
    const node = nodes.find((entry) => entry.id === item.nodeId)
    if (!node) return
    void fitView({ nodes: [node], padding: 0.8, duration: 300, maxZoom: 1.5 })
    close()
  }

  const retry = (entry: GenerationHistoryEntry): void => {
    const exists = nodes.some(
      (node) => node.id === entry.nodeId && !isGroupNode(node)
    )
    if (!exists) {
      showToast('原节点已删除，无法重试', 'error')
      return
    }
    void useGenerationStore.getState().run(entry.request)
    close()
  }

  const addToCanvas = (item: HistoryItem): void => {
    const { viewport } = useCanvasStore.getState()
    const center = {
      x: (window.innerWidth / 2 - viewport.x) / viewport.zoom,
      y: (window.innerHeight / 2 - viewport.y) / viewport.zoom
    }
    const kind: NodeKind = item.output.kind
    addAssetNodes(kind, center, [toAsset(item.output)], item.title)
    showToast('已添加到画布')
    close()
  }

  const saveToLibrary = (item: HistoryItem): void => {
    useLibraryStore.getState().openPicker([
      {
        sourcePath: item.output.path,
        scope: item.output.scope ?? 'project',
        name: item.title
      }
    ])
  }

  const exportItem = async (item: HistoryItem): Promise<void> => {
    const result = await window.api.export.assets(
      [
        {
          path: item.output.path,
          scope: item.output.scope ?? 'project'
        }
      ],
      'CineLab-生成历史'
    )
    if (result.ok) {
      showToast(`已导出：${result.path ?? ''}`)
    } else if (!result.canceled) {
      showToast(result.error ?? '导出失败', 'error')
    }
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-overlay backdrop-blur-[2px] [-webkit-app-region:no-drag]"
      onPointerDown={close}
    >
      <div
        className="flex max-h-[min(680px,calc(100vh-96px))] w-[760px] max-w-[calc(100vw-48px)] flex-col overflow-hidden rounded-panel border border-border bg-surface shadow-menu"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="flex h-[54px] shrink-0 items-center gap-2.5 border-b border-divider pl-5 pr-3.5 text-[15px] font-semibold">
          <span>生成历史</span>
          <span className="mr-auto text-xs font-normal text-fg-subtle">
            {items.length + failures.length} 条
          </span>
          <IconButton
            label="关闭"
            size="sm"
            className="!h-[30px] !w-[30px]"
            onClick={close}
          >
            <Icon name="close" size={14} />
          </IconButton>
        </header>

        <div className="grid gap-1.5 overflow-y-auto p-2.5">
          {items.length === 0 && failures.length === 0 ? (
            <div className="px-3 py-8 text-center text-[13px] text-fg-subtle">
              还没有生成记录
            </div>
          ) : (
            <>
              {failures.map((entry) => (
                <div
                  key={`fail:${entry.nodeId}:${entry.createdAt}`}
                  className="flex items-center gap-3 rounded-[10px] px-2.5 py-2 hover:bg-surface-hover"
                >
                  <div className={`${THUMB} ${THUMB_ERROR}`}>
                    <Icon
                      name={entry.status === 'cancelled' ? 'stop' : 'close'}
                      size={18}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] text-fg">
                      {entry.title}
                    </div>
                    <div className={`${ROW_SUB} overflow-hidden text-danger`}>
                      <span className="truncate">
                        {entry.status === 'cancelled'
                          ? '已取消'
                          : (entry.error ?? '生成失败')}
                      </span>
                    </div>
                    <div className={`${ROW_SUB} text-fg-subtle`}>
                      <span>{formatTime(entry.createdAt)}</span>
                      {entry.retryable ? <span>可重试</span> : null}
                    </div>
                  </div>
                  <div className={ACTION_BAR_STATIC}>
                    {entry.status === 'error' ? (
                      <Button
                        type="button"
                        className="h-7 px-2 text-xs !rounded-[7px] !font-normal !text-fg hover:!bg-surface"
                        title="重试"
                        onClick={() => retry(entry)}
                        variant="ghost"
                        size="none"
                      >
                        重试
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      className={ACTION_BUTTON}
                      title="移除记录"
                      onClick={() => removeHistory(entry.nodeId)}
                      variant="ghost"
                      size="none"
                    >
                      <Icon name="trash" size={14} />
                    </Button>
                  </div>
                </div>
              ))}
              {items.map((item) => (
                <div
                  key={item.key}
                  className="group flex items-center gap-3 rounded-[10px] px-2.5 py-2 hover:bg-surface-hover"
                >
                  <div className={`${THUMB} bg-surface-hover text-fg-subtle`}>
                    {item.output.kind === 'image' ? (
                      <img
                        src={assetUrl(item.output.path, item.output.scope)}
                        alt={item.title}
                        className="h-full w-full object-cover"
                        draggable={false}
                      />
                    ) : (
                      <Icon
                        name={
                          item.output.kind === 'video'
                            ? 'video'
                            : item.output.kind === 'audio'
                              ? 'audio'
                              : 'text'
                        }
                        size={20}
                      />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] text-fg">
                      {item.title}
                    </div>
                    <div className={`${ROW_SUB} text-fg-subtle`}>
                      <span>{item.output.kind}</span>
                      <span>{item.output.model}</span>
                      <span>{formatTime(item.output.createdAt)}</span>
                    </div>
                  </div>

                  <div className={ACTION_BAR}>
                    <Button
                      type="button"
                      className={ACTION_BUTTON}
                      title="定位节点"
                      onClick={() => locate(item)}
                      variant="ghost"
                      size="none"
                    >
                      <Icon name="target" size={14} />
                    </Button>
                    <Button
                      type="button"
                      className={ACTION_BUTTON}
                      title="添加到画布"
                      onClick={() => addToCanvas(item)}
                      variant="ghost"
                      size="none"
                    >
                      <Icon name="plus" size={14} />
                    </Button>
                    <Button
                      type="button"
                      className={ACTION_BUTTON}
                      title="保存到资产库"
                      onClick={() => saveToLibrary(item)}
                      variant="ghost"
                      size="none"
                    >
                      <Icon name="folder" size={14} />
                    </Button>
                    <Button
                      type="button"
                      className={ACTION_BUTTON}
                      title="导出"
                      onClick={() => void exportItem(item)}
                      variant="ghost"
                      size="none"
                    >
                      <Icon name="download" size={14} />
                    </Button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
