import { useEffect } from 'react'
import { Icon } from '../components/Icon'
import { useUIStore } from '../stores/ui'

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
    <div className="settings-overlay" onPointerDown={close}>
      <div
        className="shortcuts-dialog"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="shortcuts-dialog__head">
          <span>快捷键</span>
          <button
            type="button"
            className="icon-btn settings-dialog__close"
            title="关闭"
            onClick={close}
          >
            <Icon name="close" size={14} />
          </button>
        </header>

        <div className="shortcuts-dialog__body">
          {GROUPS.map((group) => (
            <section key={group.title} className="shortcuts-group">
              <h4>{group.title}</h4>
              {group.items.map(([keys, label]) => (
                <div key={keys} className="shortcuts-row">
                  <span>{label}</span>
                  <kbd>{keys}</kbd>
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
