/**
 * 全屏覆盖层顶部的窗口拖拽区。
 *
 * Electron 的 -webkit-app-region: drag 区域不接收鼠标事件，
 * 因此只覆盖顶部 40px 空白；内容区继续使用 no-drag。
 */
export function WindowDragStrip() {
  return (
    <div
      aria-hidden
      className="absolute inset-x-0 top-0 z-[1] h-10 [-webkit-app-region:drag]"
    />
  )
}
