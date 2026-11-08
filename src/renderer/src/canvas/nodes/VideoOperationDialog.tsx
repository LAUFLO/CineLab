import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../../components/Icon'

interface VideoOperationDialogProps {
  open: boolean
  title: string
  modelLabel: string
  initialPrompt: string
  busy: boolean
  onClose: () => void
  onConfirm: (prompt: string) => void
}

export function VideoOperationDialog({
  open,
  title,
  modelLabel,
  initialPrompt,
  busy,
  onClose,
  onConfirm
}: VideoOperationDialogProps) {
  const [prompt, setPrompt] = useState(initialPrompt)

  useEffect(() => {
    if (!open) return
    setPrompt(initialPrompt)
  }, [open, initialPrompt])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, busy, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="operation-dialog-overlay"
      onPointerDown={() => {
        if (!busy) onClose()
      }}
    >
      <div
        className="operation-dialog is-wide"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="operation-dialog__header">
          <div>
            <div className="operation-dialog__title">{title}</div>
            <div className="operation-dialog__subtitle">
              当前视频会提交给专用接口，结果作为节点新版本
            </div>
          </div>
          <button
            type="button"
            className="operation-dialog__close"
            title="关闭"
            disabled={busy}
            onClick={onClose}
          >
            <Icon name="close" size={14} />
          </button>
        </div>

        <div className="operation-dialog__meta">
          <span>绑定模型</span>
          <strong>{modelLabel}</strong>
        </div>

        <label className="operation-dialog__field">
          <span>提示词</span>
          <textarea
            className="operation-dialog__textarea"
            rows={7}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            disabled={busy}
          />
        </label>

        <div className="operation-dialog__hint">
          该操作不会使用首帧 i2v 近似，必须由绑定的专用接口返回视频。
        </div>

        <div className="operation-dialog__footer">
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy || prompt.trim().length === 0}
            onClick={() => onConfirm(prompt.trim())}
          >
            {busy ? '提交中…' : '提交专用接口'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
