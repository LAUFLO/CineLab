import { useEffect, useRef, useState } from 'react'
import { NODE_KINDS, NODE_META, type NodeKind } from '@shared/canvas-schema'
import { Icon, type IconName } from '../components/Icon'
import { useCanvasStore } from '../stores/canvas'
import { useUIStore } from '../stores/ui'

const ICONS: Record<NodeKind, IconName> = {
  text: 'text',
  image: 'image',
  video: 'video',
  audio: 'audio'
}

const MENU_WIDTH = 200
const MENU_HEIGHT = 300

export function AddNodeMenu() {
  const menu = useUIStore((state) => state.menu)
  const closeMenu = useUIStore((state) => state.closeMenu)
  const addNode = useCanvasStore((state) => state.addNode)
  const onConnect = useCanvasStore((state) => state.onConnect)

  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setQuery('')
  }, [menu])

  useEffect(() => {
    if (!menu) return

    const onPointerDown = (event: PointerEvent): void => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        closeMenu()
      }
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeMenu()
    }

    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [menu, closeMenu])

  if (!menu) return null

  const kinds = NODE_KINDS.filter((kind) => NODE_META[kind].label.includes(query))

  const pick = (kind: NodeKind): void => {
    const id = addNode(kind, menu.flow)

    if (menu.source) {
      if (menu.source.handle === 'source') {
        onConnect({ source: menu.source.nodeId, target: id })
      } else {
        onConnect({ source: id, target: menu.source.nodeId })
      }
    }

    closeMenu()
  }

  const left = Math.max(12, Math.min(menu.screen.x, window.innerWidth - MENU_WIDTH - 12))
  const top = Math.max(12, Math.min(menu.screen.y, window.innerHeight - MENU_HEIGHT - 12))

  return (
    <div
      ref={ref}
      className="add-menu"
      style={{ left, top, width: MENU_WIDTH }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="add-menu__title">
        {menu.source ? '引用该节点生成' : '添加节点'}
      </div>

      <div className="add-menu__search">
        <Icon name="search" size={13} />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索节点…"
        />
      </div>

      <div className="add-menu__list">
        {kinds.map((kind) => (
          <button
            key={kind}
            type="button"
            className="add-menu__item"
            onClick={() => pick(kind)}
          >
            <Icon name={ICONS[kind]} size={16} />
            <span>{NODE_META[kind].label}</span>
          </button>
        ))}
        {kinds.length === 0 && <div className="add-menu__empty">没有匹配的节点</div>}
      </div>

      {menu.source ? (
        <>
          <div className="add-menu__divider" />
          <button type="button" className="add-menu__item" disabled>
            <Icon name="cursor" size={16} />
            <span>参考节点</span>
          </button>
        </>
      ) : null}
    </div>
  )
}
