import { useEffect, useState } from 'react'
import type { ComponentKind, ComponentStatus } from '@shared/components'
import { useUIStore } from '../stores/ui'

const KIND_ORDER: ComponentKind[] = ['depth-runtime', 'depth-model']

const COMPONENT_META: Record<
  ComponentKind,
  { name: string; description: string; uninstallHint: string }
> = {
  'depth-runtime': {
    name: '深度动作捕捉运行时',
    description:
      '包含 Python 运行时、PyTorch 与 Video Depth Anything 推理代码。安装后「深度动作捕捉」才能在本地把视频转换成灰度深度参考视频。',
    uninstallHint:
      '卸载后，「深度动作捕捉」将无法使用。已生成的深度视频节点不受影响，可随时重新下载。'
  },
  'depth-model': {
    name: 'Video Depth Anything Small 模型',
    description:
      'ByteDance 开源的视频深度模型权重（Apache-2.0）。负责逐帧估计深度并保持全片时序一致，输出近白远黑的控制视频。',
    uninstallHint:
      '卸载后，深度推理缺少模型权重，「深度动作捕捉」将无法使用。已生成的深度视频节点不受影响，可随时重新下载。'
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
        await window.api.components.remove(item.kind)
        await refresh()
      }
    })
  }

  return (
    <div className="settings-section">
      <div className="settings-group-title">组件</div>
      <p className="settings-hint">
        组件按需下载，不使用对应功能时不会占用磁盘。后续其他本地能力也会以组件形式接入。
      </p>

      {items.map((item) => {
        const meta = COMPONENT_META[item.kind]
        return (
          <div key={item.kind} className="component-card">
            <div className="component-card__info">
              <div className="component-card__name">{meta.name}</div>
              <p className="component-card__desc">{meta.description}</p>
              <div className="component-card__meta">{stateLabel(item)}</div>
              {item.state === 'downloading' ? (
                <div className="component-card__bar">
                  <div
                    className="component-card__bar-fill"
                    style={{ width: `${item.percent ?? 0}%` }}
                  />
                </div>
              ) : null}
              {item.error ? (
                <div className="component-card__error">{item.error}</div>
              ) : null}
            </div>

            <div className="component-card__actions">
              {item.state === 'not-installed' || item.state === 'error' ? (
                <button
                  type="button"
                  className="btn-primary"
                  disabled={pending === item.kind}
                  onClick={() => void install(item.kind)}
                >
                  {item.state === 'error' ? '重试' : '下载'}
                </button>
              ) : null}

              {item.state === 'paused' ? (
                <button
                  type="button"
                  className="btn-primary"
                  disabled={pending === item.kind}
                  onClick={() => void install(item.kind)}
                >
                  继续
                </button>
              ) : null}

              {item.state === 'downloading' ? (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => void pause(item.kind)}
                >
                  暂停
                </button>
              ) : null}

              {item.state === 'installed' ? (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => uninstall(item)}
                >
                  卸载
                </button>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}
