import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../../components/Icon'
import { TOOLBAR_MAX_PRIMARY, useToolbarStore } from '../../stores/toolbar'
import { useUIStore } from '../../stores/ui'
import { defaultPrimaryForKind, operationsForKind } from './node-operations'
import { Button } from '../../components/ui'

const KIND_LABEL: Record<string, string> = {
  image: '图片节点',
  video: '视频节点',
  audio: '音频节点',
  text: '文本节点'
}

export function ToolbarSettings() {
  const kind = useToolbarStore((state) => state.settingsKind)
  const closeSettings = useToolbarStore((state) => state.closeSettings)
  const pinned = useToolbarStore((state) => state.pinned)
  const togglePin = useToolbarStore((state) => state.togglePin)
  const resetPinned = useToolbarStore((state) => state.resetPinned)
  const showToast = useUIStore((state) => state.showToast)

  useEffect(() => {
    if (!kind) return

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeSettings()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [kind, closeSettings])

  if (!kind) return null

  const ops = operationsForKind(kind)
  const defaultIds = defaultPrimaryForKind(kind)
  const pinnedIds = pinned?.[kind] ?? defaultIds

  const handleToggle = (opId: string): void => {
    const isPinned = pinnedIds.includes(opId)
    if (!isPinned && pinnedIds.length >= TOOLBAR_MAX_PRIMARY) {
      showToast(`最多固定 ${TOOLBAR_MAX_PRIMARY} 个工具`, 'error')
      return
    }
    togglePin(kind, opId, defaultIds)
  }

  return createPortal(
    <div className="toolbar-settings-overlay" onPointerDown={closeSettings}>
      <div
        className="toolbar-settings"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="toolbar-settings__header">
          <div>
            <div className="toolbar-settings__title">自定义工具栏</div>
            <div className="toolbar-settings__subtitle">
              {KIND_LABEL[kind] ?? kind} · 已固定 {pinnedIds.length}/
              {TOOLBAR_MAX_PRIMARY}
            </div>
          </div>
          <Button
            type="button"
            className="toolbar-settings__close"
            title="关闭"
            onClick={closeSettings}
            unstyled
          >
            <Icon name="close" size={14} />
          </Button>
        </div>

        <div className="toolbar-settings__hint">
          勾选要固定到节点上方的工具，其余收进「更多」。
        </div>

        <div className="toolbar-settings__list">
          {ops.map((op) => {
            const isPinned = pinnedIds.includes(op.id)

            return (
              <div className="toolbar-settings__row" key={op.id}>
                <Icon
                  name={op.icon}
                  size={15}
                  className="toolbar-settings__icon"
                />
                <div className="toolbar-settings__meta">
                  <span className="toolbar-settings__name">{op.label}</span>
                  <span className="toolbar-settings__desc">
                    {op.implemented ? '已接入' : '待接入'}
                  </span>
                </div>
                <Button
                  type="button"
                  className={`toolbar-switch ${isPinned ? 'is-on' : ''}`}
                  aria-pressed={isPinned}
                  onClick={() => handleToggle(op.id)}
                  unstyled
                >
                  <span />
                </Button>
              </div>
            )
          })}
        </div>

        <div className="toolbar-settings__footer">
          <Button
            type="button"
            className="btn-secondary"
            onClick={() => resetPinned(kind)}
            unstyled
          >
            恢复默认
          </Button>
          <Button
            type="button"
            className="btn-primary"
            onClick={closeSettings}
            unstyled
          >
            完成
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
