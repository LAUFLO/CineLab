import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from 'react'
import { createPortal } from 'react-dom'
import type { OutputRef } from '@shared/canvas-schema'
import { Icon } from '../../components/Icon'
import { Button, IconButton, Input, Textarea } from '../../components/ui'
import { useSettingsStore } from '../../stores/settings'
import { useUIStore, type InlineEditorState } from '../../stores/ui'
import { listImageModels, runImageOperation } from './inline-generation'
import { InlineModelField } from './InlineModelField'

interface InlineMaskEditorProps {
  editor: InlineEditorState
  current: OutputRef
  rect: { left: number; top: number; width: number; height: number }
}

type MaskTool = 'brush' | 'eraser' | 'rect'

const MAX_HISTORY = 24
const BRUSH_COLOR = '#ff3b5c'

function titleOf(operationId: string): string {
  if (operationId === 'inpaint') return '重绘'
  if (operationId === 'erase') return '擦除'
  if (operationId === 'element-edit') return '元素编辑'
  return '蒙版编辑'
}

function hintOf(operationId: string): string {
  if (operationId === 'erase') return '涂抹要移除的对象，模型会用周围背景补全'
  if (operationId === 'element-edit') {
    return '涂抹或框选要修改的元素，然后描述希望变成什么样'
  }
  return '涂抹要重绘的区域，透明区域会交给模型编辑'
}

export function InlineMaskEditor({
  editor,
  current,
  rect
}: InlineMaskEditorProps) {
  const providers = useSettingsStore((state) => state.providers)
  const showToast = useUIStore((state) => state.showToast)
  const close = useUIStore((state) => state.closeInlineEditor)
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
  const [prompt, setPrompt] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const models = listImageModels(providers)
  const availableModels = models.filter((item) => !item.disabled)
  const [modelKey, setModelKey] = useState('')
  const activeModel =
    models.find((item) => item.key === modelKey) ??
    availableModels[0] ??
    models[0]

  const imageWidth = Math.max(1, Math.round(current.width ?? 1))
  const imageHeight = Math.max(1, Math.round(current.height ?? 1))
  const label = titleOf(editor.operationId)

  useEffect(() => {
    if (modelKey) return
    const first = availableModels[0]?.key ?? models[0]?.key
    if (first) setModelKey(first)
  }, [availableModels, modelKey, models])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = imageWidth
    canvas.height = imageHeight
    canvas.getContext('2d')?.clearRect(0, 0, imageWidth, imageHeight)
    historyRef.current = []
    setHistorySize(0)
    setHasMask(false)
    setTool('brush')
    setBrushSize(28)
  }, [imageWidth, imageHeight])

  const pushHistory = (): void => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    historyRef.current.push(
      context.getImageData(0, 0, canvas.width, canvas.height)
    )
    if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift()
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
    const bounds = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * canvas.width,
      y:
        ((event.clientY - bounds.top) / Math.max(1, bounds.height)) *
        canvas.height
    }
  }

  const beginStroke = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (running) return
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
    context.globalAlpha = 0.55
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
      context.globalAlpha = 0.55
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
    context.globalAlpha = 0.55
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
    if (context) {
      context.globalCompositeOperation = 'source-over'
      context.globalAlpha = 1
    }
  }

  const buildMask = (): string | null => {
    const canvas = canvasRef.current
    if (!canvas || !hasMask) return null
    const output = document.createElement('canvas')
    output.width = canvas.width
    output.height = canvas.height
    const context = output.getContext('2d')
    if (!context) return null
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, output.width, output.height)
    context.globalCompositeOperation = 'destination-out'
    context.drawImage(canvas, 0, 0)
    return output.toDataURL('image/png')
  }

  const submit = (): void => {
    if (running) return
    const mask = buildMask()
    if (!mask) {
      setError('请先涂抹要编辑的区域')
      return
    }
    if (!activeModel || activeModel.disabled) {
      setError('没有可用的图片模型')
      return
    }
    setError(null)
    setRunning(true)
    try {
      const targetId = runImageOperation({
        nodeId: editor.nodeId,
        current,
        opId: editor.operationId,
        label,
        prompt: prompt.trim() || editor.prompt || '',
        modelKey: activeModel.key,
        model: activeModel.model,
        mask
      })
      if (!targetId) {
        setError('无法创建结果节点')
        return
      }
      showToast(`已提交「${label}」生成`)
      close()
    } finally {
      setRunning(false)
    }
  }

  const toolbarTop = Math.max(44, rect.top - 28 - 52)
  const panelTop = rect.top + rect.height + 10

  return createPortal(
    <>
      <div
        data-node-chrome
        role="toolbar"
        className="fixed z-[1091] flex h-9 -translate-x-1/2 items-center gap-0.5 rounded-card border border-border bg-surface-raised px-1 shadow-float"
        style={{ left: rect.left + rect.width / 2, top: toolbarTop }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <IconButton label={`退出${label}`} size="md" onClick={close}>
          <Icon name="close" size={16} />
        </IconButton>
        <span className="mx-1 h-4 w-px bg-divider" />
        <span className="flex items-center gap-1.5 px-1 text-[12px] font-medium">
          <Icon name="droplet" size={13} />
          {label}
        </span>
        <span className="mx-1 h-4 w-px bg-divider" />
        <IconButton
          label="撤销"
          size="md"
          disabled={historySize === 0}
          onClick={undo}
        >
          <Icon name="undo" size={14} />
        </IconButton>
        <IconButton
          label="清空蒙版"
          size="md"
          disabled={!hasMask}
          onClick={clear}
        >
          <Icon name="trash" size={14} />
        </IconButton>
      </div>

      <div
        className="fixed z-[1090]"
        style={{
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
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

      <div
        data-node-chrome
        className="fixed z-[1091] flex max-h-[calc(100vh-120px)] -translate-x-1/2 flex-col gap-2.5 overflow-hidden rounded-card border border-border bg-surface-raised p-3 shadow-float"
        style={{
          left: rect.left + rect.width / 2,
          top: panelTop,
          width: Math.min(560, Math.max(360, rect.width)),
          maxHeight: Math.max(160, window.innerHeight - panelTop - 16)
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ['brush', '画笔'],
              ['rect', '矩形'],
              ['eraser', '橡皮']
            ] as const
          ).map(([value, text]) => (
            <Button
              key={value}
              type="button"
              variant={tool === value ? 'secondary' : 'ghost'}
              size="none"
              className="!h-7 !rounded-md !px-2 !text-[11px] !font-normal"
              disabled={running}
              onClick={() => setTool(value)}
            >
              {text}
            </Button>
          ))}
          <label className="ml-1 inline-flex items-center gap-1.5 text-[11px] text-fg-subtle">
            笔刷
            <Input
              type="range"
              min={4}
              max={96}
              value={brushSize}
              onChange={(event) => setBrushSize(Number(event.target.value))}
              className="!h-6 !w-[100px] !border-0 !bg-transparent !px-0"
            />
            <span className="min-w-[22px] text-right">{brushSize}</span>
          </label>
        </div>

        <InlineModelField
          models={models}
          value={activeModel?.key ?? ''}
          onChange={setModelKey}
          label={`${label}模型`}
          disabled={running}
        />

        <Textarea
          value={prompt}
          placeholder={
            editor.prompt
              ? '可选：补充描述，留空使用默认提示词'
              : editor.operationId === 'erase'
                ? '可选：补充要移除的对象描述'
                : '描述希望改成什么样'
          }
          onChange={(event) => setPrompt(event.target.value)}
          className="!h-[44px] !min-h-[44px] !resize-none !text-[12px]"
          disabled={running}
        />

        <div className="text-[10.5px] text-fg-subtle">{hintOf(editor.operationId)}</div>

        {error ? (
          <div className="rounded-md bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] px-2 py-1.5 text-[11px] text-danger">
            {error}
          </div>
        ) : null}

        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 pt-2">
          <div className="text-[10.5px] text-fg-subtle">
            红色区域为编辑范围
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={close}
              disabled={running}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={submit}
              disabled={!hasMask || running || !activeModel || activeModel.disabled}
            >
              {running ? '提交中…' : '生成'}
            </Button>
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}
