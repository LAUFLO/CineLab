import { useEffect } from 'react'
import { Icon } from '../components/Icon'
import { useUIStore } from '../stores/ui'
import { IconButton } from '../components/ui'

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: '画布',
    items: [
      ['V', '选择工具'],
      ['H', '抓手工具'],
      ['Space（按住）', '临时抓手'],
      ['双击画布', '添加节点'],
      ['右键画布', '画布菜单'],
      ['滚轮', '平移画布'],
      ['Ctrl + 滚轮', '缩放画布']
    ]
  },
  {
    title: '节点',
    items: [
      ['Ctrl + C', '复制选中节点'],
      ['Ctrl + V', '粘贴'],
      ['Delete', '删除选中'],
      ['Ctrl + Z', '撤销'],
      ['Ctrl + Shift + Z', '重做']
    ]
  },
  {
    title: '查找与整理',
    items: [
      ['Ctrl + F', '搜索节点'],
      ['Alt + Shift + F', '整理画布']
    ]
  }
]

export function ShortcutPanel() {
  const open = useUIStore((state) => state.shortcutsOpen)
  const close = useUIStore((state) => state.closeShortcuts)

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
      className="fixed inset-0 z-[90] flex items-center justify-center bg-overlay backdrop-blur-[2px] [-webkit-app-region:no-drag]"
      onPointerDown={close}
    >
      <div
        className="flex max-h-[calc(100vh-96px)] w-[520px] max-w-[calc(100vw-48px)] flex-col overflow-hidden rounded-panel border border-border bg-surface shadow-menu"
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
          {GROUPS.map((group) => (
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
                  <kbd className="min-w-7 whitespace-nowrap rounded-[6px] border border-border bg-surface-hover px-[7px] py-0.5 text-center font-sans text-[11px] text-fg-muted">
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
