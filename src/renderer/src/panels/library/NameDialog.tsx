import { useEffect, useRef, useState } from 'react'
import { Button, DIALOG_PANEL, Dialog, Input } from '../../components/ui'

interface NameDialogProps {
  title: string
  label: string
  initial: string
  confirmLabel: string
  onCancel: () => void
  onConfirm: (value: string) => void
}

export function NameDialog({
  title,
  label,
  initial,
  confirmLabel,
  onCancel,
  onConfirm
}: NameDialogProps) {
  const [value, setValue] = useState(initial)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const submit = (): void => {
    const trimmed = value.trim()
    if (trimmed) onConfirm(trimmed)
  }

  return (
    <Dialog
      open
      onClose={onCancel}
      bare
      ariaLabel={title}
      overlayClassName="fixed inset-0 z-[260] flex items-center justify-center bg-overlay"
      panelClassName={`w-[420px] ${DIALOG_PANEL}`}
    >
      <div className="mb-[14px] text-sm text-fg">{title}</div>

      <label className="mb-[14px] flex flex-col gap-1.5">
        <span className="text-xs text-fg-muted">{label}</span>
        <Input
          ref={inputRef}
          value={value}
          autoFocus
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit()
          }}
          className="!h-[34px] !rounded-md !bg-surface-hover !px-2.5 !text-[13px]"
        />
      </label>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          取消
        </Button>
        <Button variant="primary" onClick={submit} disabled={!value.trim()}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  )
}
