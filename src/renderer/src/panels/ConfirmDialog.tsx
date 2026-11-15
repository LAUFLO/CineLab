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
      bare
      ariaLabel={confirm.title}
      overlayClassName="fixed inset-0 z-[300] flex items-center justify-center bg-black/35 p-6"
      panelClassName="w-[min(420px,100%)] rounded-[16px] border border-border bg-surface p-6 shadow-float"
    >
      <div className="mb-2.5 text-[16px] text-fg">{confirm.title}</div>
      <p className="mb-[22px] mt-0 text-[13px] leading-[1.7] text-fg-muted">
        {confirm.message}
      </p>
      <div className="flex justify-end gap-2">
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
      </div>
    </Dialog>
  )
}
