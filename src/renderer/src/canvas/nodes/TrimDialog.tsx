import { useEffect, useState } from 'react'
import { Icon } from '../../components/Icon'
import { Button, Dialog, IconButton, Input } from '../../components/ui'

interface TrimDialogProps {
  open: boolean
  duration: number
  busy: boolean
  onClose: () => void
  onConfirm: (start: number, end: number) => void
}

export function TrimDialog({
  open,
  duration,
  busy,
  onClose,
  onConfirm
}: TrimDialogProps) {
  const [start, setStart] = useState('0')
  const [end, setEnd] = useState(duration.toFixed(1))

  useEffect(() => {
    if (!open) return
    setStart('0')
    setEnd(duration.toFixed(1))
  }, [open, duration])

  if (!open) return null

  const startValue = Number(start)
  const endValue = Number(end)
  const valid =
    Number.isFinite(startValue) &&
    Number.isFinite(endValue) &&
    startValue >= 0 &&
    endValue <= duration + 0.001 &&
    endValue - startValue >= 0.1

  return (
    <Dialog
      open={open}
      onClose={busy ? () => {} : onClose}
      bare
      ariaLabel="片段截取"
      overlayClassName="fixed inset-0 z-[240] flex items-center justify-center bg-black/55 px-6 py-12"
      panelClassName="w-[380px] rounded-[14px] border border-border bg-surface p-[18px] text-fg shadow-menu"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[15px] font-semibold">片段截取</div>
          <div className="mt-1 text-xs text-fg-subtle">
            原片时长 {duration.toFixed(1)} 秒
          </div>
        </div>
        <IconButton
          label="关闭"
          size="sm"
          className="disabled:!opacity-100"
          disabled={busy}
          onClick={onClose}
        >
          <Icon name="close" size={14} />
        </IconButton>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <label className="flex flex-col gap-1.5 text-xs text-fg-muted">
          <span>开始（秒）</span>
          <Input
            type="number"
            min="0"
            max={duration}
            step="0.1"
            value={start}
            onChange={(event) => setStart(event.target.value)}
            className="!h-8 !rounded-[7px] !border-border-strong !bg-surface-hover !px-2 !text-xs focus:!border-border-selected"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs text-fg-muted">
          <span>结束（秒）</span>
          <Input
            type="number"
            min="0"
            max={duration}
            step="0.1"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            className="!h-8 !rounded-[7px] !border-border-strong !bg-surface-hover !px-2 !text-xs focus:!border-border-selected"
          />
        </label>
      </div>

      <div className="mt-3 text-[11px] leading-[1.6] text-fg-subtle">
        使用流复制快速截取，起点可能对齐到最近关键帧。
      </div>

      <div className="mt-4 flex justify-end gap-2 border-t border-divider pt-3.5">
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={onClose}
        >
          取消
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={!valid || busy}
          onClick={() => onConfirm(startValue, endValue)}
        >
          {busy ? '截取中…' : '开始截取'}
        </Button>
      </div>
    </Dialog>
  )
}
