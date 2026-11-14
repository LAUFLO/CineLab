import { useEffect, useRef } from 'react'
import { useCanvasStore } from '../stores/canvas'
import { useUIStore } from '../stores/ui'
import { Button } from '../components/ui'

const MENU_WIDTH = 168

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
      className="ctx-menu ctx-menu--node"
      style={{ left, top, width: MENU_WIDTH }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <Button
        type="button"
        className="ctx-menu__item is-danger"
        onClick={() => {
          removeEdges([menu.edgeId])
          close()
        }}
        unstyled
      >
        <span>删除连线</span>
        <span className="ctx-menu__shortcut">Delete</span>
      </Button>
    </div>
  )
}
