import { useEffect } from 'react'
import {
  SHORTCUT_ACTIONS,
  SHORTCUT_SCOPES,
  effectiveShortcutBinding,
  formatShortcut,
  type ShortcutScope
} from '@shared/shortcuts'
import { Icon } from '../components/Icon'
import { usePreferencesStore } from '../stores/preferences'
import { useUIStore } from '../stores/ui'
import { IconButton } from '../components/ui'
import { shortcutPlatform } from '../shortcuts/useShortcut'

const SCOPES: ShortcutScope[] = ['global', 'canvas', 'timeline', 'stage']

export function ShortcutPanel() {
  const open = useUIStore((state) => state.shortcutsOpen)
  const close = useUIStore((state) => state.closeShortcuts)
  const bindings = usePreferencesStore(
    (state) => state.preferences.shortcuts.bindings
  )
  const isMac = shortcutPlatform() === 'mac'
  const groups: { title: string; items: [string, string][] }[] = [
    ...SCOPES.map((scope) => ({
      title: SHORTCUT_SCOPES[scope],
      items: SHORTCUT_ACTIONS.filter((action) => action.scope === scope).map(
        (action): [string, string] => [
          formatShortcut(
            effectiveShortcutBinding(action.id, bindings),
            isMac ? 'mac' : 'win'
          ),
          action.label
        ]
      )
    })),
    {
      title: '鼠标',
      items: [
        ['双击画布', '添加节点'],
        ['右键画布', '画布菜单'],
        ['滚轮', '平移画布'],
        [isMac ? '⌘ + 滚轮' : 'Ctrl + 滚轮', '缩放画布']
      ] as [string, string][]
    },
    {
      title: '固定行为',
      items: [['Esc', '关闭浮窗或弹窗']] as [string, string][]
    }
  ].filter((group) => group.items.length > 0)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, close])

  if (!open) return null

  return (
    <div
      data-shortcut-block
      className="fixed inset-0 z-[90] flex items-center justify-center bg-overlay backdrop-blur-[2px] [-webkit-app-region:no-drag]"
      onPointerDown={close}
    >
      <div
        className="flex max-h-[calc(100vh-96px)] w-[520px] max-w-[calc(100vw-48px)] flex-col overflow-hidden rounded-panel border border-border bg-surface-raised shadow-float"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="flex h-[54px] shrink-0 items-center justify-between border-b border-divider pl-5 pr-3.5 text-[15px] font-semibold">
          <span>快捷键</span>
          <IconButton
            label="关闭"
            size="sm"
            className="!h-[30px] !w-[30px]"
            onClick={close}
          >
            <Icon name="close" size={14} />
          </IconButton>
        </header>

        <div className="grid gap-[18px] overflow-y-auto px-5 pb-5 pt-4">
          {groups.map((group) => (
            <section key={group.title}>
              <h4 className="mb-2 text-xs font-semibold text-fg-subtle">
                {group.title}
              </h4>
              {group.items.map(([keys, label]) => (
                <div
                  key={keys}
                  className="flex h-[30px] items-center justify-between gap-4 text-[13px] text-fg-muted"
                >
                  <span>{label}</span>
                  <kbd className="min-w-7 whitespace-nowrap rounded-md border border-border bg-surface-hover px-[7px] py-0.5 text-center font-sans text-[11px] text-fg-muted">
                    {keys}
                  </kbd>
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
