import { useState } from 'react'
import { Button, Dialog } from '../components/ui'
import { useUIStore } from '../stores/ui'

export function ConfirmDialog() {
  const confirm = useUIStore((state) => state.confirm)
  const closeConfirm = useUIStore((state) => state.closeConfirm)
  const [busy, setBusy] = useState(false)

  if (!confirm) return null

  const handleConfirm = async (): Promise<void> => {
    setBusy(true)
    try {
      await confirm.onConfirm()
    } finally {
      setBusy(false)
      closeConfirm()
    }
  }

  const handleSecondary = async (): Promise<void> => {
    if (!confirm.onSecondary) return
    setBusy(true)
    try {
      await confirm.onSecondary()
    } finally {
      setBusy(false)
      closeConfirm()
    }
  }

  return (
    <Dialog
      open
      onClose={closeConfirm}
      title={confirm.title}
      description={confirm.message}
      footer={
        <>
          <Button variant="secondary" onClick={closeConfirm} disabled={busy}>
            取消
          </Button>
          {confirm.onSecondary ? (
            <Button
              variant={confirm.secondaryDanger ? 'danger' : 'primary'}
              onClick={() => void handleSecondary()}
              disabled={busy}
            >
              {busy ? '处理中…' : (confirm.secondaryLabel ?? '其他操作')}
            </Button>
          ) : null}
          <Button
            variant={confirm.danger ? 'danger' : 'primary'}
            onClick={() => void handleConfirm()}
            disabled={busy}
          >
            {busy ? '处理中…' : (confirm.confirmLabel ?? '确认')}
          </Button>
        </>
      }
    />
  )
}
