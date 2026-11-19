import { useCanvasStore } from '../stores/canvas'
import { useStudioStore } from '../stores/studio'
import { useUIStore } from '../stores/ui'
import { createStudioAt } from '../studio/nodes'
import { pasteAt, uploadMaterialsAt } from './context-actions'
import { Button, Menu } from '../components/ui'

export function CanvasContextMenu() {
  const menu = useUIStore((state) => state.contextMenu)
  const close = useUIStore((state) => state.closeContextMenu)
  const openMenu = useUIStore((state) => state.openMenu)
  const openStudio = useStudioStore((state) => state.openStudio)

  const canUndo = useCanvasStore((state) => state.past.length > 0)
  const canRedo = useCanvasStore((state) => state.future.length > 0)
  const undo = useCanvasStore((state) => state.undo)
  const redo = useCanvasStore((state) => state.redo)

  if (!menu) return null

  return (
    <Menu
      open
      onClose={close}
      x={menu.screen.x}
      y={menu.screen.y}
      width={224}
      className="!p-1.5 [animation:menu-in_120ms_ease-out]"
      onContextMenu={(event) => event.preventDefault()}
    >
      <Button
        type="button"
        variant="ghost"
        size="none"
        className="!flex h-[38px] w-full items-center !justify-between gap-3 rounded-card px-3 text-[13px] !font-normal !text-fg disabled:!text-fg-subtle disabled:!opacity-100"
        onClick={() => {
          close()
          void uploadMaterialsAt(menu.flow)
        }}
      >
        <span>上传</span>
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="none"
        className="!flex h-[38px] w-full items-center !justify-between gap-3 rounded-card px-3 text-[13px] !font-normal !text-fg disabled:!text-fg-subtle disabled:!opacity-100"
        disabled
      >
        <span>保存到我的资产</span>
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="none"
        className="!flex h-[38px] w-full items-center !justify-between gap-3 rounded-card px-3 text-[13px] !font-normal !text-fg disabled:!text-fg-subtle disabled:!opacity-100"
        onClick={() => {
          close()
          openMenu({ screen: menu.screen, flow: menu.flow })
        }}
      >
        <span>添加节点</span>
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="none"
        className="!flex h-[38px] w-full items-center !justify-between gap-3 rounded-card px-3 text-[13px] !font-normal !text-fg disabled:!text-fg-subtle disabled:!opacity-100"
        onClick={() => {
          close()
          const studioId = createStudioAt(menu.flow)
          openStudio(studioId)
        }}
      >
        <span>剪辑室</span>
      </Button>

      <div className="mx-2 my-[5px] h-px bg-divider" />

      <Button
        type="button"
        variant="ghost"
        size="none"
        className="!flex h-[38px] w-full items-center !justify-between gap-3 rounded-card px-3 text-[13px] !font-normal !text-fg disabled:!text-fg-subtle disabled:!opacity-100"
        disabled={!canUndo}
        onClick={() => {
          undo()
          close()
        }}
      >
        <span>撤销</span>
        <span className="text-xs text-fg-subtle">Ctrl+Z</span>
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="none"
        className="!flex h-[38px] w-full items-center !justify-between gap-3 rounded-card px-3 text-[13px] !font-normal !text-fg disabled:!text-fg-subtle disabled:!opacity-100"
        disabled={!canRedo}
        onClick={() => {
          redo()
          close()
        }}
      >
        <span>重做</span>
        <span className="text-xs text-fg-subtle">Shift+Ctrl+Z</span>
      </Button>

      <div className="mx-2 my-[5px] h-px bg-divider" />

      <Button
        type="button"
        variant="ghost"
        size="none"
        className="!flex h-[38px] w-full items-center !justify-between gap-3 rounded-card px-3 text-[13px] !font-normal !text-fg disabled:!text-fg-subtle disabled:!opacity-100"
        onClick={() => {
          close()
          void pasteAt(menu.flow)
        }}
      >
        <span>粘贴</span>
        <span className="text-xs text-fg-subtle">Ctrl+V</span>
      </Button>
    </Menu>
  )
}
