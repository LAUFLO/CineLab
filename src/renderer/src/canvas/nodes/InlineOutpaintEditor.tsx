import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { OutputRef } from '@shared/canvas-schema'
import {
  OUTPAINT_RATIOS,
  outpaintRatioOf,
  planOutpaint,
  type OutpaintRatio
} from '@shared/outpaint'
import { Icon } from '../../components/Icon'
import { Button, IconButton, Textarea } from '../../components/ui'
import { useSettingsStore } from '../../stores/settings'
import { useUIStore, type InlineEditorState } from '../../stores/ui'
import {
  defaultParams,
  listImageModels,
  runImageOperation
} from './inline-generation'
import { InlineModelField } from './InlineModelField'

interface InlineOutpaintEditorProps {
  editor: InlineEditorState
  current: OutputRef
  rect: { left: number; top: number; width: number; height: number }
}

function ratioValue(ratio: string): number | null {
  const [width, height] = ratio.split(':').map(Number)
  if (!width || !height) return null
  return width / height
}

/** 按目标比例计算扩展后的显示框（可能超出节点）。 */
function expandedFrame(
  width: number,
  height: number,
  ratio: string
): { width: number; height: number } {
  const target = ratioValue(ratio)
  if (!target) return { width, height }
  const source = width / height
  if (target >= source) return { width: height * target, height }
  return { width, height: width / target }
}

export function InlineOutpaintEditor({
  editor,
  current,
  rect
}: InlineOutpaintEditorProps) {
  const providers = useSettingsStore((state) => state.providers)
  const showToast = useUIStore((state) => state.showToast)
  const close = useUIStore((state) => state.closeInlineEditor)
  const models = listImageModels(providers)
  const availableModels = models.filter((item) => !item.disabled)
  const [modelKey, setModelKey] = useState('')
  const [ratio, setRatio] = useState<string>(
    editor.ratio && OUTPAINT_RATIOS.includes(editor.ratio as OutpaintRatio)
      ? editor.ratio
      : '16:9'
  )
  const [prompt, setPrompt] = useState('')
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

  const frame = useMemo(
    () => expandedFrame(rect.width, rect.height, ratio),
    [rect.width, rect.height, ratio]
  )

  const submit = (): void => {
    if (running) return
    if (!activeModel || activeModel.disabled) {
      setError('没有可用的图片模型')
      return
    }
    const targetRatio = outpaintRatioOf(ratio)
    if (!targetRatio) {
      setError('不支持的扩图比例')
      return
    }
    const plan = planOutpaint(
      activeModel.model,
      prompt.trim() || editor.prompt || '',
      targetRatio,
      { ...defaultParams(activeModel.model), watermark: false }
    )
    if (!plan.supported) {
      setError(plan.reason ?? '当前模型不支持这个扩图比例')
      return
    }
    setError(null)
    setRunning(true)
    try {
      const targetId = runImageOperation({
        nodeId: editor.nodeId,
        current,
        opId: 'outpaint',
        label: '扩图',
        prompt: plan.prompt,
        modelKey: activeModel.key,
        model: activeModel.model,
        params: { ...plan.params, watermark: false }
      })
      if (!targetId) {
        setError('无法创建结果节点')
        return
      }
      showToast(
        plan.exact === false
          ? `已提交扩图，将按 ${plan.effective} 近似输出`
          : '已提交扩图'
      )
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
        <IconButton label="退出扩图" size="md" onClick={close}>
          <Icon name="close" size={16} />
        </IconButton>
        <span className="mx-1 h-4 w-px bg-divider" />
        <span className="flex items-center gap-1.5 px-1 text-[12px] font-medium">
          <Icon name="expand" size={13} />
          扩图
        </span>
        <span className="mx-1 h-4 w-px bg-divider" />
        <IconButton
          label="重置比例"
          size="md"
          onClick={() => setRatio('16:9')}
        >
          <Icon name="undo" size={14} />
        </IconButton>
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
        <div className="flex items-center justify-between gap-2">
          <div className="text-[12px] font-medium">扩图</div>
          <div className="text-[11px] text-fg-subtle">
            {Math.round(rect.width)} × {Math.round(rect.height)} →{' '}
            {Math.round(frame.width)} × {Math.round(frame.height)}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {OUTPAINT_RATIOS.map((entry) => (
            <Button
              key={entry}
              type="button"
              variant={entry === ratio ? 'secondary' : 'ghost'}
              size="none"
              className="!h-7 !rounded-md !px-2 !text-[11px] !font-normal"
              disabled={running}
              onClick={() => setRatio(entry)}
            >
              {entry}
            </Button>
          ))}
        </div>

        <InlineModelField
          models={models}
          value={activeModel?.key ?? ''}
          onChange={setModelKey}
          label="扩图模型"
          disabled={running}
        />

        <Textarea
          value={prompt}
          placeholder={
            editor.prompt
              ? '可选：补充描述，留空使用默认提示词'
              : '可选：描述扩展区域希望出现的内容'
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
            按所选比例向四周扩展
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
              {running ? '提交中…' : '生成扩图'}
            </Button>
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}
