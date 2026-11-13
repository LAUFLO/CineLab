import { useEffect, useRef, useState } from 'react'
import { Button, Dialog, Field, Input } from '../../components/ui'

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
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            取消
          </Button>
          <Button variant="primary" onClick={submit} disabled={!value.trim()}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <Field label={label} htmlFor="library-name-dialog">
        <Input
          ref={inputRef}
          id="library-name-dialog"
          value={value}
          autoFocus
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit()
          }}
        />
      </Field>
    </Dialog>
  )
}
