import { useEffect, useMemo } from 'react'
import { useReactFlow } from '@xyflow/react'
import type { NodeKind, OutputRef } from '@shared/canvas-schema'
import type { GeneratedAsset } from '@shared/generation'
import { Icon } from '../components/Icon'
import { assetUrl } from '../lib/asset-url'
import { isGroupNode, useCanvasStore } from '../stores/canvas'
import { useLibraryStore } from '../stores/library'
import { useUIStore } from '../stores/ui'

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
        (node.data.outputs ?? []).map((output) => ({
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
    <div className="settings-overlay" onPointerDown={close}>
      <div
        className="history-dialog"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="history-dialog__head">
          <span>生成历史</span>
          <span className="history-dialog__count">{items.length} 条</span>
          <button
            type="button"
            className="icon-btn settings-dialog__close"
            title="关闭"
            onClick={close}
          >
            <Icon name="close" size={14} />
          </button>
        </header>

        <div className="history-dialog__body">
          {items.length === 0 ? (
            <div className="history-empty">还没有生成记录</div>
          ) : (
            items.map((item) => (
              <div key={item.key} className="history-row">
                <div className="history-row__thumb">
                  {item.output.kind === 'image' ? (
                    <img
                      src={assetUrl(item.output.path, item.output.scope)}
                      alt={item.title}
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

                <div className="history-row__meta">
                  <div className="history-row__title">{item.title}</div>
                  <div className="history-row__sub">
                    <span>{item.output.kind}</span>
                    <span>{item.output.model}</span>
                    <span>{formatTime(item.output.createdAt)}</span>
                  </div>
                </div>

                <div className="history-row__actions">
                  <button
                    type="button"
                    className="history-action"
                    title="定位节点"
                    onClick={() => locate(item)}
                  >
                    <Icon name="target" size={14} />
                  </button>
                  <button
                    type="button"
                    className="history-action"
                    title="添加到画布"
                    onClick={() => addToCanvas(item)}
                  >
                    <Icon name="plus" size={14} />
                  </button>
                  <button
                    type="button"
                    className="history-action"
                    title="保存到资产库"
                    onClick={() => saveToLibrary(item)}
                  >
                    <Icon name="folder" size={14} />
                  </button>
                  <button
                    type="button"
                    className="history-action"
                    title="导出"
                    onClick={() => void exportItem(item)}
                  >
                    <Icon name="download" size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
