import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { OutputRef } from '@shared/canvas-schema'
import { Icon } from '../../components/Icon'
import { Button, IconButton } from '../../components/ui'
import { useUIStore, type InlineEditorState } from '../../stores/ui'
import { executeNodeOperation } from './node-operation-runner'

interface InlineGridEditorProps {
  editor: InlineEditorState
  current: OutputRef
  rect: { left: number; top: number; width: number; height: number }
}

const GRID_OPTIONS = ['2x2', '3x3', '4x4', '5x5'] as const

export function InlineGridEditor({
  editor,
  current,
  rect
}: InlineGridEditorProps) {
  const showToast = useUIStore((state) => state.showToast)
  const close = useUIStore((state) => state.closeInlineEditor)
  const [size, setSize] = useState<string>(
    GRID_OPTIONS.includes(editor.itemId as (typeof GRID_OPTIONS)[number])
      ? (editor.itemId as string)
      : '3x3'
  )
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [rows, cols] = useMemo(() => {
    const [rowCount, colCount] = size.split('x').map(Number)
    return [rowCount || 3, colCount || 3]
  }, [size])

  const cellWidth = Math.round((current.width ?? 0) / cols)
  const cellHeight = Math.round((current.height ?? 0) / rows)

  const submit = async (): Promise<void> => {
    if (running) return
    setError(null)
    setRunning(true)
    try {
      const result = await executeNodeOperation(
        {
          nodeId: editor.nodeId,
          operationId: 'grid-split',
          itemId: size
        },
        {
          effect: () => setError('当前操作仍需补充参数'),
          toast: (message, tone) => {
            if (tone === 'error') setError(message)
          },
          setRunning
        }
      )
      if (!result.ok) {
        setError(result.error ?? '切分失败')
        return
      }
      showToast(`已切分为 ${rows} × ${cols}`)
      close()
    } finally {
      setRunning(false)
    }
  }

  const toolbarTop = Math.max(44, rect.top - 28 - 52)
  const panelTop = rect.top + rect.height + 10

  return createPortal(
    <>
      <div
        data-node-chrome
        role="toolbar"
        className="fixed z-[1091] flex h-9 -translate-x-1/2 items-center gap-0.5 rounded-card border border-border bg-surface-raised px-1 shadow-float"
        style={{ left: rect.left + rect.width / 2, top: toolbarTop }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <IconButton label="退出宫格切分" size="md" onClick={close}>
          <Icon name="close" size={16} />
        </IconButton>
        <span className="mx-1 h-4 w-px bg-divider" />
        <span className="flex items-center gap-1.5 px-1 text-[12px] font-medium">
          <Icon name="grid" size={13} />
          宫格切分
        </span>
      </div>

      <div
        className="pointer-events-none fixed z-[1090]"
        style={{
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height
        }}
      >
        {Array.from({ length: cols - 1 }, (_, index) => (
          <div
            key={`col-${index}`}
            className="absolute inset-y-0 w-px"
            style={{
              left: `${((index + 1) / cols) * 100}%`,
              background: 'var(--selection-line)',
              boxShadow: '0 0 0 0.5px var(--overlay)'
            }}
          />
        ))}
        {Array.from({ length: rows - 1 }, (_, index) => (
          <div
            key={`row-${index}`}
            className="absolute inset-x-0 h-px"
            style={{
              top: `${((index + 1) / rows) * 100}%`,
              background: 'var(--selection-line)',
              boxShadow: '0 0 0 0.5px var(--overlay)'
            }}
          />
        ))}
      </div>

      <div
        data-node-chrome
        className="fixed z-[1091] flex -translate-x-1/2 flex-col gap-2.5 rounded-card border border-border bg-surface-raised p-3 shadow-float"
        style={{
          left: rect.left + rect.width / 2,
          top: panelTop,
          width: Math.min(480, Math.max(360, rect.width)),
          maxHeight: Math.max(160, window.innerHeight - panelTop - 16)
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="text-[12px] font-medium">宫格切分</div>
          <div className="text-[11px] text-fg-subtle">
            每格 {cellWidth} × {cellHeight} px
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {GRID_OPTIONS.map((entry) => (
            <Button
              key={entry}
              type="button"
              variant={entry === size ? 'secondary' : 'ghost'}
              size="none"
              className="!h-7 !rounded-md !px-2 !text-[11px] !font-normal"
              disabled={running}
              onClick={() => setSize(entry)}
            >
              {entry.replace('x', ' × ')}
            </Button>
          ))}
        </div>

        {error ? (
          <div className="rounded-md bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] px-2 py-1.5 text-[11px] text-danger">
            {error}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          <div className="text-[10.5px] text-fg-subtle">
            本地切分，不调用模型
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={close}
              disabled={running}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => void submit()}
              disabled={running}
            >
              {running ? '切分中…' : '切分'}
            </Button>
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}
