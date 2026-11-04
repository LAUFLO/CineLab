import { useEffect, useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import { useProjectStore } from '../stores/project'
import { useSettingsStore } from '../stores/settings'

interface TopBarProps {
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

export function TopBar({ theme, onToggleTheme }: TopBarProps) {
  const name = useProjectStore((state) => state.name)
  const saving = useProjectStore((state) => state.saving)
  const lastSavedAt = useProjectStore((state) => state.lastSavedAt)
  const startNew = useProjectStore((state) => state.startNew)
  const openExisting = useProjectStore((state) => state.openExisting)
  const revealInFolder = useProjectStore((state) => state.revealInFolder)
  const openSettings = useSettingsStore((state) => state.openPanel)

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return

    const onPointerDown = (event: PointerEvent): void => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  const saveLabel = saving ? '保存中…' : lastSavedAt ? '已自动保存' : '就绪'

  return (
    <header className="topbar">
      <div className="topbar__group">
        <div className="topbar__project" ref={menuRef}>
          <button
            type="button"
            className="topbar__brand"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Icon name="logo" size={18} />
            <span className="topbar__project-name">{name}</span>
            <Icon name="chevron-down" size={12} />
          </button>

          {menuOpen ? (
            <div className="project-menu">
              <button
                type="button"
                className="add-menu__item"
                onClick={() => {
                  setMenuOpen(false)
                  void startNew()
                }}
              >
                <Icon name="plus" size={16} />
                <span>新建项目</span>
              </button>
              <button
                type="button"
                className="add-menu__item"
                onClick={() => {
                  setMenuOpen(false)
                  void openExisting()
                }}
              >
                <Icon name="folder" size={16} />
                <span>打开项目…</span>
              </button>
              <div className="add-menu__divider" />
              <button
                type="button"
                className="add-menu__item"
                onClick={() => {
                  setMenuOpen(false)
                  void revealInFolder()
                }}
              >
                <Icon name="grid" size={16} />
                <span>在文件夹中显示</span>
              </button>
            </div>
          ) : null}
        </div>

        <span className="topbar__save">{saveLabel}</span>

        <button className="topbar__item">
          画布 1
          <Icon name="chevron-down" size={12} />
        </button>

        <button className="icon-btn" title="框选工具">
          <Icon name="frame" />
        </button>
      </div>

      <div className="topbar__group">
        <button className="icon-btn" title="导出">
          <Icon name="download" />
        </button>
        <button className="topbar__cost" title="本月 API 消耗">
          ¥0.00
        </button>
        <button className="icon-btn" title="切换主题" onClick={onToggleTheme}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
        </button>
        <button className="icon-btn" title="设置" onClick={openSettings}>
          <Icon name="settings" />
        </button>

        <div className="bottombar__divider" />

        <button
          className="icon-btn icon-btn--window"
          title="最小化"
          onClick={() => window.api.app.minimize()}
        >
          <Icon name="minimize" size={14} />
        </button>
        <button
          className="icon-btn icon-btn--window"
          title="最大化"
          onClick={() => window.api.app.maximize()}
        >
          <Icon name="maximize" size={12} />
        </button>
        <button
          className="icon-btn icon-btn--window icon-btn--close"
          title="关闭"
          onClick={() => window.api.app.close()}
        >
          <Icon name="close" size={14} />
        </button>
      </div>
    </header>
  )
}
