import { Icon } from '../components/Icon'

interface TopBarProps {
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

export function TopBar({ theme, onToggleTheme }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="topbar__group">
        <button className="topbar__brand">
          <Icon name="logo" size={18} />
          <span>未命名工作区</span>
          <Icon name="chevron-down" size={12} />
        </button>

        <button className="topbar__item">
          画布 1
          <Icon name="chevron-down" size={12} />
        </button>

        <button className="icon-btn" title="框选工具">
          <Icon name="frame" />
        </button>
        <button className="icon-btn" title="分屏（即将支持）">
          <Icon name="split" />
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
        <button className="icon-btn" title="设置">
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
