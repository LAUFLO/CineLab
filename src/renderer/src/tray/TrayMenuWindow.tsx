import { Button, DIALOG_SURFACE } from '../components/ui'

/** 托盘右键自绘菜单：与主窗口共用组件库与 tokens，不使用系统原生菜单 */
export function TrayMenuWindow() {
  return (
    <div className={`h-full w-full ${DIALOG_SURFACE} p-1.5`}>
      <div className="flex flex-col gap-0.5">
        <Button
          variant="secondary"
          className="w-full justify-start"
          onClick={() => window.api.app.restoreWindow()}
        >
          显示主窗口
        </Button>
        <Button
          variant="secondary"
          className="w-full justify-start"
          onClick={() => window.api.app.requestQuit()}
        >
          退出 CineLab
        </Button>
      </div>
    </div>
  )
}
