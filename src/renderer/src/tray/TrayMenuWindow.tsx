import { Button } from '../components/ui'

/** 托盘右键自绘菜单：固定浅色、紧凑尺寸，与应用浅色主题一致。 */
export function TrayMenuWindow() {
  return (
    <div className="h-full w-full overflow-hidden rounded-card border border-border bg-surface-raised p-1 shadow-float">
      <div className="flex flex-col gap-0.5">
        <Button
          variant="ghost"
          size="none"
          className="h-7 w-full !justify-start rounded-md px-2 text-[11px] !font-normal"
          onClick={() => window.api.app.restoreWindow()}
        >
          显示主窗口
        </Button>
        <Button
          variant="ghost"
          size="none"
          className="h-7 w-full !justify-start rounded-md px-2 text-[11px] !font-normal"
          onClick={() => window.api.app.requestQuit()}
        >
          退出 CineLab
        </Button>
      </div>
    </div>
  )
}
