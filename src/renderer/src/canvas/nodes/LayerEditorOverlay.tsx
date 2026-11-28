import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject
} from 'react'
import { useReactFlow, useViewport } from '@xyflow/react'
import { TITLE_HEIGHT, type OutputRef } from '@shared/canvas-schema'
import { Icon } from '../../components/Icon'
import { IconButton } from '../../components/ui'
import { useCanvasStore } from '../../stores/canvas'
import { useUIStore } from '../../stores/ui'
import { assetUrl } from '../../lib/asset-url'
import { LayerStackPreview } from './LayerStackPreview'
import type { LayerGroup } from './layer-compose'

interface LayerEditorOverlayProps {
  nodeId: string
  group: LayerGroup
  activeLayerId: string | null
  onActiveLayerChange: (id: string | null) => void
  cardRef: RefObject<HTMLDivElement | null>
}

type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se'

interface LayerTransform {
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  flipX?: boolean
  flipY?: boolean
}

interface DragState {
  layerId: string
  mode: DragMode
  startClientX: number
  startClientY: number
  startTransform: LayerTransform
  scale: number
  contentLeft: number
  contentTop: number
  zoom: number
}

const HANDLES: Array<{ mode: DragMode; left: string; top: string; cursor: string }> = [
  { mode: 'nw', left: '0%', top: '0%', cursor: 'nwse-resize' },
  { mode: 'ne', left: '100%', top: '0%', cursor: 'nesw-resize' },
  { mode: 'se', left: '100%', top: '100%', cursor: 'nwse-resize' },
  { mode: 'sw', left: '0%', top: '100%', cursor: 'nesw-resize' }
]

function resizeTransform(
  start: LayerTransform,
  mode: DragMode,
  dx: number,
  dy: number
): LayerTransform {
  const ratio = start.width / Math.max(1, start.height)
  let width = start.width
  if (mode.includes('e')) width = start.width + dx
  if (mode.includes('w')) width = start.width - dx
  width = Math.max(8, width)
  const height = Math.max(8, width / ratio)
  return {
    ...start,
    x: mode.includes('w') ? start.x + start.width - width : start.x,
    y: mode.includes('n') ? start.y + start.height - height : start.y,
    width,
    height
  }
}

export function LayerEditorOverlay({
  nodeId,
  group,
  activeLayerId,
  onActiveLayerChange,
  cardRef
}: LayerEditorOverlayProps) {
  const { screenToFlowPosition } = useReactFlow()
  const { zoom } = useViewport()
  const showToast = useUIStore((state) => state.showToast)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [detachHint, setDetachHint] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const lastTransformRef = useRef<LayerTransform | null>(null)

  useEffect(() => {
    const element = wrapperRef.current
    if (!element) return
    const update = (): void =>
      setSize({
        width: element.clientWidth,
        height: element.clientHeight
      })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const onMove = (event: PointerEvent): void => {
      const drag = dragRef.current
      if (!drag) return
      const dx = (event.clientX - drag.startClientX) / drag.scale
      const dy = (event.clientY - drag.startClientY) / drag.scale
      const next =
        drag.mode === 'move'
          ? {
              ...drag.startTransform,
              x: drag.startTransform.x + dx,
              y: drag.startTransform.y + dy
            }
          : resizeTransform(drag.startTransform, drag.mode, dx, dy)
      lastTransformRef.current = next
      useCanvasStore
        .getState()
        .updateOutputLayer(
          nodeId,
          drag.layerId,
          { layerTransform: next },
          { history: false }
        )

      if (drag.mode === 'move') {
        const wrapper = wrapperRef.current
        const card = cardRef.current
        if (!wrapper || !card) return
        const wrapperRect = wrapper.getBoundingClientRect()
        const cardRect = card.getBoundingClientRect()
        const centerX =
          wrapperRect.left + drag.contentLeft + (next.x + next.width / 2) * drag.scale
        const centerY =
          wrapperRect.top + drag.contentTop + (next.y + next.height / 2) * drag.scale
        setDetachHint(
          centerX < cardRect.left ||
            centerX > cardRect.right ||
            centerY < cardRect.top ||
            centerY > cardRect.bottom
        )
      }
    }

    const onUp = (event: PointerEvent): void => {
      const drag = dragRef.current
      dragRef.current = null
      setDetachHint(false)
      if (!drag) return

      if (drag.mode === 'move') {
        const wrapper = wrapperRef.current
        const card = cardRef.current
        const transform = lastTransformRef.current
        if (wrapper && card && transform) {
          const wrapperRect = wrapper.getBoundingClientRect()
          const cardRect = card.getBoundingClientRect()
          const centerX =
            wrapperRect.left +
            drag.contentLeft +
            (transform.x + transform.width / 2) * drag.scale
          const centerY =
            wrapperRect.top +
            drag.contentTop +
            (transform.y + transform.height / 2) * drag.scale
          const outside =
            centerX < cardRect.left ||
            centerX > cardRect.right ||
            centerY < cardRect.top ||
            centerY > cardRect.bottom
          if (outside) {
            const flow = screenToFlowPosition({
              x: event.clientX,
              y: event.clientY
            })
            const width = (transform.width * drag.scale) / drag.zoom
            const height = (transform.height * drag.scale) / drag.zoom
            const detached = useCanvasStore.getState().detachLayer(
              nodeId,
              drag.layerId,
              {
                x: flow.x - width / 2,
                y: flow.y - TITLE_HEIGHT - height / 2
              },
              { width, height },
              drag.startTransform
            )
            if (detached) {
              onActiveLayerChange(null)
              showToast('已分离为独立图片')
            }
          }
        }
      }
      lastTransformRef.current = null
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [cardRef, nodeId, screenToFlowPosition, showToast])

  const scale =
    size.width > 0 && size.height > 0
      ? Math.min(size.width / group.width, size.height / group.height)
      : 0
  const contentWidth = group.width * scale
  const contentHeight = group.height * scale
  const contentLeft = (size.width - contentWidth) / 2
  const contentTop = (size.height - contentHeight) / 2

  const startDrag = (
    layer: OutputRef,
    mode: DragMode,
    event: ReactPointerEvent
  ): void => {
    if (!layer.layerTransform) return
    if (layer.layerLocked) {
      showToast('图层已锁定，先在图层列表解锁')
      return
    }
    event.preventDefault()
    event.stopPropagation()
    useCanvasStore.getState().pushHistory()
    onActiveLayerChange(layer.id)
    lastTransformRef.current = layer.layerTransform
    dragRef.current = {
      layerId: layer.id,
      mode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startTransform: layer.layerTransform,
      scale: Math.max(0.0001, scale),
      contentLeft,
      contentTop,
      zoom
    }
  }

  const visibleLayers = group.layers.filter(
    (layer) =>
      layer.layerAttached !== false &&
      layer.layerVisible !== false &&
      layer.layerTransform
  )
  const activeLayer =
    visibleLayers.find((layer) => layer.id === activeLayerId) ?? null
  const activeTransform = activeLayer?.layerTransform ?? null
  const layerToolbarTop = activeTransform
    ? contentTop + activeTransform.y * scale - 46
    : 0

  const updateActiveTransform = (
    patch: Partial<LayerTransform>
  ): void => {
    if (!activeLayer?.layerTransform) return
    useCanvasStore.getState().updateOutputLayer(nodeId, activeLayer.id, {
      layerTransform: { ...activeLayer.layerTransform, ...patch }
    })
  }

  const rotateActiveLayer = (): void => {
    const transform = activeLayer?.layerTransform
    if (!transform) return
    const rotation = (((transform.rotation ?? 0) + 90) % 360) as number
    const centerX = transform.x + transform.width / 2
    const centerY = transform.y + transform.height / 2
    const width = transform.height
    const height = transform.width
    updateActiveTransform({
      rotation,
      x: centerX - width / 2,
      y: centerY - height / 2,
      width,
      height
    })
  }

  const flipActiveLayer = (axis: 'x' | 'y'): void => {
    const transform = activeLayer?.layerTransform
    if (!transform) return
    updateActiveTransform(
      axis === 'x' ? { flipX: !transform.flipX } : { flipY: !transform.flipY }
    )
  }

  const downloadActiveLayer = async (): Promise<void> => {
    if (!activeLayer) return
    const name = activeLayer.layer?.name?.trim() || '图层'
    const result = await window.api.export.asset(
      activeLayer.path,
      name,
      activeLayer.scope
    )
    if (result.ok) {
      showToast(`已导出：${result.path ?? ''}`)
    } else if (!result.canceled) {
      showToast(result.error ?? '导出失败', 'error')
    }
  }

  return (
    <div className="relative h-full w-full">
      <LayerStackPreview group={{ ...group, layers: [] }} />

      <div ref={wrapperRef} className="absolute inset-0 z-[5]">
        {scale > 0
          ? visibleLayers.map((layer) => {
              const transform = layer.layerTransform
              if (!transform) return null
              const selected = layer.id === activeLayerId
              const rotation = transform.rotation ?? 0
              const swapped = rotation % 180 !== 0
              const drawWidth = swapped ? transform.height : transform.width
              const drawHeight = swapped ? transform.width : transform.height
              const drawLeft =
                transform.x + (transform.width - drawWidth) / 2
              const drawTop =
                transform.y + (transform.height - drawHeight) / 2
              return (
                <Fragment key={layer.id}>
                  <img
                    src={assetUrl(layer.path, layer.scope)}
                    alt=""
                    draggable={false}
                    className="pointer-events-none absolute max-w-none select-none"
                    style={{
                      left: contentLeft + drawLeft * scale,
                      top: contentTop + drawTop * scale,
                      width: drawWidth * scale,
                      height: drawHeight * scale,
                      transform: `rotate(${rotation}deg) scale(${
                        transform.flipX ? -1 : 1
                      }, ${transform.flipY ? -1 : 1})`,
                      transformOrigin: 'center'
                    }}
                  />
                  <div
                    className={`nodrag nopan absolute ${
                      selected
                        ? 'border border-fg'
                        : 'border border-transparent hover:border-border-strong'
                    }`}
                    style={{
                      left: contentLeft + transform.x * scale,
                      top: contentTop + transform.y * scale,
                      width: transform.width * scale,
                      height: transform.height * scale,
                      cursor: layer.layerLocked ? 'not-allowed' : 'move'
                    }}
                    onPointerDown={(event) => startDrag(layer, 'move', event)}
                  >
                    {selected
                      ? HANDLES.map((handle) => (
                          <div
                            key={handle.mode}
                            className="absolute h-2.5 w-2.5 rounded-[2px] border border-fg bg-surface"
                            style={{
                              left: handle.left,
                              top: handle.top,
                              transform: 'translate(-50%, -50%)',
                              cursor: handle.cursor
                            }}
                            onPointerDown={(event) =>
                              startDrag(layer, handle.mode, event)
                            }
                          />
                        ))
                      : null}
                  </div>
                </Fragment>
              )
            })
          : null}

        {activeTransform ? (
          <div
            data-node-chrome
            className="nodrag nopan absolute z-[4] flex h-9 [translate:-50%_0] [transform:scale(var(--canvas-zoom-inverse,1))] [transform-origin:top_center] items-center gap-0.5 rounded-card border border-border bg-surface-raised px-1 shadow-float"
            style={{
              left:
                contentLeft +
                (activeTransform.x + activeTransform.width / 2) * scale,
              top: layerToolbarTop
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <IconButton label="旋转 90°" size="md" onClick={rotateActiveLayer}>
              <Icon name="rotate" size={14} />
            </IconButton>
            <IconButton
              label="水平翻转"
              size="md"
              onClick={() => flipActiveLayer('x')}
            >
              <Icon name="flip-horizontal" size={14} />
            </IconButton>
            <IconButton
              label="垂直翻转"
              size="md"
              onClick={() => flipActiveLayer('y')}
            >
              <Icon name="flip-vertical" size={14} />
            </IconButton>
            <span className="mx-1 h-4 w-px bg-divider" />
            <IconButton
              label="下载图层"
              size="md"
              onClick={() => void downloadActiveLayer()}
            >
              <Icon name="download" size={14} />
            </IconButton>
          </div>
        ) : null}

        {detachHint ? (
          <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
            <div className="rounded-pill bg-accent px-3 py-1 text-[11px] text-accent-text shadow-float">
              松手成为独立图片
            </div>
          </div>
        ) : null}

        {activeLayer?.layerTransform ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-center">
            <div className="rounded-pill bg-black/50 px-2 py-0.5 text-[9.5px] text-white/80">
              {Math.round(activeLayer.layerTransform.width)} ×{' '}
              {Math.round(activeLayer.layerTransform.height)}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
