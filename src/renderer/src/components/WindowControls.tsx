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
    <div className="window-controls fixed right-3 top-1.5 z-[300] flex items-center gap-1 [-webkit-app-region:no-drag]">
      <Button
        type="button"
        variant="ghost"
        size="none"
        className="h-7 w-7 rounded-lg !text-fg"
        title="切换主题"
        onClick={onToggleTheme}
      >
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="none"
        className="h-7 w-7 rounded-lg !text-fg"
        title="设置"
        onClick={() => openSettings()}
      >
        <Icon name="settings" />
      </Button>
      {!isMac && (
        <>
          <span className="mx-1.5 h-4 w-px bg-divider" />
          <Button
            type="button"
            variant="ghost"
            size="none"
            className="h-7 w-8 !rounded-md !text-fg"
            title="最小化"
            onClick={() => window.api.app.minimize()}
          >
            <Icon name="minimize" size={14} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="none"
            className="h-7 w-8 !rounded-md !text-fg"
            title="最大化"
            onClick={() => window.api.app.maximize()}
          >
            <Icon name="maximize" size={12} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="none"
            className="h-7 w-8 !rounded-md !text-fg"
            title="关闭"
            onClick={() => window.api.app.close()}
          >
            <Icon name="close" size={14} />
          </Button>
        </>
      )}
    </div>
  )
}
