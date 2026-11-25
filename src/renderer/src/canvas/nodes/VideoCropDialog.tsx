import { useEffect, useState } from 'react'
import { parseAspectRatio } from '@shared/media'
import { Icon } from '../../components/Icon'
import {
  Button,
  DIALOG_PANEL,
  Dialog,
  IconButton,
  Input
} from '../../components/ui'

interface VideoCropDialogProps {
  open: boolean
  defaultRatio: string
  busy: boolean
  onClose: () => void
  onConfirm: (ratio: string) => void
}

export function VideoCropDialog({
  open,
  defaultRatio,
  busy,
  onClose,
  onConfirm
}: VideoCropDialogProps) {
  const [ratioWidth, setRatioWidth] = useState('16')
  const [ratioHeight, setRatioHeight] = useState('9')

  useEffect(() => {
    if (!open) return
    const parsed = parseAspectRatio(defaultRatio)
    setRatioWidth(String(parsed?.width ?? 16))
    setRatioHeight(String(parsed?.height ?? 9))
  }, [open, defaultRatio])

  if (!open) return null

  const ratio = `${ratioWidth.trim()}:${ratioHeight.trim()}`
  const valid = parseAspectRatio(ratio) !== null

  return (
    <Dialog
      open={open}
      onClose={busy ? () => {} : onClose}
      bare
      ariaLabel="自定义画面裁切"
      overlayClassName="fixed inset-0 z-[240] flex items-center justify-center bg-overlay px-6 py-12"
      panelClassName={`w-[400px] ${DIALOG_PANEL}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[15px] font-semibold">自定义画面裁切</div>
          <div className="mt-1 text-xs text-fg-subtle">
            按宽高比居中裁切；例如 4:5、2.35:1
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

      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-end gap-2.5">
        <label className="flex flex-col gap-1.5 text-xs text-fg-muted">
          <span>宽</span>
          <Input
            type="number"
            min="0.01"
            step="0.01"
            value={ratioWidth}
            onChange={(event) => setRatioWidth(event.target.value)}
            className="!h-8 !rounded-md !border-border-strong !bg-surface-hover !px-2 !text-xs focus:!border-border-selected"
          />
        </label>
        <span className="pb-2 text-sm text-fg-subtle">:</span>
        <label className="flex flex-col gap-1.5 text-xs text-fg-muted">
          <span>高</span>
          <Input
            type="number"
            min="0.01"
            step="0.01"
            value={ratioHeight}
            onChange={(event) => setRatioHeight(event.target.value)}
            className="!h-8 !rounded-md !border-border-strong !bg-surface-hover !px-2 !text-xs focus:!border-border-selected"
          />
        </label>
      </div>

      <div className="mt-3 text-[11px] leading-[1.6] text-fg-subtle">
        输出宽高会向下取偶以适配 H.264，画面从中心裁切。
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
          onClick={() => onConfirm(ratio)}
        >
          {busy ? '裁切中…' : '开始裁切'}
        </Button>
      </div>
    </Dialog>
  )
}
