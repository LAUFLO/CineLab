import { useEffect, useState } from 'react'
import type { ComponentStatus } from '@shared/components'
import { Icon } from '../../components/Icon'
import { Button, Dialog, IconButton, Select } from '../../components/ui'

type Quality = 'fast' | 'standard' | 'long'

interface DepthCaptureDialogProps {
  open: boolean
  duration: number
  onClose: () => void
  onConfirm: (quality: Quality, fps: number) => void
}

const QUALITY_OPTIONS: Array<{ value: Quality; label: string }> = [
  { value: 'fast', label: '快速 · 长边 854 · ≤15 秒' },
  { value: 'standard', label: '标准 · 长边 1280 · ≤15 秒' },
  { value: 'long', label: '长片 · 长边 854 · ≤30 秒' }
]

export function DepthCaptureDialog({
  open,
  duration,
  onClose,
  onConfirm
}: DepthCaptureDialogProps) {
  const [quality, setQuality] = useState<Quality>('fast')
  const [fpsMode, setFpsMode] = useState<'source' | '24'>('source')
  const [components, setComponents] = useState<ComponentStatus[] | null>(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    if (!open) return
    setQuality('fast')
    setFpsMode('source')
    setChecking(true)

    void window.api.components
      .status()
      .then(setComponents)
      .catch(() => setComponents([]))
      .finally(() => setChecking(false))
  }, [open])

  if (!open) return null

  const runtime = components?.find((item) => item.kind === 'depth-runtime')
  const model = components?.find((item) => item.kind === 'depth-model')
  const installed =
    runtime?.state === 'installed' && model?.state === 'installed'
  const maxSeconds = quality === 'long' ? 30 : 15
  const tooLong = duration > maxSeconds
  const estimatedFrames = Math.round(duration * (fpsMode === '24' ? 24 : 24))
  const estimatedMinutes = Math.max(1, Math.round((estimatedFrames * 1.4) / 60))

  return (
    <Dialog
      open={open}
      onClose={checking ? () => {} : onClose}
      bare
      ariaLabel="深度捕捉"
      overlayClassName="fixed inset-0 z-[240] flex items-center justify-center bg-black/55 px-6 py-12"
      panelClassName="w-[380px] rounded-[14px] border border-border bg-surface p-[18px] text-fg shadow-menu"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[15px] font-semibold">深度动作捕捉</div>
          <div className="mt-1 text-xs text-fg-subtle">
            源视频 {duration.toFixed(1)} 秒 · 输出比例跟随源视频
          </div>
        </div>
        <IconButton label="关闭" size="sm" onClick={onClose}>
          <Icon name="close" size={14} />
        </IconButton>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <label className="flex flex-col gap-1.5 text-xs text-fg-muted">
          <span>档位</span>
          <Select
            value={quality}
            options={QUALITY_OPTIONS}
            onChange={(next) => setQuality(next)}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs text-fg-muted">
          <span>帧率</span>
          <Select
            value={fpsMode}
            options={[
              { value: 'source', label: '跟随源视频' },
              { value: '24', label: '固定 24fps' }
            ]}
            onChange={(next) => setFpsMode(next)}
          />
        </label>
      </div>

      <div className="mt-3 text-[11px] leading-[1.6] text-fg-subtle">
        预计耗时约 {estimatedMinutes}{' '}
        分钟。任务在后台执行，完成后会自动创建节点。
      </div>

      {!checking && !installed ? (
        <div className="mt-3 text-[11px] leading-[1.6] text-fg-subtle">
          深度组件未安装。请先在设置中下载「深度运行时」和「VDA Small 模型」。
        </div>
      ) : null}

      {tooLong ? (
        <div className="mt-3 text-[11px] leading-[1.6] text-fg-subtle">
          当前档位最长支持 {maxSeconds} 秒，请先裁短视频。
        </div>
      ) : null}

      <div className="mt-4 flex justify-end gap-2 border-t border-divider pt-3.5">
        <Button
          type="button"
          variant="secondary"
          onClick={onClose}
        >
          取消
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={checking || !installed || tooLong}
          onClick={() => onConfirm(quality, fpsMode === '24' ? 24 : 0)}
        >
          开始提取
        </Button>
      </div>
    </Dialog>
  )
}
