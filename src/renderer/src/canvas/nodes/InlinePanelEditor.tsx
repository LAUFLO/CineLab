import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { OutputRef } from '@shared/canvas-schema'
import { Icon } from '../../components/Icon'
import {
  Button,
  IconButton,
  Input,
  Textarea
} from '../../components/ui'
import { useSettingsStore } from '../../stores/settings'
import { useUIStore, type InlineEditorState } from '../../stores/ui'
import { listImageModels, runImageOperation } from './inline-generation'
import { InlineModelField } from './InlineModelField'

interface InlinePanelEditorProps {
  editor: InlineEditorState
  current: OutputRef
  rect: { left: number; top: number; width: number; height: number }
}

interface SliderRowProps {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  disabled?: boolean
}

function SliderRow({
  label,
  value,
  min,
  max,
  onChange,
  disabled
}: SliderRowProps) {
  return (
    <label className="flex items-center gap-2 text-[11px] text-fg-subtle">
      <span className="w-9 shrink-0">{label}</span>
      <Input
        type="range"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="!h-6 min-w-0 flex-1 !border-0 !bg-transparent !px-0"
      />
      <span className="w-8 text-right tabular-nums">{value}</span>
    </label>
  )
}

export function InlinePanelEditor({
  editor,
  current,
  rect
}: InlinePanelEditorProps) {
  const isGrade = editor.operationId === 'color-grade'
  const label = isGrade ? '电影级光影校正' : '人像质感调节'
  const providers = useSettingsStore((state) => state.providers)
  const showToast = useUIStore((state) => state.showToast)
  const close = useUIStore((state) => state.closeInlineEditor)
  const models = listImageModels(providers)
  const availableModels = models.filter((item) => !item.disabled)
  const [exposure, setExposure] = useState(0)
  const [contrast, setContrast] = useState(0)
  const [temperature, setTemperature] = useState(0)
  const [saturation, setSaturation] = useState(0)
  const [strength, setStrength] = useState(60)
  const [prompt, setPrompt] = useState('')
  const [modelKey, setModelKey] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeModel =
    models.find((item) => item.key === modelKey) ??
    availableModels[0] ??
    models[0]

  useEffect(() => {
    const first = availableModels[0]?.key ?? models[0]?.key
    if (!modelKey && first) setModelKey(first)
  }, [availableModels, modelKey, models])

  const finalPrompt = useMemo(() => {
    const base = prompt.trim() || editor.prompt || ''
    if (isGrade) {
      const detail = `曝光 ${exposure}，对比 ${contrast}，色温 ${temperature}，饱和度 ${saturation}`
      return base ? `${base}；${detail}` : `${detail}。保持画面内容不变。`
    }
    return base
      ? `${base}；人像质感强度 ${strength}`
      : `人像质感强度 ${strength}，保持人物身份和构图不变。`
  }, [
    contrast,
    editor.prompt,
    exposure,
    isGrade,
    prompt,
    saturation,
    strength,
    temperature
  ])

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
        prompt: finalPrompt,
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
          <Icon name={isGrade ? 'sun' : 'sparkles'} size={13} />
          {label}
        </span>
      </div>

      <div
        data-node-chrome
        className="fixed z-[1091] flex max-h-[calc(100vh-120px)] -translate-x-1/2 flex-col gap-2.5 overflow-hidden rounded-card border border-border bg-surface-raised p-3 shadow-float"
        style={{
          left: rect.left + rect.width / 2,
          top: panelTop,
          width: Math.min(480, Math.max(360, rect.width)),
          maxHeight: Math.max(180, window.innerHeight - panelTop - 16)
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto">
        <div className="text-[12px] font-medium">{label}</div>

        {isGrade ? (
          <div className="flex flex-col gap-1.5">
            <SliderRow
              label="曝光"
              value={exposure}
              min={-100}
              max={100}
              onChange={setExposure}
              disabled={running}
            />
            <SliderRow
              label="对比"
              value={contrast}
              min={-100}
              max={100}
              onChange={setContrast}
              disabled={running}
            />
            <SliderRow
              label="色温"
              value={temperature}
              min={-100}
              max={100}
              onChange={setTemperature}
              disabled={running}
            />
            <SliderRow
              label="饱和"
              value={saturation}
              min={-100}
              max={100}
              onChange={setSaturation}
              disabled={running}
            />
          </div>
        ) : (
          <SliderRow
            label="强度"
            value={strength}
            min={0}
            max={100}
            onChange={setStrength}
            disabled={running}
          />
        )}

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
              : '可选：补充风格或质感描述'
          }
          onChange={(event) => setPrompt(event.target.value)}
          className="!h-[44px] !min-h-[44px] !resize-none !text-[12px]"
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
            参数会拼入提示词，最终由模型生成
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
