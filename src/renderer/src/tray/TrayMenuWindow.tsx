import { Button } from '../components/ui'

/** 托盘右键自绘菜单：固定浅色、紧凑尺寸，与应用浅色主题一致。 */
export function TrayMenuWindow() {
  return (
    <div className="h-full w-full">
      <div className="flex h-full w-full flex-col gap-0.5 overflow-hidden rounded-panel border border-border bg-surface-raised p-1">
        <Button
          variant="ghost"
          size="none"
          className="h-7 w-full !justify-start rounded-card px-2 text-left text-[11px] !font-normal"
          onClick={() => window.api.app.restoreMainWindow()}
        >
          显示主窗口
        </Button>
        <Button
          variant="ghost"
          size="none"
          className="h-7 w-full !justify-start rounded-card px-2 text-left text-[11px] !font-normal"
          onClick={() => window.api.app.quitFromTray()}
        >
          退出 CineLab
        </Button>
      </div>
    </div>
  )
}
