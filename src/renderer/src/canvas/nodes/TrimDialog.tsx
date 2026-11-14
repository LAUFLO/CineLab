import { useEffect, useState } from 'react'
import { Icon } from '../../components/Icon'
import { Button, Dialog, Input } from '../../components/ui'

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
      overlayClassName="operation-dialog-overlay"
      panelClassName="operation-dialog"
    >
      <div className="operation-dialog__header">
        <div>
          <div className="operation-dialog__title">片段截取</div>
          <div className="operation-dialog__subtitle">
            原片时长 {duration.toFixed(1)} 秒
          </div>
        </div>
        <Button
          type="button"
          className="operation-dialog__close"
          title="关闭"
          disabled={busy}
          onClick={onClose}
          unstyled
        >
          <Icon name="close" size={14} />
        </Button>
      </div>

      <div className="operation-dialog__row">
        <label className="operation-dialog__field">
          <span>开始（秒）</span>
          <Input
            type="number"
            min="0"
            max={duration}
            step="0.1"
            value={start}
            onChange={(event) => setStart(event.target.value)}
            unstyled
          />
        </label>
        <label className="operation-dialog__field">
          <span>结束（秒）</span>
          <Input
            type="number"
            min="0"
            max={duration}
            step="0.1"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            unstyled
          />
        </label>
      </div>

      <div className="operation-dialog__hint">
        使用流复制快速截取，起点可能对齐到最近关键帧。
      </div>

      <div className="operation-dialog__footer">
        <Button
          type="button"
          className="btn-secondary"
          disabled={busy}
          onClick={onClose}
          unstyled
        >
          取消
        </Button>
        <Button
          type="button"
          className="btn-primary"
          disabled={!valid || busy}
          onClick={() => onConfirm(startValue, endValue)}
          unstyled
        >
          {busy ? '截取中…' : '开始截取'}
        </Button>
      </div>
    </Dialog>
  )
}
