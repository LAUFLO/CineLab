import { useEffect, useState } from 'react'
import type { ComponentKind, ComponentStatus } from '@shared/components'
import { useSettingsStore } from '../stores/settings'
import { useUIStore } from '../stores/ui'
import { Button } from '../components/ui'

const KIND_ORDER: ComponentKind[] = [
  'depth-runtime',
  'depth-model',
  'vision-models',
  'stem-model',
  'whisper-runtime',
  'whisper-model'
]

const COMPONENT_META: Record<
  ComponentKind,
  { name: string; description: string; uninstallHint: string }
> = {
  'depth-runtime': {
    name: '本地 AI 运行时',
    description:
      '包含 Python 运行时与 PyTorch。深度动作捕捉、视觉增强、人声/背景音分离共用这一套运行时，请勿重复下载。',
    uninstallHint:
      '卸载后，深度动作捕捉、视觉增强和人声/背景音分离都将无法使用。已生成的素材节点不受影响，可随时重新下载。'
  },
  'depth-model': {
    name: 'Video Depth Anything Small 模型',
    description:
      'ByteDance 开源的视频深度模型权重（Apache-2.0）。负责逐帧估计深度并保持全片时序一致，输出近白远黑的控制视频。',
    uninstallHint:
      '卸载后，深度推理缺少模型权重，「深度动作捕捉」将无法使用。已生成的深度视频节点不受影响，可随时重新下载。'
  },
  'whisper-runtime': {
    name: '本地字幕运行时',
    description:
      'whisper.cpp v1.7.6 本地运行时，用于本地语音转写。安装后「自动字幕」才能离线运行，不上传音频。',
    uninstallHint:
      '卸载后，「自动字幕」将无法使用。已生成的字幕轨不受影响，可随时重新下载。'
  },
  'whisper-model': {
    name: 'Whisper Base 模型',
    description:
      'OpenAI Whisper base 多语言模型（MIT）。约 148MB，CPU 转写中文和英文，首次转写会比后续慢。',
    uninstallHint:
      '卸载后，本地转写缺少模型权重，「自动字幕」将无法使用。已生成的字幕轨不受影响，可随时重新下载。'
  },
  'vision-models': {
    name: '视觉模型（InSPyReNet + LaMa）',
    description:
      'InSPyReNet 抠像与 LaMa 修复模型，约 570MB。复用「本地 AI 运行时」的 Python/PyTorch 环境，请先安装运行时。安装后可解锁抠图、图层分离、视频抠像、智能去字幕、主体消除和本地扩图。',
    uninstallHint:
      '卸载后，抠图、图层分离、视频抠像、智能修复和本地扩图将无法使用。已生成的素材节点不受影响，可随时重新下载。'
  },
  'stem-model': {
    name: 'HTDemucs 人声分离模型',
    description:
      'Demucs v4 HTDemucs 权重，约 84MB。用于人声提取和背景音提取，复用「本地 AI 运行时」的 Python/PyTorch 环境，请先安装运行时。',
    uninstallHint:
      '卸载后，人声提取和背景音提取将无法使用。已生成的音频节点不受影响，可随时重新下载。'
  }
}

function formatBytes(value?: number): string {
  if (!value || value <= 0) return '—'
  if (value >= 1024 * 1024 * 1024) {
    return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`
  }
  if (value >= 1024 * 1024) {
    return `${Math.round(value / 1024 / 1024)} MB`
  }
  return `${Math.round(value / 1024)} KB`
}

function stateLabel(item: ComponentStatus): string {
  switch (item.state) {
    case 'installed':
      return `已安装${item.version ? ` · v${item.version}` : ''}${
        item.installedSize ? ` · ${formatBytes(item.installedSize)}` : ''
      }`
    case 'downloading':
      return `下载中 ${item.percent ?? 0}%${
        item.totalBytes ? ` · ${formatBytes(item.totalBytes)}` : ''
      }`
    case 'installing':
      return '正在安装'
    case 'verifying':
      return '正在校验'
    case 'paused':
      return '已暂停'
    case 'error':
      return '安装失败'
    default:
      return '未安装'
  }
}

export function ComponentsSection() {
  const requestConfirm = useUIStore((state) => state.requestConfirm)
  const focusStem = useSettingsStore(
    (state) => state.panelSection === 'components'
  )
  const [items, setItems] = useState<ComponentStatus[]>([])
  const [pending, setPending] = useState<ComponentKind | null>(null)

  const refresh = async (): Promise<void> => {
    try {
      const status = await window.api.components.status()
      setItems(
        KIND_ORDER.map(
          (kind) =>
            status.find((item) => item.kind === kind) ?? {
              kind,
              label: COMPONENT_META[kind].name,
              state: 'not-installed'
            }
        )
      )
    } catch {
      setItems(
        KIND_ORDER.map((kind) => ({
          kind,
          label: COMPONENT_META[kind].name,
          state: 'not-installed'
        }))
      )
    }
  }

  useEffect(() => {
    void refresh()

    const unsubscribe = window.api.components.onEvent((event) => {
      setItems((current) =>
        current.map((item) =>
          item.kind === event.kind
            ? {
                ...item,
                state: event.state,
                percent: event.percent,
                error: event.error
              }
            : item
        )
      )

      if (
        event.state === 'installed' ||
        event.state === 'error' ||
        event.state === 'paused'
      ) {
        void refresh()
      }
    })

    return unsubscribe
  }, [])

  const install = async (kind: ComponentKind): Promise<void> => {
    setPending(kind)
    try {
      await window.api.components.install(kind)
    } finally {
      setPending(null)
    }
  }

  const pause = async (kind: ComponentKind): Promise<void> => {
    await window.api.components.pause(kind)
  }

  const uninstall = (item: ComponentStatus): void => {
    requestConfirm({
      title: `卸载「${COMPONENT_META[item.kind].name}」？`,
      message: COMPONENT_META[item.kind].uninstallHint,
      confirmLabel: '卸载',
      danger: true,
      onConfirm: async () => {
        try {
          await window.api.components.remove(item.kind)
          await refresh()
        } catch (error) {
          useUIStore
            .getState()
            .showToast(
              error instanceof Error ? error.message : String(error),
              'error'
            )
        }
      }
    })
  }

  return (
    <div className="flex flex-col">
      <div className="mb-3 text-[13px] font-semibold text-fg">组件</div>
      <p className="mb-3 mt-2 text-xs leading-[1.7] text-fg-subtle">
        组件按需下载，不使用对应功能时不会占用磁盘。后续其他本地能力也会以组件形式接入。
      </p>

      {focusStem ? (
        <div className="mb-2.5 rounded-card border border-border-strong bg-surface-hover px-3 py-2 text-xs leading-[1.6] text-fg">
          人声/背景音分离需要先安装「本地 AI 运行时」和「HTDemucs 人声分离模型」。
          两个组件都已高亮，安装后回到画布重试即可。
        </div>
      ) : null}

      {items.map((item) => {
        const meta = COMPONENT_META[item.kind]
        const highlighted =
          focusStem &&
          (item.kind === 'depth-runtime' || item.kind === 'stem-model')
        return (
          <div
            key={item.kind}
            className={`mt-2.5 flex items-center justify-between gap-4 rounded-card border px-4 py-3.5 ${
              highlighted
                ? 'border-border-strong bg-surface-hover'
                : 'border-border'
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-fg">
                {meta.name}
              </div>
              <p className="mb-0 mt-1.5 text-xs leading-[1.5] text-fg-subtle">
                {meta.description}
              </p>
              <div className="mt-1 text-xs text-fg-subtle">
                {stateLabel(item)}
              </div>
              {item.state === 'downloading' ? (
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full bg-pick-bar transition-[width] duration-200"
                    style={{ width: `${item.percent ?? 0}%` }}
                  />
                </div>
              ) : null}
              {item.error ? (
                <div className="mt-1.5 text-xs text-danger">{item.error}</div>
              ) : null}
            </div>

            <div className="flex gap-2">
              {item.state === 'not-installed' || item.state === 'error' ? (
                <Button
                  type="button"
                  variant="primary"
                  disabled={pending === item.kind}
                  onClick={() => void install(item.kind)}
                >
                  {item.state === 'error' ? '重试' : '下载'}
                </Button>
              ) : null}

              {item.state === 'paused' ? (
                <Button
                  type="button"
                  variant="primary"
                  disabled={pending === item.kind}
                  onClick={() => void install(item.kind)}
                >
                  继续
                </Button>
              ) : null}

              {item.state === 'downloading' ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void pause(item.kind)}
                >
                  暂停
                </Button>
              ) : null}

              {item.state === 'installed' ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => uninstall(item)}
                >
                  卸载
                </Button>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}
