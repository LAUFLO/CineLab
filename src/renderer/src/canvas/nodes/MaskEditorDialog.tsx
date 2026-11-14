import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from 'react'
import { Icon } from '../../components/Icon'
import { Button, Dialog, Input } from '../../components/ui'

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
      overlayClassName="mask-editor-overlay"
      panelClassName="mask-editor"
    >
      <div className="mask-editor__header">
        <div>
          <div className="mask-editor__title">{title}</div>
          <div className="mask-editor__subtitle">
            {subtitle ?? '涂抹需要修改的区域，透明区域会交给模型编辑'}
          </div>
        </div>
        <Button
          type="button"
          className="mask-editor__close"
          title="关闭"
          disabled={busy}
          onClick={onClose}
          unstyled
        >
          <Icon name="close" size={14} />
        </Button>
      </div>

      <div className="mask-editor__toolbar">
        <Button
          type="button"
          className={tool === 'brush' ? 'is-active' : ''}
          onClick={() => setTool('brush')}
          unstyled
        >
          画笔
        </Button>
        <Button
          type="button"
          className={tool === 'rect' ? 'is-active' : ''}
          onClick={() => setTool('rect')}
          unstyled
        >
          矩形
        </Button>
        <Button
          type="button"
          className={tool === 'eraser' ? 'is-active' : ''}
          onClick={() => setTool('eraser')}
          unstyled
        >
          橡皮
        </Button>
        <label className="mask-editor__size">
          笔刷
          <Input
            type="range"
            min={4}
            max={96}
            value={brushSize}
            onChange={(event) => setBrushSize(Number(event.target.value))}
            unstyled
          />
          <span>{brushSize}</span>
        </label>
        <Button
          type="button"
          disabled={historySize === 0}
          onClick={undo}
          unstyled
        >
          撤销
        </Button>
        <Button type="button" disabled={!hasMask} onClick={clear} unstyled>
          清空
        </Button>
      </div>

      <div
        className="mask-editor__stage"
        style={{ aspectRatio: `${imageWidth} / ${imageHeight}` }}
      >
        <img src={src} alt="" draggable={false} />
        <canvas
          ref={canvasRef}
          className="mask-editor__canvas"
          onPointerDown={beginStroke}
          onPointerMove={moveStroke}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          onPointerLeave={endStroke}
        />
      </div>

      <div className="mask-editor__hint">
        红色区域为编辑范围。建议先把主体或要修改的部分完整涂到。
      </div>

      <div className="mask-editor__footer">
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
          disabled={!hasMask || busy}
          onClick={confirm}
          unstyled
        >
          下一步
        </Button>
      </div>
    </Dialog>
  )
}
