import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../../components/Icon'
import { useBoxEditor } from './useBoxEditor'

interface SubtitleDialogProps {
  open: boolean
  src: string
  videoWidth: number
  videoHeight: number
  busy: boolean
  onClose: () => void
  onConfirm: (rect: {
    x: number
    y: number
    width: number
    height: number
  }) => void
}

const MAX_WIDTH = 560
const MAX_HEIGHT = 420

export function SubtitleDialog({
  open,
  src,
  videoWidth,
  videoHeight,
  busy,
  onClose,
  onConfirm
}: SubtitleDialogProps) {
  const scale = Math.min(
    MAX_WIDTH / Math.max(1, videoWidth),
    MAX_HEIGHT / Math.max(1, videoHeight),
    1
  )
  const displayWidth = Math.max(1, Math.round(videoWidth * scale))
  const displayHeight = Math.max(1, Math.round(videoHeight * scale))

  const { box, startDrag } = useBoxEditor(
    displayWidth,
    displayHeight,
    {
      x: displayWidth * 0.15,
      y: displayHeight * 0.72,
      width: displayWidth * 0.7,
      height: displayHeight * 0.14
    },
    open
  )

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) onClose()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, busy, onClose])

  if (!open) return null

  const scaleX = videoWidth / displayWidth
  const scaleY = videoHeight / displayHeight
  const rect = {
    x: Math.round(box.x * scaleX),
    y: Math.round(box.y * scaleY),
    width: Math.round(box.width * scaleX),
    height: Math.round(box.height * scaleY)
  }

  return createPortal(
    <div
      className="box-dialog-overlay"
      onPointerDown={() => {
        if (!busy) onClose()
      }}
    >
      <div
        className="box-dialog"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="box-dialog__header">
          <div>
            <div className="box-dialog__title">框选去字幕</div>
            <div className="box-dialog__subtitle">
              框住字幕区域，使用区域擦除处理
            </div>
          </div>
          <button
            type="button"
            className="box-dialog__close"
            title="关闭"
            disabled={busy}
            onClick={onClose}
          >
            <Icon name="close" size={14} />
          </button>
        </div>

        <div
          className="box-dialog__stage"
          style={{ width: displayWidth, height: displayHeight }}
        >
          <video
            src={src}
            className="box-dialog__video"
            controls
            muted
            playsInline
          />
          <div
            className="box-dialog__box"
            style={{
              left: box.x,
              top: box.y,
              width: box.width,
              height: box.height
            }}
            onPointerDown={startDrag('move')}
          >
            <span
              className="box-dialog__handle is-nw"
              onPointerDown={startDrag('nw')}
            />
            <span
              className="box-dialog__handle is-ne"
              onPointerDown={startDrag('ne')}
            />
            <span
              className="box-dialog__handle is-sw"
              onPointerDown={startDrag('sw')}
            />
            <span
              className="box-dialog__handle is-se"
              onPointerDown={startDrag('se')}
            />
          </div>
        </div>

        <div className="box-dialog__meta">
          字幕区域 {rect.width} × {rect.height} px
        </div>

        <div className="box-dialog__hint">
          使用 delogo 区域擦除，背景复杂时效果有限。
        </div>

        <div className="box-dialog__footer">
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
            disabled={busy || rect.width < 2 || rect.height < 2}
            onClick={() => onConfirm(rect)}
          >
            {busy ? '处理中…' : '应用去字幕'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
