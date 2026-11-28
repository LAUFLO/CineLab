import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { OutputRef } from '@shared/canvas-schema'
import { Icon } from '../../components/Icon'
import { Button, IconButton } from '../../components/ui'
import { useUIStore, type InlineEditorState } from '../../stores/ui'
import { executeNodeOperation } from './node-operation-runner'

interface InlineTimelineEditorProps {
  editor: InlineEditorState
  current: OutputRef
  rect: { left: number; top: number; width: number; height: number }
}

function timeLabel(seconds: number): string {
  const safe = Math.max(0, seconds)
  const minutes = Math.floor(safe / 60)
  const rest = safe - minutes * 60
  return `${String(minutes).padStart(2, '0')}:${rest
    .toFixed(1)
    .padStart(4, '0')}`
}

export function InlineTimelineEditor({
  editor,
  current,
  rect
}: InlineTimelineEditorProps) {
  const showToast = useUIStore((state) => state.showToast)
  const close = useUIStore((state) => state.closeInlineEditor)
  const [duration, setDuration] = useState(current.duration ?? 0)
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(current.duration ?? 0)
  const [dragging, setDragging] = useState<'start' | 'end' | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (current.duration && current.duration > 0) {
      setDuration(current.duration)
      setEnd(current.duration)
      return
    }
    let alive = true
    void window.api.media
      .probe(current.path)
      .then((probe) => {
        if (!alive) return
        const next = probe.duration ?? 0
        setDuration(next)
        setEnd(next)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [current.duration, current.path])

  useEffect(() => {
    if (!dragging) return
    const move = (event: PointerEvent): void => {
      const track = trackRef.current
      if (!track || duration <= 0) return
      const bounds = track.getBoundingClientRect()
      const ratio = Math.min(
        1,
        Math.max(0, (event.clientX - bounds.left) / Math.max(1, bounds.width))
      )
      const value = ratio * duration
      if (dragging === 'start') {
        setStart(Math.min(value, Math.max(0, end - 0.1)))
      } else {
        setEnd(Math.max(value, Math.min(duration, start + 0.1)))
      }
    }
    const up = (): void => setDragging(null)
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
    return () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
    }
  }, [dragging, duration, end, start])

  const submit = async (): Promise<void> => {
    if (running) return
    if (end - start < 0.1) {
      setError('选区太短')
      return
    }
    setError(null)
    setRunning(true)
    try {
      const result = await executeNodeOperation(
        {
          nodeId: editor.nodeId,
          operationId: 'clip-trim',
          params: { start, end }
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
        setError(result.error ?? '截取失败')
        return
      }
      showToast('已提交片段截取')
      close()
    } finally {
      setRunning(false)
    }
  }

  const toolbarTop = Math.max(44, rect.top - 28 - 52)
  const panelTop = rect.top + rect.height + 10
  const startPercent = duration > 0 ? (start / duration) * 100 : 0
  const endPercent = duration > 0 ? (end / duration) * 100 : 100

  return createPortal(
    <>
      <div
        data-node-chrome
        role="toolbar"
        className="fixed z-[1091] flex h-9 -translate-x-1/2 items-center gap-0.5 rounded-card border border-border bg-surface-raised px-1 shadow-float"
        style={{ left: rect.left + rect.width / 2, top: toolbarTop }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <IconButton label="退出片段截取" size="md" onClick={close}>
          <Icon name="close" size={16} />
        </IconButton>
        <span className="mx-1 h-4 w-px bg-divider" />
        <span className="flex items-center gap-1.5 px-1 text-[12px] font-medium">
          <Icon name="scissors" size={13} />
          片段截取
        </span>
      </div>

      <div
        data-node-chrome
        className="fixed z-[1091] flex -translate-x-1/2 flex-col gap-2.5 rounded-card border border-border bg-surface-raised p-3 shadow-float"
        style={{
          left: rect.left + rect.width / 2,
          top: panelTop,
          width: Math.min(560, Math.max(360, rect.width)),
          maxHeight: Math.max(160, window.innerHeight - panelTop - 16)
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="text-[12px] font-medium">片段截取</div>
          <div className="text-[11px] text-fg-subtle">
            {timeLabel(start)} – {timeLabel(end)} · 共{' '}
            {Math.max(0, end - start).toFixed(1)} 秒
          </div>
        </div>

        <div
          ref={trackRef}
          className="relative h-8 rounded-md border border-border bg-surface"
        >
          <div
            className="absolute inset-y-0 rounded-[3px] bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]"
            style={{ left: `${startPercent}%`, width: `${endPercent - startPercent}%` }}
          />
          <div
            className="absolute top-1/2 h-6 w-1 -translate-y-1/2 cursor-ew-resize rounded-full bg-accent"
            style={{ left: `${startPercent}%` }}
            onPointerDown={(event) => {
              event.preventDefault()
              setDragging('start')
            }}
          />
          <div
            className="absolute top-1/2 h-6 w-1 -translate-y-1/2 cursor-ew-resize rounded-full bg-accent"
            style={{ left: `${endPercent}%` }}
            onPointerDown={(event) => {
              event.preventDefault()
              setDragging('end')
            }}
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0.5 flex justify-between px-1 text-[9px] text-fg-subtle">
            <span>00:00</span>
            <span>{timeLabel(duration)}</span>
          </div>
        </div>

        {error ? (
          <div className="rounded-md bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] px-2 py-1.5 text-[11px] text-danger">
            {error}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          <div className="text-[10.5px] text-fg-subtle">
            拖动两端的滑块选择保留区间
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
              disabled={running || end - start < 0.1}
            >
              {running ? '截取中…' : '截取'}
            </Button>
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}
