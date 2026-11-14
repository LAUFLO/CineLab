import { useEffect, useRef, useState } from 'react'
import { Button, Dialog, Input } from '../../components/ui'

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
      overlayClassName="library-modal"
      panelClassName="library-modal__panel"
    >
      <div className="library-modal__title">{title}</div>

      <label className="field">
        <span>{label}</span>
        <Input
          ref={inputRef}
          value={value}
          autoFocus
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit()
          }}
          unstyled
        />
      </label>

      <div className="library-modal__actions">
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
