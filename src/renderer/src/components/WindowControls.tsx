import { Icon } from './Icon'
import { useSettingsStore } from '../stores/settings'
import { Button } from './ui'

interface WindowControlsProps {
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

export function WindowControls({ theme, onToggleTheme }: WindowControlsProps) {
  const openSettings = useSettingsStore((state) => state.openPanel)
  // macOS 使用原生红绿灯，隐藏自绘的最小化/最大化/关闭按钮。
  const isMac =
    typeof document !== 'undefined' &&
    document.documentElement.dataset.platform === 'darwin'

  return (
    <div className="window-controls">
      <Button
        type="button"
        className="icon-btn"
        title="切换主题"
        onClick={onToggleTheme}
        unstyled
      >
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
      </Button>
      <Button
        type="button"
        className="icon-btn"
        title="设置"
        onClick={() => openSettings()}
        unstyled
      >
        <Icon name="settings" />
      </Button>
      {!isMac && (
        <>
          <span className="window-controls__divider" />
          <Button
            type="button"
            className="icon-btn icon-btn--window"
            title="最小化"
            onClick={() => window.api.app.minimize()}
            unstyled
          >
            <Icon name="minimize" size={14} />
          </Button>
          <Button
            type="button"
            className="icon-btn icon-btn--window"
            title="最大化"
            onClick={() => window.api.app.maximize()}
            unstyled
          >
            <Icon name="maximize" size={12} />
          </Button>
          <Button
            type="button"
            className="icon-btn icon-btn--window icon-btn--close"
            title="关闭"
            onClick={() => window.api.app.close()}
            unstyled
          >
            <Icon name="close" size={14} />
          </Button>
        </>
      )}
    </div>
  )
}
