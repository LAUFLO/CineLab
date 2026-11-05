import { useLayoutEffect, useState } from 'react'
import { GROUP_COLORS, GROUP_LABELS } from '@shared/canvas-schema'
import { Icon } from '../components/Icon'
import { isGroupNode, useCanvasStore } from '../stores/canvas'
import { useUIStore } from '../stores/ui'

type MenuKind = 'arrange' | 'color'

export function GroupToolbar() {
  const nodes = useCanvasStore((state) => state.nodes)
  const viewport = useCanvasStore((state) => state.viewport)
  const ungroup = useCanvasStore((state) => state.ungroup)
  const arrangeGroup = useCanvasStore((state) => state.arrangeGroup)
  const setGroupColor = useCanvasStore((state) => state.setGroupColor)
  const deleteGroupWithChildren = useCanvasStore(
    (state) => state.deleteGroupWithChildren
  )
  const startGroupRename = useUIStore((state) => state.startGroupRename)
  const requestConfirm = useUIStore((state) => state.requestConfirm)
  const showToast = useUIStore((state) => state.showToast)

  const selected = nodes.filter((node) => node.selected)
  const group =
    selected.length === 1 && isGroupNode(selected[0]) ? selected[0] : undefined

  const [position, setPosition] = useState<{ left: number; top: number } | null>(
    null
  )
  const [menu, setMenu] = useState<MenuKind | null>(null)
  const groupId = group?.id

  useLayoutEffect(() => {
    if (!groupId) {
      setPosition(null)
      return
    }

    const element = document.querySelector<HTMLElement>(
      `.react-flow__node[data-id="${groupId}"]`
    )
    if (!element) {
      setPosition(null)
      return
    }

    const rect = element.getBoundingClientRect()
    setPosition({
      left: rect.left + Math.min(rect.width / 2, 240),
      top: Math.max(52, rect.top - 46)
    })
  }, [groupId, nodes, viewport])

  if (!group || !position) return null

  const remove = (): void => {
    requestConfirm({
      title: '删除组及组内节点',
      message: `确定删除「${group.data.title}」及其所有子节点吗？此操作不可撤销。`,
      confirmLabel: '删除',
      danger: true,
      onConfirm: () => {
        const count = deleteGroupWithChildren(group.id)
        if (count > 0) showToast(`已删除 ${count} 个节点`)
      }
    })
  }

  return (
    <div
      className="group-toolbar nodrag nopan"
      style={{ left: position.left, top: position.top }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="group-toolbar__btn"
        onClick={() => startGroupRename(group.id)}
      >
        <Icon name="text" size={14} />
        <span>重命名</span>
      </button>

      <div className="group-toolbar__menu-wrap">
        <button
          type="button"
          className={`group-toolbar__btn ${menu === 'arrange' ? 'is-open' : ''}`}
          onClick={() => setMenu(menu === 'arrange' ? null : 'arrange')}
        >
          <Icon name="grid" size={14} />
          <span>排列</span>
        </button>
        {menu === 'arrange' ? (
          <div className="group-toolbar__pop">
            {(
              [
                ['row', '横排'],
                ['column', '竖排'],
                ['grid', '网格']
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                className="group-toolbar__pop-item"
                onClick={() => {
                  arrangeGroup(group.id, mode)
                  setMenu(null)
                }}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="group-toolbar__menu-wrap">
        <button
          type="button"
          className={`group-toolbar__btn ${menu === 'color' ? 'is-open' : ''}`}
          onClick={() => setMenu(menu === 'color' ? null : 'color')}
        >
          <span
            className={`group-toolbar__dot group-color-${group.data.color}`}
          />
          <span>颜色</span>
        </button>
        {menu === 'color' ? (
          <div className="group-toolbar__pop group-color-grid">
            {GROUP_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                title={GROUP_LABELS[color]}
                className={`group-color-swatch group-color-${color} ${
                  group.data.color === color ? 'is-active' : ''
                }`}
                onClick={() => {
                  setGroupColor(group.id, color)
                  setMenu(null)
                }}
              />
            ))}
          </div>
        ) : null}
      </div>

      <div className="group-toolbar__divider" />

      <button
        type="button"
        className="group-toolbar__btn"
        onClick={() => ungroup(group.id)}
      >
        <Icon name="minimize" size={14} />
        <span>解组</span>
      </button>

      <button
        type="button"
        className="group-toolbar__btn group-toolbar__btn--danger"
        onClick={remove}
      >
        <Icon name="close" size={14} />
        <span>删除</span>
      </button>
    </div>
  )
}
