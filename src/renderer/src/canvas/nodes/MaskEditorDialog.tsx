import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from 'react'
import { Icon } from '../../components/Icon'
import { Button, Dialog, IconButton, Input } from '../../components/ui'

interface MaskEditorDialogProps {
  open: boolean
  title: string
  subtitle?: string
  src: string
  imageWidth: number
  imageHeight: number
  busy?: boolean
  onClose: () => void
  onConfirm: (maskDataUrl: string) => void
}

type MaskTool = 'brush' | 'eraser' | 'rect'

const MAX_HISTORY = 24
const BRUSH_COLOR = '#ff3b5c'

export function MaskEditorDialog({
  open,
  title,
  subtitle,
  src,
  imageWidth,
  imageHeight,
  busy = false,
  onClose,
  onConfirm
}: MaskEditorDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const historyRef = useRef<ImageData[]>([])
  const drawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const rectStartRef = useRef<{ x: number; y: number } | null>(null)
  const snapshotRef = useRef<ImageData | null>(null)

  const [tool, setTool] = useState<MaskTool>('brush')
  const [brushSize, setBrushSize] = useState(28)
  const [hasMask, setHasMask] = useState(false)
  const [historySize, setHistorySize] = useState(0)

  useEffect(() => {
    if (!open) return

    const canvas = canvasRef.current
    if (!canvas) return

    canvas.width = Math.max(1, Math.round(imageWidth))
    canvas.height = Math.max(1, Math.round(imageHeight))
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    historyRef.current = []
    setHistorySize(0)
    setHasMask(false)
    setTool('brush')
    setBrushSize(28)
  }, [open, imageWidth, imageHeight])

  if (!open) return null

  const pushHistory = (): void => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return

    historyRef.current.push(
      context.getImageData(0, 0, canvas.width, canvas.height)
    )
    if (historyRef.current.length > MAX_HISTORY) {
      historyRef.current.shift()
    }
    setHistorySize(historyRef.current.length)
  }

  const undo = (): void => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    const snapshot = historyRef.current.pop()
    if (!snapshot) return

    context.putImageData(snapshot, 0, 0)
    setHistorySize(historyRef.current.length)
    setHasMask(historyRef.current.length > 0)
  }

  const clear = (): void => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    pushHistory()
    context.clearRect(0, 0, canvas.width, canvas.height)
    setHasMask(false)
  }

  const pointFromEvent = (
    event: ReactPointerEvent<HTMLCanvasElement>
  ): { x: number; y: number } => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * canvas.width,
      y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * canvas.height
    }
  }

  const beginStroke = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (busy) return
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    pushHistory()

    const point = pointFromEvent(event)
    drawingRef.current = true
    lastPointRef.current = point

    if (tool === 'rect') {
      rectStartRef.current = point
      snapshotRef.current = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height
      )
      return
    }

    context.globalCompositeOperation =
      tool === 'eraser' ? 'destination-out' : 'source-over'
    context.strokeStyle = BRUSH_COLOR
    context.fillStyle = BRUSH_COLOR
    context.lineWidth = brushSize
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.beginPath()
    context.arc(point.x, point.y, brushSize / 2, 0, Math.PI * 2)
    context.fill()
    setHasMask(true)
  }

  const moveStroke = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (!drawingRef.current) return
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    const point = pointFromEvent(event)

    if (tool === 'rect') {
      const start = rectStartRef.current
      const snapshot = snapshotRef.current
      if (!start || !snapshot) return
      context.putImageData(snapshot, 0, 0)
      context.globalCompositeOperation = 'source-over'
      context.fillStyle = BRUSH_COLOR
      context.fillRect(
        Math.min(start.x, point.x),
        Math.min(start.y, point.y),
        Math.abs(point.x - start.x),
        Math.abs(point.y - start.y)
      )
      return
    }

    const last = lastPointRef.current
    if (!last) return
    context.globalCompositeOperation =
      tool === 'eraser' ? 'destination-out' : 'source-over'
    context.strokeStyle = BRUSH_COLOR
    context.lineWidth = brushSize
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.beginPath()
    context.moveTo(last.x, last.y)
    context.lineTo(point.x, point.y)
    context.stroke()
    lastPointRef.current = point
  }

  const endStroke = (): void => {
    if (!drawingRef.current) return
    drawingRef.current = false
    lastPointRef.current = null
    rectStartRef.current = null
    snapshotRef.current = null

    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (context) context.globalCompositeOperation = 'source-over'

    if (canvas) {
      const data = context?.getImageData(0, 0, canvas.width, canvas.height).data
      if (data) {
        let ink = false
        for (let index = 3; index < data.length; index += 4) {
          if (data[index] > 0) {
            ink = true
            break
          }
        }
        setHasMask(ink)
      }
    }
  }

  const confirm = (): void => {
    const canvas = canvasRef.current
    if (!canvas || !hasMask) return

    const output = document.createElement('canvas')
    output.width = canvas.width
    output.height = canvas.height
    const context = output.getContext('2d')
    if (!context) return

    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, output.width, output.height)
    context.globalCompositeOperation = 'destination-out'
    context.drawImage(canvas, 0, 0)

    onConfirm(output.toDataURL('image/png'))
  }

  return (
    <Dialog
      open={open}
      onClose={busy ? () => {} : onClose}
      bare
      ariaLabel={title}
      overlayClassName="fixed inset-0 z-[250] flex items-center justify-center bg-black/[0.62] px-6 py-10"
      panelClassName="flex w-[min(760px,calc(100vw-48px))] max-h-[calc(100vh-80px)] flex-col gap-3 rounded-[14px] border border-border bg-surface p-[18px] text-fg shadow-menu"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[15px] font-semibold">{title}</div>
          <div className="mt-1 text-xs text-fg-subtle">
            {subtitle ?? '涂抹需要修改的区域，透明区域会交给模型编辑'}
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

      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          variant="secondary"
          size="none"
          className="h-[30px] !rounded-[7px] bg-surface-hover px-3 text-xs disabled:!opacity-45 data-[active]:border-border-selected data-[active]:bg-surface-raised data-[active]:text-fg"
          data-active={tool === 'brush' ? '' : undefined}
          onClick={() => setTool('brush')}
        >
          画笔
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="none"
          className="h-[30px] !rounded-[7px] bg-surface-hover px-3 text-xs disabled:!opacity-45 data-[active]:border-border-selected data-[active]:bg-surface-raised data-[active]:text-fg"
          data-active={tool === 'rect' ? '' : undefined}
          onClick={() => setTool('rect')}
        >
          矩形
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="none"
          className="h-[30px] !rounded-[7px] bg-surface-hover px-3 text-xs disabled:!opacity-45 data-[active]:border-border-selected data-[active]:bg-surface-raised data-[active]:text-fg"
          data-active={tool === 'eraser' ? '' : undefined}
          onClick={() => setTool('eraser')}
        >
          橡皮
        </Button>
        <label className="ml-1.5 inline-flex items-center gap-1.5 text-xs text-fg-subtle">
          笔刷
          <Input
            type="range"
            min={4}
            max={96}
            value={brushSize}
            onChange={(event) => setBrushSize(Number(event.target.value))}
            className="!h-6 !w-[110px] !border-0 !bg-transparent !px-0"
          />
          <span className="min-w-[22px] text-right">{brushSize}</span>
        </label>
        <Button
          type="button"
          variant="secondary"
          size="none"
          className="h-[30px] !rounded-[7px] bg-surface-hover px-3 text-xs disabled:!opacity-45"
          disabled={historySize === 0}
          onClick={undo}
        >
          撤销
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="none"
          className="h-[30px] !rounded-[7px] bg-surface-hover px-3 text-xs disabled:!opacity-45"
          disabled={!hasMask}
          onClick={clear}
        >
          清空
        </Button>
      </div>

      <div
        className="relative w-full max-h-[56vh] overflow-hidden rounded-[10px] border border-border bg-canvas"
        style={{ aspectRatio: `${imageWidth} / ${imageHeight}` }}
      >
        <img
          src={src}
          alt=""
          className="block h-full w-full max-h-[56vh] object-contain select-none"
          draggable={false}
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
          onPointerDown={beginStroke}
          onPointerMove={moveStroke}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          onPointerLeave={endStroke}
        />
      </div>

      <div className="text-[11px] leading-[1.6] text-fg-subtle">
        红色区域为编辑范围。建议先把主体或要修改的部分完整涂到。
      </div>

      <div className="flex justify-end gap-2">
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
          disabled={!hasMask || busy}
          onClick={confirm}
        >
          下一步
        </Button>
      </div>
    </Dialog>
  )
}
