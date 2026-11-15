import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../../components/Icon'
import { Button, Input } from '../../components/ui'

export type AudioActionMode = 'trim' | 'speed'

interface AudioActionBarProps {
  mode: AudioActionMode
  duration: number
  selection: { start: number; end: number }
  rate: number
  busy: boolean
  /** 节点在屏幕上的位置，用于 fixed 定位 */
  anchor: { left: number; top: number; width: number; height: number } | null
  onSelectionChange: (start: number, end: number) => void
  onRateChange: (rate: number) => void
  onClose: () => void
  onSubmit: () => void
}

function formatClock(seconds: number): string {
  const total = Math.max(0, seconds)
  const minutes = Math.floor(total / 60)
  const rest = total - minutes * 60
  return `${String(minutes).padStart(2, '0')}:${rest.toFixed(1).padStart(4, '0')}`
}

function parseClock(text: string): number | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  if (trimmed.includes(':')) {
    const [rawMinutes, rawSeconds] = trimmed.split(':')
    const minutes = Number(rawMinutes)
    const seconds = Number(rawSeconds)
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null
    return minutes * 60 + seconds
  }

  const value = Number(trimmed)
  return Number.isFinite(value) ? value : null
}

export function AudioActionBar({
  mode,
  duration,
  selection,
  rate,
  busy,
  anchor,
  onSelectionChange,
  onRateChange,
  onClose,
  onSubmit
}: AudioActionBarProps) {
  const [startText, setStartText] = useState(formatClock(selection.start))
  const [endText, setEndText] = useState(formatClock(selection.end))
  const [rateText, setRateText] = useState(rate.toFixed(2))

  useEffect(() => {
    setStartText(formatClock(selection.start))
  }, [selection.start])

  useEffect(() => {
    setEndText(formatClock(selection.end))
  }, [selection.end])

  useEffect(() => {
    setRateText(rate.toFixed(2))
  }, [rate])

  const commitRange = (): void => {
    const start = parseClock(startText)
    const end = parseClock(endText)
    if (start === null || end === null) {
      setStartText(formatClock(selection.start))
      setEndText(formatClock(selection.end))
      return
    }

    const nextStart = Math.min(Math.max(0, start), duration)
    const nextEnd = Math.min(Math.max(0, end), duration)
    if (nextEnd - nextStart < 0.1) {
      setStartText(formatClock(selection.start))
      setEndText(formatClock(selection.end))
      return
    }

    onSelectionChange(nextStart, nextEnd)
  }

  const commitRate = (): void => {
    const value = Number(rateText)
    if (!Number.isFinite(value)) {
      setRateText(rate.toFixed(2))
      return
    }
    const next = Math.min(4, Math.max(0.1, value))
    onRateChange(Number(next.toFixed(2)))
  }

  if (!anchor) return null

  const gap = 10
  const barHeight = 48
  const below = anchor.top + anchor.height + gap
  const above = anchor.top - barHeight - gap
  const top =
    below + barHeight <= window.innerHeight - 8
      ? below
      : Math.max(8, Math.min(above, window.innerHeight - barHeight - 8))

  return createPortal(
    <div
      className="nodrag nopan fixed z-[60] flex min-w-[430px] -translate-x-1/2 items-center gap-2.5 rounded-[12px] border border-border-strong bg-[color-mix(in_srgb,var(--surface-raised)_94%,transparent)] px-2.5 py-2 text-xs text-fg shadow-float"
      style={{
        left: anchor.left + anchor.width / 2,
        top
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <Button
        type="button"
        variant="ghost"
        size="none"
        className="h-6 w-6 shrink-0 !rounded-[6px] p-0 text-fg-subtle hover:text-fg"
        title="关闭"
        onClick={onClose}
      >
        <Icon name="close" size={14} />
      </Button>

      <span className="shrink-0 text-fg">
        {mode === 'trim' ? '截取' : '变速'}
      </span>

      {mode === 'trim' ? (
        <div className="ml-auto flex items-center gap-1.5">
          <Input
            className="!h-7 !w-[66px] !rounded-[7px] !px-1.5 text-center !text-xs tabular-nums focus:!border-border-selected"
            value={startText}
            spellCheck={false}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setStartText(event.target.value)}
            onBlur={commitRange}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commitRange()
              }
              if (event.key === 'Escape') onClose()
            }}
          />
          <span className="text-fg-subtle">–</span>
          <Input
            className="!h-7 !w-[66px] !rounded-[7px] !px-1.5 text-center !text-xs tabular-nums focus:!border-border-selected"
            value={endText}
            spellCheck={false}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setEndText(event.target.value)}
            onBlur={commitRange}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commitRange()
              }
              if (event.key === 'Escape') onClose()
            }}
          />
        </div>
      ) : (
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10.5px] whitespace-nowrap text-fg-subtle">
            0.1x
          </span>
          <Input
            className="!h-auto !w-[150px] !rounded-none !border-0 !bg-transparent !p-0 accent-fg cursor-pointer"
            type="range"
            min={0.1}
            max={4}
            step={0.05}
            value={rate}
            onChange={(event) => onRateChange(Number(event.target.value))}
          />
          <span className="text-[10.5px] whitespace-nowrap text-fg-subtle">
            4.0x
          </span>
          <Input
            className="!h-7 !w-14 !rounded-[7px] !px-1 text-center !text-xs tabular-nums focus:!border-border-selected"
            type="number"
            min={0.1}
            max={4}
            step={0.05}
            value={rateText}
            onChange={(event) => setRateText(event.target.value)}
            onBlur={commitRate}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commitRate()
              }
              if (event.key === 'Escape') onClose()
            }}
          />
          <span className="-ml-1 text-[11px] text-fg-subtle">x</span>
        </div>
      )}

      <Button
        type="button"
        variant="primary"
        size="none"
        className="h-[30px] shrink-0 rounded-[8px] border border-transparent !bg-pick-bar px-3.5 text-xs font-semibold"
        disabled={busy}
        onClick={onSubmit}
      >
        {busy ? '生成中…' : '生成'}
      </Button>
    </div>,
    document.body
  )
}
