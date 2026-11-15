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
    <div
      className="fixed inset-0 z-[240] flex items-center justify-center bg-overlay px-6 py-12"
      onPointerDown={closeSettings}
    >
      <div
        className="flex max-h-[72vh] w-[440px] flex-col rounded-[14px] border border-border bg-surface p-[18px] text-fg shadow-menu"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[15px] font-semibold">自定义工具栏</div>
            <div className="mt-1 text-xs text-fg-subtle">
              {KIND_LABEL[kind] ?? kind} · 已固定 {pinnedIds.length}/
              {TOOLBAR_MAX_PRIMARY}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="none"
            className="h-7 w-7 !rounded-[7px] p-0"
            title="关闭"
            onClick={closeSettings}
          >
            <Icon name="close" size={14} />
          </Button>
        </div>

        <div className="mt-3.5 mb-2.5 text-xs leading-relaxed text-fg-muted">
          勾选要固定到节点上方的工具，其余收进「更多」。
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {ops.map((op) => {
            const isPinned = pinnedIds.includes(op.id)

            return (
              <div
                className="flex h-11 items-center gap-2.5 rounded-lg px-1.5 hover:bg-surface-hover"
                key={op.id}
              >
                <Icon name={op.icon} size={15} className="text-fg-muted" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[13px] text-fg">{op.label}</span>
                  <span className="text-[11px] text-fg-subtle">
                    {op.implemented ? '已接入' : '待接入'}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="none"
                  className={`relative h-3 w-[22px] shrink-0 !rounded-pill p-0 ${
                    isPinned
                      ? '!bg-pick-bar hover:!bg-pick-bar'
                      : '!bg-border-strong hover:!bg-border-strong'
                  }`}
                  aria-pressed={isPinned}
                  onClick={() => handleToggle(op.id)}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-2 w-2 rounded-pill bg-surface transition-transform ${
                      isPinned ? 'translate-x-2.5' : ''
                    }`}
                  />
                </Button>
              </div>
            )
          })}
        </div>

        <div className="mt-3.5 flex justify-end gap-2 border-t border-divider pt-3.5">
          <Button
            type="button"
            variant="secondary"
            onClick={() => resetPinned(kind)}
          >
            恢复默认
          </Button>
          <Button type="button" variant="primary" onClick={closeSettings}>
            完成
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
