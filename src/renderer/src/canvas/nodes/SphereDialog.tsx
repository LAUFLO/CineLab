import { useEffect, useMemo, useState } from 'react'
import type { ModelDef } from '@shared/provider-schema'
import { modelInputs } from '@shared/provider-schema'
import { Icon } from '../../components/Icon'
import { useSettingsStore } from '../../stores/settings'
import { Button, Dialog, Input, Select } from '../../components/ui'

interface SphereDialogProps {
  open: boolean
  mode: 'light' | 'camera'
  busy: boolean
  onClose: () => void
  onConfirm: (prompt: string, modelKey: string, model: ModelDef) => void
}

const CENTER = 120
const RADIUS = 100
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

export function SphereDialog({
  open,
  mode,
  busy,
  onClose,
  onConfirm
}: SphereDialogProps) {
  const providers = useSettingsStore((state) => state.providers)
  const openSettings = useSettingsStore((state) => state.openPanel)

  const models = useMemo(() => {
    return providers
      .flatMap((provider) =>
        provider.models
          .filter(
            (model) =>
              model.capability === 'image.i2i' ||
              model.capability === 'image.t2i'
          )
          .map((model) => ({
            key: `${provider.id}/${model.id}`,
            providerName: provider.name,
            model
          }))
      )
      .sort((a, b) => {
        const rank = (item: { model: ModelDef }): number =>
          (modelInputs(item.model).includes('image') ? 0 : 10) +
          (item.model.capability === 'image.i2i' ? 0 : 1)
        return rank(a) - rank(b)
      })
  }, [providers])

  const firstModelKey =
    models.find((item) => modelInputs(item.model).includes('image'))?.key ??
    models[0]?.key ??
    ''

  const [azimuth, setAzimuth] = useState(45)
  const [elevation, setElevation] = useState(30)
  const [brightness, setBrightness] = useState(70)
  const [temperature, setTemperature] = useState<'warm' | 'neutral' | 'cool'>(
    'neutral'
  )
  const [shotSize, setShotSize] = useState<'close' | 'medium' | 'wide'>(
    'medium'
  )
  const [modelKey, setModelKey] = useState(firstModelKey)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    if (!open) return
    setAzimuth(45)
    setElevation(30)
    setModelKey(firstModelKey)
  }, [open, firstModelKey])

  if (!open) return null

  const updateFromPointer = (
    clientX: number,
    clientY: number,
    rect: DOMRect
  ): void => {
    const nx = (clientX - rect.left - rect.width / 2) / (rect.width / 2)
    const ny = (clientY - rect.top - rect.height / 2) / (rect.height / 2)
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

  const temperatureLabel =
    temperature === 'warm'
      ? '暖色温'
      : temperature === 'cool'
        ? '冷色温'
        : '中性色温'
  const shotLabel =
    shotSize === 'close' ? '特写' : shotSize === 'wide' ? '全景' : '中景'

  const prompt =
    mode === 'light'
      ? `保持画面内容、人物身份、服装和构图不变，只重新打光：主光水平方位${azimuthLabel(
          azimuth
        )}，${elevationLabel(elevation)}，亮度 ${brightness}%，${temperatureLabel}。形成自然的高光、阴影和轮廓光，皮肤质感真实，不要改变人物身份，不要文字、不要水印。`
      : `保持同一角色、服装、发型、场景、光线和画风不变，只改变机位：水平方位${azimuthLabel(
          azimuth
        )}，${cameraElevationLabel(elevation)}，景别${shotLabel}。输出单张画面，不要分屏、不要文字、不要水印。`

  const active = models.find((item) => item.key === modelKey)
  const activeSupportsImage = active
    ? modelInputs(active.model).includes('image')
    : false

  return (
    <Dialog
      open={open}
      onClose={busy ? () => {} : onClose}
      bare
      ariaLabel={mode === 'light' ? '自定义光位' : '自定义机位'}
      overlayClassName="operation-dialog-overlay"
      panelClassName="operation-dialog is-wide"
    >
      <div className="operation-dialog__header">
        <div>
          <div className="operation-dialog__title">
            {mode === 'light' ? '自定义光位' : '自定义机位'}
          </div>
          <div className="operation-dialog__subtitle">
            拖动球面上的圆点调整方向
          </div>
        </div>
        <Button
          type="button"
          className="operation-dialog__close"
          title="关闭"
          disabled={busy}
          onClick={onClose}
          unstyled
        >
          <Icon name="close" size={14} />
        </Button>
      </div>

      <div className="sphere-editor">
        <svg
          viewBox="0 0 240 240"
          className="sphere-editor__stage"
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
            <radialGradient id="sphere-fill" cx="35%" cy="30%">
              <stop offset="0%" stopColor="var(--surface-hover)" />
              <stop offset="100%" stopColor="var(--canvas-bg)" />
            </radialGradient>
          </defs>
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="url(#sphere-fill)"
            stroke="var(--border-strong)"
          />
          <ellipse
            cx={CENTER}
            cy={CENTER}
            rx={RADIUS}
            ry={34}
            fill="none"
            stroke="var(--border)"
          />
          <ellipse
            cx={CENTER}
            cy={CENTER}
            rx={34}
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
            r="9"
            fill="var(--accent)"
            stroke="var(--surface)"
            strokeWidth="2"
          />
        </svg>

        <div className="sphere-editor__readout">
          水平 {Math.round(azimuth)}° · 俯仰 {Math.round(elevation)}°
        </div>
      </div>

      {mode === 'light' ? (
        <div className="sphere-editor__controls">
          <label className="sphere-editor__range">
            <span>亮度 {brightness}%</span>
            <Input
              type="range"
              min="10"
              max="100"
              value={brightness}
              onChange={(event) => setBrightness(Number(event.target.value))}
              unstyled
            />
          </label>
          <div className="sphere-editor__chips">
            {(
              [
                ['warm', '暖色'],
                ['neutral', '中性'],
                ['cool', '冷色']
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                className={`sphere-editor__chip ${
                  temperature === value ? 'is-active' : ''
                }`}
                onClick={() => setTemperature(value)}
                unstyled
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <div className="sphere-editor__controls">
          <div className="sphere-editor__chips">
            {(
              [
                ['close', '特写'],
                ['medium', '中景'],
                ['wide', '全景']
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                className={`sphere-editor__chip ${
                  shotSize === value ? 'is-active' : ''
                }`}
                onClick={() => setShotSize(value)}
                unstyled
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {models.length === 0 ? (
        <div className="operation-dialog__empty">
          <p>还没有可用的图片模型。</p>
          <Button
            type="button"
            className="btn-primary"
            onClick={() => {
              onClose()
              openSettings()
            }}
            unstyled
          >
            打开设置
          </Button>
        </div>
      ) : (
        <label className="operation-dialog__field">
          <span>使用模型</span>
          <Select
            value={modelKey}
            options={models.map((item) => ({
              value: item.key,
              label: `${item.providerName} · ${item.model.name}${
                modelInputs(item.model).includes('image')
                  ? ''
                  : '（不支持参考图）'
              }`,
              disabled: !modelInputs(item.model).includes('image')
            }))}
            onChange={(next) => setModelKey(next)}
            disabled={busy}
          />
        </label>
      )}

      <div className="sphere-editor__prompt">{prompt}</div>

      <div className="operation-dialog__footer">
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
          disabled={!active || !activeSupportsImage || busy}
          onClick={() => {
            if (!active || !activeSupportsImage) return
            onConfirm(prompt, modelKey, active.model)
          }}
          unstyled
        >
          {busy ? '提交中…' : '开始生成'}
        </Button>
      </div>
    </Dialog>
  )
}
