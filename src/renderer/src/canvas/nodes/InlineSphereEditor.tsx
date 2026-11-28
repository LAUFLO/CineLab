import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { OutputRef } from '@shared/canvas-schema'
import { Icon } from '../../components/Icon'
import { Button, IconButton, Input } from '../../components/ui'
import { useSettingsStore } from '../../stores/settings'
import { useUIStore, type InlineEditorState } from '../../stores/ui'
import { listImageModels, runImageOperation } from './inline-generation'
import { InlineModelField } from './InlineModelField'

interface InlineSphereEditorProps {
  editor: InlineEditorState
  current: OutputRef
  rect: { left: number; top: number; width: number; height: number }
}

type SphereMode = 'light' | 'camera'
type Temperature = 'warm' | 'neutral' | 'cool'
type ShotSize = 'close' | 'medium' | 'wide'

const CENTER = 90
const RADIUS = 74
const DEG = Math.PI / 180

const AZIMUTH_LABELS = [
  '正面',
  '右前 45°',
  '右侧',
  '右后 135°',
  '背面',
  '左后 225°',
  '左侧',
  '左前 315°'
]

function azimuthLabel(angle: number): string {
  const normalized = ((angle % 360) + 360) % 360
  return AZIMUTH_LABELS[Math.round(normalized / 45) % 8]
}

function elevationLabel(angle: number): string {
  if (angle > 25) return '高位俯光'
  if (angle < -25) return '低位底光'
  return '平位光'
}

function cameraElevationLabel(angle: number): string {
  if (angle > 25) return '俯视机位'
  if (angle < -25) return '仰视机位'
  return '平视机位'
}

function presetAngles(
  mode: SphereMode,
  itemId: string | undefined
): { azimuth: number; elevation: number } {
  if (mode === 'light') {
    if (itemId === 'top') return { azimuth: 0, elevation: 80 }
    if (itemId === 'left') return { azimuth: -90, elevation: 0 }
    if (itemId === 'right') return { azimuth: 90, elevation: 0 }
    if (itemId === 'back') return { azimuth: 180, elevation: 0 }
    if (itemId === 'golden') return { azimuth: 45, elevation: 20 }
    if (itemId === 'blue') return { azimuth: -45, elevation: 20 }
    return { azimuth: 45, elevation: 30 }
  }
  if (itemId === 'front') return { azimuth: 0, elevation: 0 }
  if (itemId === 'left') return { azimuth: -45, elevation: 0 }
  if (itemId === 'right') return { azimuth: 45, elevation: 0 }
  if (itemId === 'high') return { azimuth: 0, elevation: 45 }
  if (itemId === 'low') return { azimuth: 0, elevation: -45 }
  if (itemId === 'back') return { azimuth: 180, elevation: 0 }
  return { azimuth: 45, elevation: 30 }
}

export function InlineSphereEditor({
  editor,
  current,
  rect
}: InlineSphereEditorProps) {
  const mode: SphereMode = editor.operationId === 'relight' ? 'light' : 'camera'
  const label = mode === 'light' ? '打光' : '多角度'
  const providers = useSettingsStore((state) => state.providers)
  const showToast = useUIStore((state) => state.showToast)
  const close = useUIStore((state) => state.closeInlineEditor)
  const models = listImageModels(providers)
  const availableModels = models.filter((item) => !item.disabled)
  const initial = presetAngles(mode, editor.itemId)
  const [azimuth, setAzimuth] = useState(initial.azimuth)
  const [elevation, setElevation] = useState(initial.elevation)
  const [brightness, setBrightness] = useState(70)
  const [temperature, setTemperature] = useState<Temperature>('neutral')
  const [shotSize, setShotSize] = useState<ShotSize>('medium')
  const [modelKey, setModelKey] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const activeModel =
    models.find((item) => item.key === modelKey) ??
    availableModels[0] ??
    models[0]

  useEffect(() => {
    const first = availableModels[0]?.key ?? models[0]?.key
    if (!modelKey && first) setModelKey(first)
  }, [availableModels, modelKey, models])

  const prompt = useMemo(() => {
    if (mode === 'light') {
      const temperatureLabel =
        temperature === 'warm'
          ? '暖色温'
          : temperature === 'cool'
            ? '冷色温'
            : '中性色温'
      return `保持画面内容、人物身份、服装和构图不变，只重新打光：主光水平方位${azimuthLabel(
        azimuth
      )}，${elevationLabel(elevation)}，亮度 ${brightness}%，${temperatureLabel}。形成自然的高光、阴影和轮廓光，皮肤质感真实，不要改变人物身份，不要文字、不要水印。`
    }
    const shotLabel =
      shotSize === 'close' ? '特写' : shotSize === 'wide' ? '全景' : '中景'
    return `保持同一角色、服装、发型、场景、光线和画风不变，只改变机位：水平方位${azimuthLabel(
      azimuth
    )}，${cameraElevationLabel(elevation)}，景别${shotLabel}。输出单张画面，不要分屏、不要文字、不要水印。`
  }, [azimuth, brightness, elevation, mode, shotSize, temperature])

  const updateFromPointer = (
    clientX: number,
    clientY: number,
    bounds: DOMRect
  ): void => {
    const nx = (clientX - bounds.left - bounds.width / 2) / (bounds.width / 2)
    const ny = (clientY - bounds.top - bounds.height / 2) / (bounds.height / 2)
    const length = Math.hypot(nx, ny)
    const x = length > 1 ? nx / length : nx
    const y = length > 1 ? ny / length : ny
    const depth = Math.sqrt(Math.max(0, 1 - x * x - y * y))
    setAzimuth(Math.atan2(x, depth) / DEG)
    setElevation(-Math.asin(Math.max(-1, Math.min(1, y))) / DEG)
  }

  const point = {
    x: CENTER + Math.cos(elevation * DEG) * Math.sin(azimuth * DEG) * RADIUS,
    y: CENTER - Math.sin(elevation * DEG) * RADIUS
  }

  const submit = (): void => {
    if (running) return
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
        prompt,
        modelKey: activeModel.key,
        model: activeModel.model
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
  const lightX = rect.left + rect.width / 2 + Math.sin(azimuth * DEG) * rect.width * 0.32
  const lightY = rect.top + rect.height / 2 - Math.sin(elevation * DEG) * rect.height * 0.32

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
          <Icon name="sun" size={13} />
          {label}
        </span>
        <span className="mx-1 h-4 w-px bg-divider" />
        <span className="px-1 text-[11px] text-fg-subtle">
          {azimuthLabel(azimuth)} · {Math.round(elevation)}°
        </span>
      </div>

      {mode === 'light' ? (
        <div
          className="pointer-events-none fixed z-[1089] h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            left: lightX,
            top: lightY,
            background:
              'radial-gradient(circle, color-mix(in srgb, var(--accent) 28%, transparent) 0%, transparent 70%)'
          }}
        />
      ) : null}

      <div
        data-node-chrome
        className="fixed z-[1091] flex max-h-[calc(100vh-120px)] -translate-x-1/2 flex-col gap-2 overflow-hidden rounded-card border border-border bg-surface-raised p-3 shadow-float"
        style={{
          left: rect.left + rect.width / 2,
          top: panelTop,
          width: Math.min(480, Math.max(360, rect.width)),
          maxHeight: Math.max(180, window.innerHeight - panelTop - 16)
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        <div className="flex items-start gap-3">
          <svg
            viewBox="0 0 180 180"
            className="h-[150px] w-[150px] shrink-0 cursor-grab touch-none active:cursor-grabbing"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId)
              setDragging(true)
              updateFromPointer(
                event.clientX,
                event.clientY,
                event.currentTarget.getBoundingClientRect()
              )
            }}
            onPointerMove={(event) => {
              if (!dragging) return
              updateFromPointer(
                event.clientX,
                event.clientY,
                event.currentTarget.getBoundingClientRect()
              )
            }}
            onPointerUp={() => setDragging(false)}
            onPointerCancel={() => setDragging(false)}
          >
            <defs>
              <radialGradient id="inline-sphere-fill" cx="35%" cy="30%">
                <stop offset="0%" stopColor="var(--surface-hover)" />
                <stop offset="100%" stopColor="var(--canvas-bg)" />
              </radialGradient>
            </defs>
            <circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="url(#inline-sphere-fill)"
              stroke="var(--border-strong)"
            />
            <ellipse
              cx={CENTER}
              cy={CENTER}
              rx={RADIUS}
              ry={26}
              fill="none"
              stroke="var(--border)"
            />
            <ellipse
              cx={CENTER}
              cy={CENTER}
              rx={26}
              ry={RADIUS}
              fill="none"
              stroke="var(--border)"
            />
            <line
              x1={CENTER - RADIUS}
              y1={CENTER}
              x2={CENTER + RADIUS}
              y2={CENTER}
              stroke="var(--divider)"
            />
            <line
              x1={CENTER}
              y1={CENTER - RADIUS}
              x2={CENTER}
              y2={CENTER + RADIUS}
              stroke="var(--divider)"
            />
            <circle
              cx={point.x}
              cy={point.y}
              r="8"
              fill="var(--accent)"
              stroke="var(--surface)"
              strokeWidth="2"
            />
          </svg>

          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="text-[12px] font-medium">
              {mode === 'light' ? '光源方向' : '机位方向'}
            </div>
            <div className="text-[11px] leading-[1.6] text-fg-subtle">
              {azimuthLabel(azimuth)} · {Math.round(elevation)}° ·{' '}
              {mode === 'light'
                ? elevationLabel(elevation)
                : cameraElevationLabel(elevation)}
            </div>
            {mode === 'light' ? (
              <>
                <label className="flex items-center gap-2 text-[11px] text-fg-subtle">
                  强度
                  <Input
                    type="range"
                    min={10}
                    max={100}
                    value={brightness}
                    onChange={(event) => setBrightness(Number(event.target.value))}
                    className="!h-6 min-w-0 flex-1 !border-0 !bg-transparent !px-0"
                  />
                  <span className="w-7 text-right">{brightness}</span>
                </label>
                <div className="flex items-center gap-1">
                  {(
                    [
                      ['warm', '暖'],
                      ['neutral', '中性'],
                      ['cool', '冷']
                    ] as const
                  ).map(([value, text]) => (
                    <Button
                      key={value}
                      type="button"
                      variant={temperature === value ? 'secondary' : 'ghost'}
                      size="none"
                      className="!h-7 !rounded-md !px-2 !text-[11px] !font-normal"
                      onClick={() => setTemperature(value)}
                    >
                      {text}
                    </Button>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center gap-1">
                {(
                  [
                    ['close', '特写'],
                    ['medium', '中景'],
                    ['wide', '全景']
                  ] as const
                ).map(([value, text]) => (
                  <Button
                    key={value}
                    type="button"
                    variant={shotSize === value ? 'secondary' : 'ghost'}
                    size="none"
                    className="!h-7 !rounded-md !px-2 !text-[11px] !font-normal"
                    onClick={() => setShotSize(value)}
                  >
                    {text}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </div>

        <InlineModelField
          models={models}
          value={activeModel?.key ?? ''}
          onChange={setModelKey}
          label={`${label}模型`}
          disabled={running}
        />

        {error ? (
          <div className="rounded-md bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] px-2 py-1.5 text-[11px] text-danger">
            {error}
          </div>
        ) : null}

        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 pt-2">
          <div className="text-[10.5px] text-fg-subtle">
            预览为方向示意，最终由模型生成
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
              disabled={running || !activeModel || activeModel.disabled}
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
