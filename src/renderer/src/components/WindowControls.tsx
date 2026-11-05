import { Icon } from './Icon'
import { useSettingsStore } from '../stores/settings'

interface WindowControlsProps {
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

export function WindowControls({ theme, onToggleTheme }: WindowControlsProps) {
  const openSettings = useSettingsStore((state) => state.openPanel)

  return (
    <div className="window-controls">
      <button
        type="button"
        className="icon-btn"
        title="切换主题"
        onClick={onToggleTheme}
      >
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
      </button>
      <button type="button" className="icon-btn" title="设置" onClick={openSettings}>
        <Icon name="settings" />
      </button>
      <span className="window-controls__divider" />
      <button
        type="button"
        className="icon-btn icon-btn--window"
        title="最小化"
        onClick={() => window.api.app.minimize()}
      >
        <Icon name="minimize" size={14} />
      </button>
      <button
        type="button"
        className="icon-btn icon-btn--window"
        title="最大化"
        onClick={() => window.api.app.maximize()}
      >
        <Icon name="maximize" size={12} />
      </button>
      <button
        type="button"
        className="icon-btn icon-btn--window icon-btn--close"
        title="关闭"
        onClick={() => window.api.app.close()}
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  )
}
