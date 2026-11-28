import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type RefObject
} from 'react'
import { createPortal } from 'react-dom'
import { useViewport } from '@xyflow/react'
import { TITLE_HEIGHT, type OutputRef } from '@shared/canvas-schema'
import { Icon } from '../../components/Icon'
import { Button, IconButton } from '../../components/ui'
import { useSettingsStore } from '../../stores/settings'
import { useUIStore, type InlineEditorState } from '../../stores/ui'
import { executeNodeOperation } from './node-operation-runner'
import { useBoxEditor, type Box } from './useBoxEditor'
import { InlineGridEditor } from './InlineGridEditor'
import { InlineMaskEditor } from './InlineMaskEditor'
import { InlineMotionEditor } from './InlineMotionEditor'
import { InlineOutpaintEditor } from './InlineOutpaintEditor'
import { InlinePanelEditor } from './InlinePanelEditor'
import { InlineSphereEditor } from './InlineSphereEditor'
import { InlineTimelineEditor } from './InlineTimelineEditor'

interface NodeInlineEditorHostProps {
  nodeId: string
  current: OutputRef
  cardRef: RefObject<HTMLDivElement | null>
}

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

const CROP_RATIOS = ['free', '1:1', '4:3', '3:2', '16:9', '9:16', '3:4', '2:3']
const VIDEO_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9']

function ratioValue(ratio: string | undefined): number | null {
  if (!ratio || ratio === 'free') return null
  const [width, height] = ratio.split(':').map(Number)
  if (!width || !height) return null
  return width / height
}

function initialBox(
  width: number,
  height: number,
  ratio: string | undefined,
  operationId: string
): Box {
  if (operationId === 'subtitle') {
    return {
      x: width * 0.1,
      y: height * 0.72,
      width: width * 0.8,
      height: height * 0.16
    }
  }

  let boxWidth = width * 0.8
  let boxHeight = height * 0.8
  const target = ratioValue(ratio)
  if (target) {
    if (boxWidth / boxHeight > target) boxWidth = boxHeight * target
    else boxHeight = boxWidth / target
  }
  return {
    x: (width - boxWidth) / 2,
    y: (height - boxHeight) / 2,
    width: boxWidth,
    height: boxHeight
  }
}

function titleOf(operationId: string): string {
  if (operationId === 'crop') return '裁剪'
  if (operationId === 'cutout') return '框选抠图'
  if (operationId === 'subtitle') return '框选去字幕'
  if (operationId === 'video-crop') return '画面裁切'
  return '编辑'
}

export function NodeInlineEditorHost({
  nodeId,
  current,
  cardRef
}: NodeInlineEditorHostProps) {
  const editor = useUIStore((state) => state.inlineEditor)
  const close = useUIStore((state) => state.closeInlineEditor)
  const showToast = useUIStore((state) => state.showToast)
  const settingsOpen = useSettingsStore((state) => state.panelOpen)
  const { x: viewX, y: viewY, zoom: viewZoom } = useViewport()
  const [rect, setRect] = useState<Rect | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const active = editor?.nodeId === nodeId ? editor : null
  const operationId = active?.operationId ?? 'crop'
  const sourceWidth = Math.max(1, Math.round(current.width ?? 1))
  const sourceHeight = Math.max(1, Math.round(current.height ?? 1))

  useLayoutEffect(() => {
    if (!active) return
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
  }, [active, cardRef, viewX, viewY, viewZoom])

  useEffect(() => {
    if (!active) {
      setError(null)
      setRunning(false)
    }
  }, [active])

  if (!active || !rect || settingsOpen) return null

  if (active.mode === 'mask') {
    return (
      <InlineMaskEditor
        editor={active}
        current={current}
        rect={rect}
      />
    )
  }

  if (active.mode === 'outpaint') {
    return (
      <InlineOutpaintEditor
        editor={active}
        current={current}
        rect={rect}
      />
    )
  }

  if (active.mode === 'sphere') {
    return (
      <InlineSphereEditor
        editor={active}
        current={current}
        rect={rect}
      />
    )
  }

  if (active.operationId === 'motion-capture') {
    return (
      <InlineMotionEditor
        editor={active}
        current={current}
        rect={rect}
      />
    )
  }

  if (active.mode === 'panel') {
    return (
      <InlinePanelEditor
        editor={active}
        current={current}
        rect={rect}
      />
    )
  }

  if (active.mode === 'timeline') {
    return (
      <InlineTimelineEditor
        editor={active}
        current={current}
        rect={rect}
      />
    )
  }

  if (active.mode === 'grid') {
    return (
      <InlineGridEditor
        editor={active}
        current={current}
        rect={rect}
      />
    )
  }

  const displayWidth = Math.max(1, rect.width)
  const displayHeight = Math.max(1, rect.height)
  const ratioOptions =
    operationId === 'video-crop' ? VIDEO_RATIOS : CROP_RATIOS
  const ratio = active.ratio ?? (operationId === 'video-crop' ? '16:9' : 'free')

  return createPortal(
    <BoxEditor
      editor={active}
      rect={rect}
      displayWidth={displayWidth}
      displayHeight={displayHeight}
      sourceWidth={sourceWidth}
      sourceHeight={sourceHeight}
      operationId={operationId}
      ratio={ratio}
      ratioOptions={ratioOptions}
      running={running}
      error={error}
      onError={setError}
      onRunning={setRunning}
      onClose={close}
      onSubmitted={() => {
        close()
        showToast('已提交处理')
      }}
    />,
    document.body
  )
}

interface BoxEditorProps {
  editor: InlineEditorState
  rect: Rect
  displayWidth: number
  displayHeight: number
  sourceWidth: number
  sourceHeight: number
  operationId: string
  ratio: string
  ratioOptions: string[]
  running: boolean
  error: string | null
  onError: (message: string | null) => void
  onRunning: (running: boolean) => void
  onClose: () => void
  onSubmitted: () => void
}

function BoxEditor({
  editor,
  rect,
  displayWidth,
  displayHeight,
  sourceWidth,
  sourceHeight,
  operationId,
  ratio,
  ratioOptions,
  running,
  error,
  onError,
  onRunning,
  onClose,
  onSubmitted
}: BoxEditorProps) {
  const [activeRatio, setActiveRatio] = useState(ratio)
  const [resetKey, setResetKey] = useState(0)
  const { box, startDrag } = useBoxEditor(
    displayWidth,
    displayHeight,
    initialBox(displayWidth, displayHeight, activeRatio, operationId),
    `${displayWidth}x${displayHeight}:${activeRatio}:${editor.itemId ?? ''}:${resetKey}`
  )

  const sourceRect = useMemo(
    () => ({
      x: Math.round((box.x / displayWidth) * sourceWidth),
      y: Math.round((box.y / displayHeight) * sourceHeight),
      width: Math.max(1, Math.round((box.width / displayWidth) * sourceWidth)),
      height: Math.max(1, Math.round((box.height / displayHeight) * sourceHeight))
    }),
    [box, displayWidth, displayHeight, sourceWidth, sourceHeight]
  )

  const toolbarTop = Math.max(44, rect.top - TITLE_HEIGHT - 52)
  const panelTop = rect.top + rect.height + 10
  const label = titleOf(operationId)
  const canSubmit = !running && sourceRect.width > 1 && sourceRect.height > 1

  const reset = (): void => {
    setResetKey((value) => value + 1)
  }

  const submit = async (): Promise<void> => {
    if (!canSubmit) return
    onError(null)
    onRunning(true)

    const request =
      operationId === 'crop'
        ? {
            nodeId: editor.nodeId,
            operationId: 'crop',
            itemId: 'free',
            params: { rect: sourceRect }
          }
        : operationId === 'cutout'
          ? {
              nodeId: editor.nodeId,
              operationId: 'cutout',
              itemId: 'box',
              params: { rect: sourceRect }
            }
          : operationId === 'subtitle'
            ? {
                nodeId: editor.nodeId,
                operationId: 'subtitle',
                itemId: 'box',
                params: { rect: sourceRect }
              }
            : {
                nodeId: editor.nodeId,
                operationId: 'video-crop',
                itemId: 'custom',
                params: { ratio: activeRatio }
              }

    try {
      const result = await executeNodeOperation(request, {
        effect: (effect) => {
          const message =
            effect.type === 'crop-dialog' ||
            effect.type === 'box-dialog' ||
            effect.type === 'video-crop-dialog'
              ? '当前操作仍需补充参数，请重试'
              : null
          if (message) onError(message)
        },
        toast: (message, tone) => {
          if (tone === 'error') onError(message)
        },
        setRunning: onRunning
      })
      if (!result.ok) {
        onError(result.error ?? '处理失败')
        return
      }
      onSubmitted()
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      onRunning(false)
    }
  }

  return (
    <>
      <div
        data-node-chrome
        role="toolbar"
        className="fixed z-[1091] flex h-9 -translate-x-1/2 items-center gap-0.5 rounded-card border border-border bg-surface-raised px-1 shadow-float"
        style={{ left: rect.left + rect.width / 2, top: toolbarTop }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <IconButton label={`退出${label}`} size="md" onClick={onClose}>
          <Icon name="close" size={16} />
        </IconButton>
        <span className="mx-1 h-4 w-px bg-divider" />
        <span className="flex items-center gap-1.5 px-1 text-[12px] font-medium">
          <Icon name="crop" size={13} />
          {label}
        </span>
        <span className="mx-1 h-4 w-px bg-divider" />
        <IconButton label="重置选区" size="md" onClick={reset}>
          <Icon name="undo" size={14} />
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
        <div
          className="absolute border"
          style={{
            left: box.x,
            top: box.y,
            width: box.width,
            height: box.height,
            borderColor: 'var(--selection-line)',
            boxShadow: '0 0 0 1px var(--overlay)',
            borderRadius: 2
          }}
          onPointerDown={(event) => {
            event.stopPropagation()
            startDrag('move')(event)
          }}
        >
          {[
            ['nw', 0, 0],
            ['ne', 1, 0],
            ['se', 1, 1],
            ['sw', 0, 1]
          ].map(([mode, x, y]) => (
            <div
              key={mode}
              className="absolute h-2.5 w-2.5 rounded-[2px] border bg-surface"
              style={{
                left: `${Number(x) * 100}%`,
                top: `${Number(y) * 100}%`,
                transform: 'translate(-50%, -50%)',
                borderColor: 'var(--selection-line)',
                cursor: `${mode}-resize`
              }}
              onPointerDown={(event) => {
                event.stopPropagation()
                startDrag(mode as 'nw' | 'ne' | 'se' | 'sw')(event)
              }}
            />
          ))}
        </div>
      </div>

      <div
        data-node-chrome
        className="fixed z-[1091] flex -translate-x-1/2 flex-col gap-2.5 rounded-card border border-border bg-surface-raised p-3 shadow-float"
        style={{
          left: rect.left + rect.width / 2,
          top: panelTop,
          width: Math.min(560, Math.max(360, rect.width)),
          maxHeight: Math.max(160, window.innerHeight - panelTop - 16)
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="text-[12px] font-medium">{label}</div>
          <div className="text-[11px] text-fg-subtle">
            {sourceRect.width} × {sourceRect.height} px
          </div>
        </div>

        {operationId === 'crop' || operationId === 'video-crop' ? (
          <div className="flex flex-wrap items-center gap-1">
            {ratioOptions.map((entry) => (
              <Button
                key={entry}
                type="button"
                variant={entry === activeRatio ? 'secondary' : 'ghost'}
                size="none"
                className="!h-7 !rounded-md !px-2 !text-[11px] !font-normal"
                onClick={() => setActiveRatio(entry)}
                disabled={running}
              >
                {entry === 'free' ? '自由' : entry}
              </Button>
            ))}
          </div>
        ) : null}

        {operationId === 'video-crop' ? (
          <div className="text-[11px] leading-[1.6] text-fg-subtle">
            当前按画面比例居中裁切；拖动框暂不改变裁切位置。
          </div>
        ) : null}

        {error ? (
          <div className="rounded-md bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] px-2 py-1.5 text-[11px] text-danger">
            {error}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          <div className="text-[10.5px] text-fg-subtle">
            {operationId === 'cutout'
              ? '框住要保留的物体'
              : operationId === 'subtitle'
                ? '框住字幕区域'
                : '拖动框或角点调整范围'}
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={running}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => void submit()}
              disabled={!canSubmit}
            >
              {running
                ? '处理中…'
                : operationId === 'crop'
                  ? '裁剪'
                  : operationId === 'cutout'
                    ? '开始抠图'
                    : operationId === 'subtitle'
                      ? '开始去字幕'
                      : '裁切'}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
