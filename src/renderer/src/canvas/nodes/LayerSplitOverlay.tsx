import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject
} from 'react'
import { createPortal } from 'react-dom'
import {
  useReactFlow,
  useViewport,
  type Viewport
} from '@xyflow/react'
import { TITLE_HEIGHT } from '@shared/canvas-schema'
import type { VisionRect } from '@shared/media'
import {
  modelSupportsMode,
  type ModelDef
} from '@shared/provider-schema'
import { Icon } from '../../components/Icon'
import { Button, IconButton, Select, Textarea } from '../../components/ui'
import {
  useCanvasStore
} from '../../stores/canvas'
import { useSettingsStore } from '../../stores/settings'
import { useUIStore } from '../../stores/ui'
import {
  buildLayerSplitPrompt,
  clampAutoMax,
  layerMaxImages,
  layerSplitModeOf,
  validateLayerSource,
  type LayerSplitMode
} from './layer-split-prompt'

interface LayerSplitOverlayProps {
  open: boolean
  nodeId: string
  src: string
  imageWidth: number
  imageHeight: number
  cardRef: RefObject<HTMLDivElement | null>
  preferredModelKey?: string
  onClose: () => void
  onConfirm: (input: {
    rects: VisionRect[]
    prompt: string
    modelKey: string
    model: ModelDef
    mode: LayerSplitMode
    maxImages: number
  }) => void
}

interface Box {
  id: string
  x: number
  y: number
  width: number
  height: number
}

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

type DragMode = 'draw' | 'move' | 'nw' | 'ne' | 'se' | 'sw'

interface DragState {
  mode: DragMode
  boxId: string
  startClientX: number
  startClientY: number
  startBox: Box
  scale: number
  startPoint?: { x: number; y: number }
}

const MIN_BOX = 8
const MAX_UNDO = 20
const MAX_BOXES = 4
const CHIP_SIZE = 24

const HANDLES: Array<{
  mode: DragMode
  left: string
  top: string
  cursor: string
}> = [
  { mode: 'nw', left: '0%', top: '0%', cursor: 'nwse-resize' },
  { mode: 'ne', left: '100%', top: '0%', cursor: 'nesw-resize' },
  { mode: 'se', left: '100%', top: '100%', cursor: 'nwse-resize' },
  { mode: 'sw', left: '0%', top: '100%', cursor: 'nesw-resize' }
]

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function constrainBox(
  base: Box,
  mode: DragMode,
  dx: number,
  dy: number,
  maxWidth: number,
  maxHeight: number
): Box {
  if (mode === 'move') {
    return {
      ...base,
      x: clamp(base.x + dx, 0, Math.max(0, maxWidth - base.width)),
      y: clamp(base.y + dy, 0, Math.max(0, maxHeight - base.height))
    }
  }

  let { x, y, width, height } = base
  const minSize = MIN_BOX

  if (mode.includes('w')) {
    const nextX = clamp(base.x + dx, 0, base.x + base.width - minSize)
    width = base.width + (base.x - nextX)
    x = nextX
  }
  if (mode.includes('e')) {
    width = clamp(base.width + dx, minSize, maxWidth - base.x)
  }
  if (mode.includes('n')) {
    const nextY = clamp(base.y + dy, 0, base.y + base.height - minSize)
    height = base.height + (base.y - nextY)
    y = nextY
  }
  if (mode.includes('s')) {
    height = clamp(base.height + dy, minSize, maxHeight - base.y)
  }

  return { ...base, x, y, width, height }
}

function toRect(box: Box): VisionRect {
  return {
    x: Math.max(0, Math.round(box.x)),
    y: Math.max(0, Math.round(box.y)),
    width: Math.max(2, Math.round(box.width)),
    height: Math.max(2, Math.round(box.height))
  }
}

export function LayerSplitOverlay({
  open,
  nodeId,
  src,
  imageWidth,
  imageHeight,
  cardRef,
  preferredModelKey,
  onClose,
  onConfirm
}: LayerSplitOverlayProps) {
  const providers = useSettingsStore((state) => state.providers)
  const requestConfirm = useUIStore((state) => state.requestConfirm)
  const showToast = useUIStore((state) => state.showToast)
  const setLayerSplitActive = useUIStore((state) => state.setLayerSplitActive)
  const openSettings = useSettingsStore((state) => state.openPanel)
  const settingsOpen = useSettingsStore((state) => state.panelOpen)
  const { x: viewX, y: viewY, zoom: viewZoom } = useViewport()
  const { getViewport, setViewport } = useReactFlow()

  const [modelKey, setModelKey] = useState('')
  const [prompt, setPrompt] = useState('')
  const [autoMax, setAutoMax] = useState(4)
  const [boxes, setBoxes] = useState<Box[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [rect, setRect] = useState<Rect | null>(null)
  const [historyVersion, setHistoryVersion] = useState(0)

  const boxesRef = useRef<Box[]>([])
  const activeIdRef = useRef<string | null>(null)
  const boxSeqRef = useRef(0)
  const undoRef = useRef<Box[][]>([])
  const redoRef = useRef<Box[][]>([])
  const dragRef = useRef<DragState | null>(null)
  const confirmedRef = useRef(new Set<number>())
  const initializedRef = useRef(false)
  const prevViewportRef = useRef<Viewport | null>(null)

  const sourceWidth = Math.max(1, Math.round(imageWidth || 1))
  const sourceHeight = Math.max(1, Math.round(imageHeight || 1))

  const models = useMemo(
    () =>
      providers.flatMap((provider) =>
        provider.models
          .filter((model) => modelSupportsMode(model, 'layer'))
          .map((model) => ({
            key: `${provider.id}/${model.id}`,
            providerName: provider.name,
            model,
            disabled: !provider.hasKey,
            reason: provider.hasKey ? undefined : '未配置 API Key'
          }))
      ),
    [providers]
  )
  const availableModels = models.filter((item) => !item.disabled)
  const activeModel =
    models.find((item) => item.key === modelKey) ?? availableModels[0] ?? models[0]

  const sourceError = validateLayerSource({
    width: sourceWidth,
    height: sourceHeight,
    path: src
  })
  const rects = boxes.map(toRect)
  const mode = layerSplitModeOf(rects, prompt)
  const maxImages = layerMaxImages(mode, autoMax, rects.length)
  const canSubmit = Boolean(activeModel && !activeModel.disabled && !sourceError)

  const applyBoxes = (next: Box[], nextActiveId?: string | null): void => {
    boxesRef.current = next
    setBoxes(next)
    if (nextActiveId !== undefined) {
      activeIdRef.current = nextActiveId
      setActiveId(nextActiveId)
    } else if (
      activeIdRef.current &&
      !next.some((box) => box.id === activeIdRef.current)
    ) {
      activeIdRef.current = null
      setActiveId(null)
    }
  }

  const selectBox = (id: string | null): void => {
    activeIdRef.current = id
    setActiveId(id)
  }

  const pushUndo = (): void => {
    undoRef.current.push(boxesRef.current.map((box) => ({ ...box })))
    if (undoRef.current.length > MAX_UNDO) undoRef.current.shift()
    redoRef.current = []
    setHistoryVersion((value) => value + 1)
  }

  const undo = (): void => {
    const previous = undoRef.current.pop()
    if (previous === undefined) return
    redoRef.current.push(boxesRef.current.map((box) => ({ ...box })))
    applyBoxes(previous)
    setHistoryVersion((value) => value + 1)
  }

  const redo = (): void => {
    const next = redoRef.current.pop()
    if (next === undefined) return
    undoRef.current.push(boxesRef.current.map((box) => ({ ...box })))
    applyBoxes(next)
    setHistoryVersion((value) => value + 1)
  }

  const removeBox = (id: string | null): void => {
    if (!id) return
    if (!boxesRef.current.some((box) => box.id === id)) return
    pushUndo()
    applyBoxes(
      boxesRef.current.filter((box) => box.id !== id),
      null
    )
  }

  useEffect(() => {
    setLayerSplitActive(open)
    return () => setLayerSplitActive(false)
  }, [open, setLayerSplitActive])

  useEffect(() => {
    if (!open) return
    const element = cardRef.current
    if (!element) return
    const nodes = useCanvasStore.getState().nodes
    if (!nodes.some((entry) => entry.id === nodeId)) return

    const bounds = element.getBoundingClientRect()
    const panelHeight = 340
    const availableBottom = window.innerHeight - 16
    prevViewportRef.current = getViewport()
    if (bounds.bottom + 10 + panelHeight > availableBottom) {
      const delta = Math.min(
        bounds.bottom + 10 + panelHeight - availableBottom,
        Math.max(0, bounds.top - 44)
      )
      if (delta > 0) {
        const viewport = getViewport()
        void setViewport(
          { ...viewport, y: viewport.y - delta },
          { duration: 180 }
        )
      }
    }

    return () => {
      const previous = prevViewportRef.current
      prevViewportRef.current = null
      if (previous) void setViewport(previous, { duration: 160 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, nodeId])

  useLayoutEffect(() => {
    if (!open) return
    const sync = (): void => {
      const element = cardRef.current
      if (!element) return
      const bounds = element.getBoundingClientRect()
      setRect({
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height
      })
    }
    sync()
    const element = cardRef.current
    const observer = element ? new ResizeObserver(sync) : null
    if (element) observer?.observe(element)
    window.addEventListener('resize', sync)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', sync)
    }
  }, [open, cardRef, viewX, viewY, viewZoom])

  useEffect(() => {
    if (!open) {
      initializedRef.current = false
      return
    }
    if (initializedRef.current) return
    initializedRef.current = true
    setPrompt('')
    setAutoMax(4)
    undoRef.current = []
    redoRef.current = []
    confirmedRef.current = new Set()
    boxSeqRef.current = 0
    setHistoryVersion((value) => value + 1)
    applyBoxes([], null)
    const preferred = models.find(
      (item) => item.key === preferredModelKey && !item.disabled
    )
    const nextKey =
      preferred?.key ?? models.find((item) => !item.disabled)?.key ?? models[0]?.key ?? ''
    setModelKey(nextKey)
    // 只在打开时初始化一次；models 刷新不应重置用户输入。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open || settingsOpen) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        const target = event.target as HTMLElement | null
        if (target?.tagName === 'TEXTAREA' || target?.tagName === 'INPUT') return
        removeBox(activeIdRef.current)
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose, settingsOpen])

  useEffect(() => {
    const onMove = (event: PointerEvent): void => {
      const drag = dragRef.current
      if (!drag) return
      const dx = (event.clientX - drag.startClientX) / drag.scale
      const dy = (event.clientY - drag.startClientY) / drag.scale
      const next =
        drag.mode === 'draw' && drag.startPoint
          ? (() => {
              const x = clamp(drag.startPoint.x + dx, 0, sourceWidth)
              const y = clamp(drag.startPoint.y + dy, 0, sourceHeight)
              return {
                ...drag.startBox,
                x: Math.min(drag.startPoint.x, x),
                y: Math.min(drag.startPoint.y, y),
                width: Math.abs(x - drag.startPoint.x),
                height: Math.abs(y - drag.startPoint.y)
              }
            })()
          : constrainBox(
              drag.startBox,
              drag.mode,
              dx,
              dy,
              sourceWidth,
              sourceHeight
            )
      applyBoxes(
        boxesRef.current.map((box) => (box.id === drag.boxId ? next : box)),
        drag.boxId
      )
    }

    const onUp = (): void => {
      const drag = dragRef.current
      if (!drag) return
      dragRef.current = null
      if (drag.mode === 'draw') {
        const current = boxesRef.current.find((box) => box.id === drag.boxId)
        if (!current || current.width < MIN_BOX || current.height < MIN_BOX) {
          applyBoxes(
            boxesRef.current.filter((box) => box.id !== drag.boxId),
            null
          )
        }
      }
      setHistoryVersion((value) => value + 1)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [sourceWidth, sourceHeight])

  if (!open) return null
  if (settingsOpen) return null

  const scale = rect ? rect.width / sourceWidth : 1

  const pointFromEvent = (event: {
    clientX: number
    clientY: number
  }): { x: number; y: number } => {
    if (!rect) return { x: 0, y: 0 }
    return {
      x: clamp(
        ((event.clientX - rect.left) / Math.max(1, rect.width)) * sourceWidth,
        0,
        sourceWidth
      ),
      y: clamp(
        ((event.clientY - rect.top) / Math.max(1, rect.height)) * sourceHeight,
        0,
        sourceHeight
      )
    }
  }

  const startDraw = (event: ReactPointerEvent): void => {
    if (boxesRef.current.length >= MAX_BOXES) {
      showToast(`最多框选 ${MAX_BOXES} 个区域`, 'error')
      return
    }
    event.preventDefault()
    event.stopPropagation()
    pushUndo()
    boxSeqRef.current += 1
    const box: Box = {
      id: `box-${boxSeqRef.current}`,
      x: 0,
      y: 0,
      width: 0,
      height: 0
    }
    applyBoxes([...boxesRef.current, box], box.id)
    dragRef.current = {
      mode: 'draw',
      boxId: box.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startBox: box,
      scale: Math.max(0.0001, scale),
      startPoint: pointFromEvent(event)
    }
  }

  const startMove = (boxId: string, event: ReactPointerEvent): void => {
    const box = boxesRef.current.find((item) => item.id === boxId)
    if (!box) return
    event.preventDefault()
    event.stopPropagation()
    selectBox(boxId)
    pushUndo()
    dragRef.current = {
      mode: 'move',
      boxId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startBox: box,
      scale: Math.max(0.0001, scale)
    }
  }

  const startResize = (
    boxId: string,
    dragMode: DragMode,
    event: ReactPointerEvent
  ): void => {
    const box = boxesRef.current.find((item) => item.id === boxId)
    if (!box) return
    event.preventDefault()
    event.stopPropagation()
    selectBox(boxId)
    pushUndo()
    dragRef.current = {
      mode: dragMode,
      boxId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startBox: box,
      scale: Math.max(0.0001, scale)
    }
  }

  const submitNow = (): void => {
    if (!activeModel || activeModel.disabled) return
    const finalRects = boxes.map(toRect)
    const finalMode = layerSplitModeOf(finalRects, prompt)
    const finalMax = layerMaxImages(finalMode, autoMax, finalRects.length)
    const finalPrompt = buildLayerSplitPrompt({
      mode: finalMode,
      prompt,
      rects: finalRects,
      width: sourceWidth,
      height: sourceHeight,
      autoMax
    })
    onConfirm({
      rects: finalRects,
      prompt: finalPrompt,
      modelKey: activeModel.key,
      model: activeModel.model,
      mode: finalMode,
      maxImages: finalMax
    })
    onClose()
  }

  const submit = (): void => {
    if (!canSubmit) return
    const currentMode = layerSplitModeOf(rects, prompt)
    const currentMax = clampAutoMax(autoMax)
    if (
      currentMode === 'auto' &&
      currentMax > 4 &&
      !confirmedRef.current.has(currentMax)
    ) {
      requestConfirm({
        title: '确认自动拆分数量',
        message: `最多生成 ${currentMax + 1} 张图片（底图 + ${
          currentMax
        } 个图层），生成时间取决于模型和图片尺寸。`,
        confirmLabel: '继续',
        onConfirm: () => {
          confirmedRef.current.add(currentMax)
          submitNow()
        }
      })
      return
    }
    submitNow()
  }

  if (!rect) return null

  const toolbarTop = Math.max(44, rect.top - TITLE_HEIGHT - 52)
  const hintTop = rect.top + rect.height / 2
  const panelTop = rect.top + rect.height + 10
  const maskPath = boxes.length
    ? [
        `M0 0H${rect.width}V${rect.height}H0Z`,
        ...boxes.map((box) => {
          const x = (box.x / sourceWidth) * rect.width
          const y = (box.y / sourceHeight) * rect.height
          const width = (box.width / sourceWidth) * rect.width
          const height = (box.height / sourceHeight) * rect.height
          return `M${x} ${y}H${x + width}V${y + height}H${x}Z`
        })
      ].join(' ')
    : ''

  const root = (
    <>
      <div
        role="toolbar"
        data-node-chrome
        className="fixed z-[1091] flex h-9 -translate-x-1/2 items-center gap-0.5 rounded-card border border-border bg-surface-raised px-1 shadow-float"
        style={{ left: rect.left + rect.width / 2, top: toolbarTop }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <IconButton label="退出图层分离" size="md" onClick={onClose}>
          <Icon name="close" size={16} />
        </IconButton>
        <span className="mx-1 h-4 w-px bg-divider" />
        <span className="flex items-center gap-1.5 px-1 text-[12px] font-medium">
          <Icon name="layers" size={13} />
          图层分离
        </span>
        <span className="mx-1 h-4 w-px bg-divider" />
        <IconButton
          label="撤销框选"
          size="md"
          disabled={undoRef.current.length === 0}
          onClick={undo}
        >
          <Icon name="undo" size={14} />
        </IconButton>
        <IconButton
          label="重做框选"
          size="md"
          disabled={redoRef.current.length === 0}
          onClick={redo}
        >
          <Icon name="redo" size={14} />
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
        onPointerDown={(event) => {
          if (event.button !== 0) return
          if (event.target === event.currentTarget) startDraw(event)
        }}
      >
        {boxes.length > 0 ? (
          <div
            className="pointer-events-none absolute inset-0 overflow-hidden"
            style={{ borderRadius: 12 * viewZoom }}
          >
            <svg
              className="h-full w-full"
              viewBox={`0 0 ${rect.width} ${rect.height}`}
              preserveAspectRatio="none"
            >
              <path
                d={maskPath}
                fill="var(--selection-mask)"
                fillRule="evenodd"
              />
            </svg>
          </div>
        ) : null}

        {boxes.map((box, index) => {
          const selected = box.id === activeId
          return (
            <div
              key={box.id}
              className={`absolute ${
                selected ? 'cursor-move' : 'cursor-pointer'
              }`}
              style={{
                left: (box.x / sourceWidth) * rect.width,
                top: (box.y / sourceHeight) * rect.height,
                width: (box.width / sourceWidth) * rect.width,
                height: (box.height / sourceHeight) * rect.height,
                borderStyle: 'solid',
                borderColor: 'var(--selection-line)',
                borderWidth: 1,
                boxShadow: '0 0 0 1px var(--overlay)'
              }}
              onPointerDown={(event) => startMove(box.id, event)}
            >
              <span className="pointer-events-none absolute -left-px -top-5 flex h-[18px] min-w-[18px] items-center justify-center rounded-pill bg-surface-raised px-1 text-[10px] font-medium text-fg shadow-float">
                {index + 1}
              </span>

              {selected
                ? HANDLES.map((handle) => (
                    <div
                      key={handle.mode}
                      className="absolute h-2.5 w-2.5 rounded-[2px] border bg-surface"
                      style={{
                        borderColor: 'var(--selection-line)',
                        left: handle.left,
                        top: handle.top,
                        transform: 'translate(-50%, -50%)',
                        cursor: handle.cursor
                      }}
                      onPointerDown={(event) =>
                        startResize(box.id, handle.mode, event)
                      }
                    />
                  ))
                : null}
            </div>
          )
        })}
      </div>

      {boxes.length === 0 ? (
        <div
          data-node-chrome
          className="pointer-events-none fixed z-[1090] flex -translate-x-1/2 -translate-y-1/2 items-center rounded-pill bg-black/55 px-4 py-2 text-[13px] text-white shadow-float backdrop-blur-[4px]"
          style={{ left: rect.left + rect.width / 2, top: hintTop }}
        >
          框选你想要拆分的物体
        </div>
      ) : null}

      <div
        data-node-chrome
        className="fixed z-[1091] flex -translate-x-1/2 flex-col gap-2.5 overflow-y-auto rounded-panel border border-border bg-surface-raised p-4 shadow-float"
        style={{
          left: rect.left + rect.width / 2,
          top: panelTop,
          width: Math.min(720, Math.max(380, rect.width)),
          maxHeight: Math.max(160, window.innerHeight - panelTop - 16)
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="text-[13px] font-semibold">图层分离</div>
          {models.length === 0 ? null : (
            <Select
              size="sm"
              value={String(autoMax)}
              options={[2, 3, 4, 5, 6, 7, 8].map((value) => ({
                value: String(value),
                label:
                  mode === 'auto'
                    ? `自动 · 最多 ${value} 个主体`
                    : `${Math.max(1, boxes.length)} 个选区`,
                disabled: mode !== 'auto'
              }))}
              onChange={(value) => setAutoMax(clampAutoMax(value))}
              disabled={mode !== 'auto'}
              className="w-[116px] shrink-0"
              ariaLabel="分离数量"
            />
          )}
        </div>

        {models.length === 0 ? (
          <div className="flex items-center justify-between gap-3 rounded-card border border-border px-3 py-3">
            <div className="text-xs leading-[1.6] text-fg-muted">
              没有可用的图层分离模型。请先配置声明 `layer` 模式的模型（推荐
              Seedream 5.5 / 5.0）。
            </div>
            <Button
              type="button"
              variant="primary"
              size="sm"
              className="shrink-0"
              onClick={() => {
                onClose()
                openSettings('models')
              }}
            >
              去配置
            </Button>
          </div>
        ) : (
          <>
            <Select
              size="sm"
              value={activeModel?.key ?? ''}
              options={models.map((item) => ({
                value: item.key,
                label: `${item.providerName} · ${item.model.name}`,
                disabled: item.disabled,
                hint: item.reason
              }))}
              onChange={setModelKey}
              className="w-full"
              menuWidth="trigger"
              ariaLabel="图层分离模型"
            />

            {boxes.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {boxes.map((box, index) => {
                  const ratio = CHIP_SIZE / Math.max(1, box.width, box.height)
                  return (
                    <div
                      key={box.id}
                      className={`flex h-8 items-center gap-1.5 rounded-md border py-0.5 pl-0.5 pr-1 ${
                        box.id === activeId
                          ? 'border-border-strong bg-surface-hover'
                          : 'border-border bg-surface'
                      }`}
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="none"
                        className="flex min-w-0 items-center gap-1.5 !rounded-none !p-0 text-left hover:!bg-transparent"
                        onClick={() => selectBox(box.id)}
                      >
                        <span className="relative block h-6 w-6 shrink-0 overflow-hidden rounded-[2px] bg-canvas">
                          <img
                            src={src}
                            alt=""
                            draggable={false}
                            className="absolute max-w-none select-none"
                            style={{
                              width: sourceWidth * ratio,
                              height: sourceHeight * ratio,
                              left:
                                (CHIP_SIZE - box.width * ratio) / 2 -
                                box.x * ratio,
                              top:
                                (CHIP_SIZE - box.height * ratio) / 2 -
                                box.y * ratio
                            }}
                          />
                        </span>
                        <span className="truncate text-[11px] text-fg">
                          选区 {index + 1}
                        </span>
                      </Button>
                      <IconButton
                        label={`删除选区 ${index + 1}`}
                        size="xs"
                        onClick={(event) => {
                          event.stopPropagation()
                          removeBox(box.id)
                        }}
                      >
                        <Icon name="close" size={10} />
                      </IconButton>
                    </div>
                  )
                })}
                {boxes.length < MAX_BOXES ? (
                  <span className="text-[11px] text-fg-subtle">
                    可继续框选，最多 {MAX_BOXES} 个
                  </span>
                ) : null}
              </div>
            ) : null}

            <Textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="描述或框选希望拆分的图层，留空将自动识别并拆分"
              rows={3}
              className="!min-h-[84px] !resize-none !rounded-card !bg-canvas !text-xs"
            />

            {mode === 'box-prompt' ? (
              <div className="text-[11px] text-fg-subtle">
                提示词用于描述框选主体；bbox 优先。
              </div>
            ) : null}
            {sourceError ? (
              <div className="text-[11px] text-danger">{sourceError}</div>
            ) : null}
            {activeModel?.disabled ? (
              <div className="text-[11px] text-danger">
                当前模型未配置 API Key，请先在设置中补全。
              </div>
            ) : null}

            <div className="flex items-center gap-2 pt-0.5">
              <Button
                type="button"
                variant="secondary"
                size="md"
                className="flex-1"
                onClick={onClose}
              >
                取消
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                className="flex-[1.35]"
                disabled={!canSubmit}
                onClick={submit}
              >
                拆分
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  )

  return createPortal(root, document.body)
}
