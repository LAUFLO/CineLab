import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

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

  return createPortal(
    <div className="library-modal" onPointerDown={onCancel}>
      <div className="library-modal__panel" onPointerDown={(event) => event.stopPropagation()}>
        <div className="library-modal__title">{title}</div>

        <label className="field">
          <span>{label}</span>
          <input
            ref={inputRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit()
              if (event.key === 'Escape') onCancel()
            }}
          />
        </label>

        <div className="library-modal__actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={submit}
            disabled={!value.trim()}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
