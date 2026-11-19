import { Icon } from '../../components/Icon'
import { useBoxEditor } from './useBoxEditor'
import { Button, DIALOG_PANEL, Dialog, IconButton } from '../../components/ui'

interface SubtitleDialogProps {
  open: boolean
  title?: string
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
  title = '框选去字幕',
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

  if (!open) return null

  const scaleX = videoWidth / displayWidth
  const scaleY = videoHeight / displayHeight
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
      ariaLabel={title}
      overlayClassName="fixed inset-0 z-[240] flex items-center justify-center bg-overlay px-6 py-12"
      panelClassName={`max-w-[calc(100vw-48px)] ${DIALOG_PANEL}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[15px] font-semibold">{title}</div>
          <div className="mt-1 text-xs text-fg-subtle">
            框住字幕区域，使用区域擦除处理
          </div>
        </div>
        <IconButton
          label="关闭"
          size="sm"
          className="disabled:!opacity-100"
          disabled={busy}
          onClick={onClose}
        >
          <Icon name="close" size={14} />
        </IconButton>
      </div>

      <div
        className="relative mt-3.5 overflow-hidden rounded-card bg-canvas select-none touch-none"
        style={{ width: displayWidth, height: displayHeight }}
      >
        <video
          src={src}
          className="absolute inset-0 block h-full w-full object-fill"
          controls
          muted
          playsInline
        />
        <div
          className="absolute cursor-move border border-pick-bar shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
          style={{
            left: box.x,
            top: box.y,
            width: box.width,
            height: box.height
          }}
          onPointerDown={startDrag('move')}
        >
          <span
            className="absolute h-2.5 w-2.5 rounded-[2px] border border-pick-bar bg-surface -left-[5px] -top-[5px] cursor-nwse-resize"
            onPointerDown={startDrag('nw')}
          />
          <span
            className="absolute h-2.5 w-2.5 rounded-[2px] border border-pick-bar bg-surface -right-[5px] -top-[5px] cursor-nesw-resize"
            onPointerDown={startDrag('ne')}
          />
          <span
            className="absolute h-2.5 w-2.5 rounded-[2px] border border-pick-bar bg-surface -left-[5px] -bottom-[5px] cursor-nesw-resize"
            onPointerDown={startDrag('sw')}
          />
          <span
            className="absolute h-2.5 w-2.5 rounded-[2px] border border-pick-bar bg-surface -right-[5px] -bottom-[5px] cursor-nwse-resize"
            onPointerDown={startDrag('se')}
          />
        </div>
      </div>

      <div className="mt-2.5 text-xs text-fg-muted">
        字幕区域 {rect.width} × {rect.height} px
      </div>

      <div className="mt-1.5 text-[11px] text-fg-subtle">
        使用 delogo 区域擦除，背景复杂时效果有限。
      </div>

      <div className="mt-3.5 flex justify-end gap-2 border-t border-divider pt-3.5">
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={onClose}
        >
          取消
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={busy || rect.width < 2 || rect.height < 2}
          onClick={() => onConfirm(rect)}
        >
          {busy ? '处理中…' : '开始处理'}
        </Button>
      </div>
    </Dialog>
  )
}
