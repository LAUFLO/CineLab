import { useCanvasStore } from '../stores/canvas'
import { useUIStore } from '../stores/ui'
import { Button, Menu } from '../components/ui'

const ITEM_CLASS =
  '!flex h-8 w-full items-center !justify-between gap-3 rounded-card px-3 text-[12.5px] !font-normal !text-danger hover:!bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] hover:!text-danger'

export function EdgeContextMenu() {
  const menu = useUIStore((state) => state.edgeContextMenu)
  const close = useUIStore((state) => state.closeEdgeContextMenu)
  const removeEdges = useCanvasStore((state) => state.removeEdges)
  if (!menu) return null

  return (
    <Menu
      open
      onClose={close}
      x={menu.screen.x}
      y={menu.screen.y}
      width={168}
      className="!p-1.5 max-h-[520px] overflow-y-auto [animation:menu-in_120ms_ease-out]"
      onContextMenu={(event) => event.preventDefault()}
    >
      <Button
        type="button"
        variant="ghost"
        size="none"
        className={ITEM_CLASS}
        onClick={() => {
          removeEdges([menu.edgeId])
          close()
        }}
      >
        <span>删除连线</span>
        <span className="text-xs text-fg-subtle">Delete</span>
      </Button>
    </Menu>
  )
}
