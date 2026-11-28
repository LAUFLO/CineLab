import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { OutputRef } from '@shared/canvas-schema'
import type { ComponentStatus } from '@shared/components'
import { Icon } from '../../components/Icon'
import { Button, IconButton, Select } from '../../components/ui'
import { useSettingsStore } from '../../stores/settings'
import { useUIStore, type InlineEditorState } from '../../stores/ui'
import { executeNodeOperation } from './node-operation-runner'

interface InlineMotionEditorProps {
  editor: InlineEditorState
  current: OutputRef
  rect: { left: number; top: number; width: number; height: number }
}

type Quality = 'fast' | 'standard' | 'long'

const QUALITY_OPTIONS: Array<{ value: Quality; label: string }> = [
  { value: 'fast', label: '快速 · 长边 854 · ≤15 秒' },
  { value: 'standard', label: '标准 · 长边 1280 · ≤15 秒' },
  { value: 'long', label: '长片 · 长边 854 · ≤30 秒' }
]

export function InlineMotionEditor({
  editor,
  current,
  rect
}: InlineMotionEditorProps) {
  const showToast = useUIStore((state) => state.showToast)
  const close = useUIStore((state) => state.closeInlineEditor)
  const openSettings = useSettingsStore((state) => state.openPanel)
  const [quality, setQuality] = useState<Quality>('fast')
  const [fpsMode, setFpsMode] = useState<'source' | '24'>('source')
  const [components, setComponents] = useState<ComponentStatus[] | null>(null)
  const [checking, setChecking] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void window.api.components
      .status()
      .then((status) => {
        if (alive) setComponents(status)
      })
      .catch(() => {
        if (alive) setComponents([])
      })
      .finally(() => {
        if (alive) setChecking(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const runtime = components?.find((item) => item.kind === 'depth-runtime')
  const model = components?.find((item) => item.kind === 'depth-model')
  const installed =
    runtime?.state === 'installed' && model?.state === 'installed'
  const duration = current.duration ?? 0
  const maxSeconds = quality === 'long' ? 30 : 15
  const tooLong = duration > maxSeconds
  const estimatedFrames = Math.round(duration * (fpsMode === '24' ? 24 : 24))
  const estimatedMinutes = Math.max(1, Math.round((estimatedFrames * 1.4) / 60))

  const submit = async (): Promise<void> => {
    if (running || !installed || tooLong) return
    setError(null)
    setRunning(true)
    try {
      const result = await executeNodeOperation(
        {
          nodeId: editor.nodeId,
          operationId: 'motion-capture',
          params: {
            quality,
            fps: fpsMode === '24' ? 24 : 0
          }
        },
        {
          effect: (effect) => {
            if (effect.type === 'settings') {
              setError(effect.message)
            }
          },
          toast: (message, tone) => {
            if (tone === 'error') setError(message)
          },
          setRunning
        }
      )
      if (!result.ok) {
        setError(result.error ?? '启动失败')
        return
      }
      showToast('已开始深度动作捕捉')
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
        <IconButton label="退出深度动作捕捉" size="md" onClick={close}>
          <Icon name="close" size={16} />
        </IconButton>
        <span className="mx-1 h-4 w-px bg-divider" />
        <span className="flex items-center gap-1.5 px-1 text-[12px] font-medium">
          <Icon name="video" size={13} />
          深度动作捕捉
        </span>
      </div>

      <div
        data-node-chrome
        className="fixed z-[1091] flex -translate-x-1/2 flex-col gap-2.5 rounded-card border border-border bg-surface-raised p-3 shadow-float"
        style={{
          left: rect.left + rect.width / 2,
          top: panelTop,
          width: Math.min(440, Math.max(360, rect.width)),
          maxHeight: Math.max(160, window.innerHeight - panelTop - 16)
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="text-[12px] font-medium">深度动作捕捉</div>
          <div className="text-[11px] text-fg-subtle">
            源视频 {duration.toFixed(1)} 秒
          </div>
        </div>

        {checking ? (
          <div className="text-[11px] text-fg-subtle">正在检查组件…</div>
        ) : installed ? (
          <div className="rounded-md bg-[color-mix(in_srgb,var(--success)_12%,transparent)] px-2 py-1.5 text-[11px] text-success">
            深度组件已安装
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5">
            <div className="text-[11px] leading-[1.5] text-fg-muted">
              需要「本地 AI 运行时」和深度模型
            </div>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => openSettings('components')}
            >
              去安装
            </Button>
          </div>
        )}

        <Select
          size="sm"
          value={quality}
          options={QUALITY_OPTIONS}
          onChange={(value) => setQuality(value as Quality)}
          className="w-full"
          menuWidth="trigger"
          ariaLabel="深度捕捉质量"
          disabled={running}
        />

        <div className="flex items-center gap-1">
          {(
            [
              ['source', '源帧率'],
              ['24', '24 fps']
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              variant={fpsMode === value ? 'secondary' : 'ghost'}
              size="none"
              className="!h-7 !rounded-md !px-2 !text-[11px] !font-normal"
              disabled={running}
              onClick={() => setFpsMode(value)}
            >
              {label}
            </Button>
          ))}
          <span className="ml-auto text-[10.5px] text-fg-subtle">
            预计 {estimatedFrames} 帧 · 约 {estimatedMinutes} 分钟
          </span>
        </div>

        {tooLong ? (
          <div className="rounded-md bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] px-2 py-1.5 text-[11px] text-danger">
            当前质量最多处理 {maxSeconds} 秒，请换「长片」或先截取片段
          </div>
        ) : null}

        {error ? (
          <div className="rounded-md bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] px-2 py-1.5 text-[11px] text-danger">
            {error}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          <div className="text-[10.5px] text-fg-subtle">
            本地处理，不调用模型
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
              onClick={() => void submit()}
              disabled={running || checking || !installed || tooLong}
            >
              {running ? '启动中…' : '开始捕捉'}
            </Button>
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}
