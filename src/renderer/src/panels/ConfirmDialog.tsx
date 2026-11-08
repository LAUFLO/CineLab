import { useState } from 'react'
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
    <div className="confirm-overlay" onPointerDown={closeConfirm}>
      <div
        className="confirm-dialog"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="confirm-dialog__title">{confirm.title}</div>
        <p className="confirm-dialog__message">{confirm.message}</p>
        <div className="confirm-dialog__actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={closeConfirm}
            disabled={busy}
          >
            取消
          </button>
          {confirm.onSecondary ? (
            <button
              type="button"
              className={`btn-primary ${
                confirm.secondaryDanger ? 'is-danger' : ''
              }`}
              onClick={() => void handleSecondary()}
              disabled={busy}
            >
              {busy ? '处理中…' : confirm.secondaryLabel ?? '其他操作'}
            </button>
          ) : null}
          <button
            type="button"
            className={`btn-primary ${confirm.danger ? 'is-danger' : ''}`}
            onClick={() => void handleConfirm()}
            disabled={busy}
          >
            {busy ? '处理中…' : confirm.confirmLabel ?? '确认'}
          </button>
        </div>
      </div>
    </div>
  )
}
