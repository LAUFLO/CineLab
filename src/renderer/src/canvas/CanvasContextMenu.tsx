import { useEffect, useRef } from 'react'
import { useCanvasStore } from '../stores/canvas'
import { useStudioStore } from '../stores/studio'
import { useUIStore } from '../stores/ui'
import { createStudioAt } from '../studio/nodes'
import { pasteAt, uploadMaterialsAt } from './context-actions'

const MENU_WIDTH = 224
const MENU_HEIGHT = 304

export function CanvasContextMenu() {
  const menu = useUIStore((state) => state.contextMenu)
  const close = useUIStore((state) => state.closeContextMenu)
  const openMenu = useUIStore((state) => state.openMenu)
  const openStudio = useStudioStore((state) => state.openStudio)

  const canUndo = useCanvasStore((state) => state.past.length > 0)
  const canRedo = useCanvasStore((state) => state.future.length > 0)
  const undo = useCanvasStore((state) => state.undo)
  const redo = useCanvasStore((state) => state.redo)

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
    const onResize = (): void => close()

    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', onResize)
    }
  }, [menu, close])

  if (!menu) return null

  const left = Math.max(12, Math.min(menu.screen.x, window.innerWidth - MENU_WIDTH - 12))
  const top = Math.max(12, Math.min(menu.screen.y, window.innerHeight - MENU_HEIGHT - 12))

  return (
    <div
      ref={ref}
      className="ctx-menu"
      style={{ left, top, width: MENU_WIDTH }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        type="button"
        className="ctx-menu__item"
        onClick={() => {
          close()
          void uploadMaterialsAt(menu.flow)
        }}
      >
        <span>上传</span>
      </button>

      <button type="button" className="ctx-menu__item" disabled>
        <span>保存到我的资产</span>
      </button>

      <button
        type="button"
        className="ctx-menu__item"
        onClick={() => {
          close()
          openMenu({ screen: menu.screen, flow: menu.flow })
        }}
      >
        <span>添加节点</span>
      </button>

      <button
        type="button"
        className="ctx-menu__item"
        onClick={() => {
          close()
          const studioId = createStudioAt(menu.flow)
          openStudio(studioId)
        }}
      >
        <span>剪辑室</span>
      </button>

      <div className="ctx-menu__divider" />

      <button
        type="button"
        className="ctx-menu__item"
        disabled={!canUndo}
        onClick={() => {
          undo()
          close()
        }}
      >
        <span>撤销</span>
        <span className="ctx-menu__shortcut">Ctrl+Z</span>
      </button>

      <button
        type="button"
        className="ctx-menu__item"
        disabled={!canRedo}
        onClick={() => {
          redo()
          close()
        }}
      >
        <span>重做</span>
        <span className="ctx-menu__shortcut">Shift+Ctrl+Z</span>
      </button>

      <div className="ctx-menu__divider" />

      <button
        type="button"
        className="ctx-menu__item"
        onClick={() => {
          close()
          void pasteAt(menu.flow)
        }}
      >
        <span>粘贴</span>
        <span className="ctx-menu__shortcut">Ctrl+V</span>
      </button>
    </div>
  )
}
