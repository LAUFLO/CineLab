import { useEffect, useRef } from 'react'
import { useCanvasStore } from '../stores/canvas'
import { useUIStore } from '../stores/ui'
import { Button } from '../components/ui'

const MENU_WIDTH = 168

const ITEM_CLASS =
  '!flex h-8 w-full items-center !justify-between gap-3 rounded-lg px-3 text-[12.5px] !font-normal !text-danger hover:!bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] hover:!text-danger'

export function EdgeContextMenu() {
  const menu = useUIStore((state) => state.edgeContextMenu)
  const close = useUIStore((state) => state.closeEdgeContextMenu)
  const removeEdges = useCanvasStore((state) => state.removeEdges)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return

    const onPointerDown = (event: PointerEvent): void => {
      if (
        ref.current &&
        event.target instanceof Node &&
        !ref.current.contains(event.target)
      ) {
        close()
      }
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }

    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [menu, close])

  if (!menu) return null

  const left = Math.max(
    12,
    Math.min(menu.screen.x, window.innerWidth - MENU_WIDTH - 12)
  )
  const top = Math.max(12, Math.min(menu.screen.y, window.innerHeight - 70))

  return (
    <div
      ref={ref}
      className="fixed z-[120] max-h-[520px] overflow-y-auto rounded-[12px] border border-border bg-surface p-1.5 shadow-menu [animation:menu-in_120ms_ease-out]"
      style={{ left, top, width: MENU_WIDTH }}
      onPointerDown={(event) => event.stopPropagation()}
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
    </div>
  )
}
