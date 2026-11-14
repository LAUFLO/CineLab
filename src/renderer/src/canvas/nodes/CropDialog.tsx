import { Icon } from '../../components/Icon'
import { useBoxEditor } from './useBoxEditor'
import { Button, Dialog } from '../../components/ui'

interface CropDialogProps {
  open: boolean
  src: string
  imageWidth: number
  imageHeight: number
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

export function CropDialog({
  open,
  src,
  imageWidth,
  imageHeight,
  busy,
  onClose,
  onConfirm
}: CropDialogProps) {
  const scale = Math.min(
    MAX_WIDTH / Math.max(1, imageWidth),
    MAX_HEIGHT / Math.max(1, imageHeight),
    1
  )
  const displayWidth = Math.max(1, Math.round(imageWidth * scale))
  const displayHeight = Math.max(1, Math.round(imageHeight * scale))

  const { box, startDrag } = useBoxEditor(
    displayWidth,
    displayHeight,
    {
      x: displayWidth * 0.1,
      y: displayHeight * 0.1,
      width: displayWidth * 0.8,
      height: displayHeight * 0.8
    },
    open
  )

  if (!open) return null

  const scaleX = imageWidth / displayWidth
  const scaleY = imageHeight / displayHeight
  const rect = {
    x: Math.round(box.x * scaleX),
    y: Math.round(box.y * scaleY),
    width: Math.round(box.width * scaleX),
    height: Math.round(box.height * scaleY)
  }

  return (
    <Dialog
      open={open}
      onClose={busy ? () => {} : onClose}
      bare
      ariaLabel="自由裁剪"
      overlayClassName="box-dialog-overlay"
      panelClassName="box-dialog"
    >
      <div className="box-dialog__header">
        <div>
          <div className="box-dialog__title">自由裁剪</div>
          <div className="box-dialog__subtitle">拖拽选框或四角调整裁剪区域</div>
        </div>
        <Button
          type="button"
          className="box-dialog__close"
          title="关闭"
          disabled={busy}
          onClick={onClose}
          unstyled
        >
          <Icon name="close" size={14} />
        </Button>
      </div>

      <div
        className="box-dialog__stage"
        style={{ width: displayWidth, height: displayHeight }}
      >
        <img src={src} alt="" className="box-dialog__image" draggable={false} />
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
        裁剪尺寸 {rect.width} × {rect.height} px
      </div>

      <div className="box-dialog__footer">
        <Button
          type="button"
          className="btn-secondary"
          disabled={busy}
          onClick={onClose}
          unstyled
        >
          取消
        </Button>
        <Button
          type="button"
          className="btn-primary"
          disabled={busy || rect.width < 2 || rect.height < 2}
          onClick={() => onConfirm(rect)}
          unstyled
        >
          {busy ? '裁剪中…' : '应用裁剪'}
        </Button>
      </div>
    </Dialog>
  )
}
