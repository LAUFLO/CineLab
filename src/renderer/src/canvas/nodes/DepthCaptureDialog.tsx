import { useEffect, useState } from 'react'
import type { ComponentStatus } from '@shared/components'
import { Icon } from '../../components/Icon'
import { Button, Dialog, Select } from '../../components/ui'

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
      overlayClassName="operation-dialog-overlay"
      panelClassName="operation-dialog"
    >
      <div className="operation-dialog__header">
        <div>
          <div className="operation-dialog__title">深度动作捕捉</div>
          <div className="operation-dialog__subtitle">
            源视频 {duration.toFixed(1)} 秒 · 输出比例跟随源视频
          </div>
        </div>
        <Button
          type="button"
          className="operation-dialog__close"
          title="关闭"
          onClick={onClose}
          unstyled
        >
          <Icon name="close" size={14} />
        </Button>
      </div>

      <div className="operation-dialog__row">
        <label className="operation-dialog__field">
          <span>档位</span>
          <Select
            value={quality}
            options={QUALITY_OPTIONS}
            onChange={(next) => setQuality(next)}
          />
        </label>
        <label className="operation-dialog__field">
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

      <div className="operation-dialog__hint">
        预计耗时约 {estimatedMinutes}{' '}
        分钟。任务在后台执行，完成后会自动创建节点。
      </div>

      {!checking && !installed ? (
        <div className="operation-dialog__hint">
          深度组件未安装。请先在设置中下载「深度运行时」和「VDA Small 模型」。
        </div>
      ) : null}

      {tooLong ? (
        <div className="operation-dialog__hint">
          当前档位最长支持 {maxSeconds} 秒，请先裁短视频。
        </div>
      ) : null}

      <div className="operation-dialog__footer">
        <Button
          type="button"
          className="btn-secondary"
          onClick={onClose}
          unstyled
        >
          取消
        </Button>
        <Button
          type="button"
          className="btn-primary"
          disabled={checking || !installed || tooLong}
          onClick={() => onConfirm(quality, fpsMode === '24' ? 24 : 0)}
          unstyled
        >
          开始提取
        </Button>
      </div>
    </Dialog>
  )
}
