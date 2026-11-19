import { useLayoutEffect, useRef, useState } from 'react'
import {
  GROUP_COLORS,
  GROUP_LABELS,
  type GroupColor
} from '@shared/canvas-schema'
import { Icon } from '../components/Icon'
import { isGroupNode, useCanvasStore } from '../stores/canvas'
import { useUIStore } from '../stores/ui'
import { Button, Popover } from '../components/ui'

type MenuKind = 'arrange' | 'color'

const GROUP_BG: Record<GroupColor, string> = {
  blue: 'bg-group-blue',
  cyan: 'bg-group-cyan',
  teal: 'bg-group-teal',
  green: 'bg-group-green',
  lime: 'bg-group-lime',
  amber: 'bg-group-amber',
  orange: 'bg-group-orange',
  rose: 'bg-group-rose',
  violet: 'bg-group-violet',
  slate: 'bg-group-slate'
}

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

  const arrangeRef = useRef<HTMLButtonElement>(null)
  const colorRef = useRef<HTMLButtonElement>(null)
  const selected = nodes.filter((node) => node.selected)
  const group =
    selected.length === 1 &&
    isGroupNode(selected[0]) &&
    selected[0].data.mode !== 'storyboard'
      ? selected[0]
      : undefined

  const [position, setPosition] = useState<{
    left: number
    top: number
  } | null>(null)
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
    const halfWidth = 220
    setPosition({
      left: Math.max(
        halfWidth,
        Math.min(rect.left + rect.width / 2, window.innerWidth - halfWidth)
      ),
      top: Math.max(56, rect.top - 56)
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
      className="nodrag nopan fixed z-[92] flex h-[42px] items-center gap-0.5 rounded-card border border-border bg-surface px-1.5 whitespace-nowrap shadow-float [animation:menu-in_120ms_ease-out] [translate:-50%_0]"
      style={{ left: position.left, top: position.top }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <Button
        type="button"
        variant="ghost"
        size="none"
        className="h-8 gap-1.5 rounded-card px-2.5 text-[13px] !font-normal"
        onClick={() => startGroupRename(group.id)}
      >
        <Icon name="text" size={14} />
        <span>重命名</span>
      </Button>

      <div className="relative">
        <Button
          type="button"
          variant="ghost"
          size="none"
          className={`h-8 gap-1.5 rounded-card px-2.5 text-[13px] !font-normal ${
            menu === 'arrange' ? 'bg-surface-hover !text-fg' : ''
          }`}
          ref={arrangeRef}
          onClick={() => setMenu(menu === 'arrange' ? null : 'arrange')}
        >
          <Icon name="grid" size={14} />
          <span>排列</span>
        </Button>
        {menu === 'arrange' ? (
          <Popover
            open={menu === 'arrange'}
            onClose={() => setMenu(null)}
            anchorRef={arrangeRef}
            align="center"
            width={120}
            className="!p-1.5"
          >
            {(
              [
                ['row', '横排'],
                ['column', '竖排'],
                ['grid', '网格']
              ] as const
            ).map(([mode, label]) => (
              <Button
                key={mode}
                type="button"
                variant="ghost"
                size="none"
                className="!flex h-8 w-full items-center !justify-start !rounded-md px-2.5 text-[13px] !font-normal"
                onClick={() => {
                  arrangeGroup(group.id, mode)
                  setMenu(null)
                }}
              >
                {label}
              </Button>
            ))}
          </Popover>
        ) : null}
      </div>

      <div className="relative">
        <Button
          type="button"
          variant="ghost"
          size="none"
          className={`h-8 gap-1.5 rounded-card px-2.5 text-[13px] !font-normal ${
            menu === 'color' ? 'bg-surface-hover !text-fg' : ''
          }`}
          ref={colorRef}
          onClick={() => setMenu(menu === 'color' ? null : 'color')}
        >
          <span
            className={`h-2.5 w-2.5 rounded-pill ${GROUP_BG[group.data.color]}`}
          />
          <span>颜色</span>
        </Button>
        {menu === 'color' ? (
          <Popover
            open={menu === 'color'}
            onClose={() => setMenu(null)}
            anchorRef={colorRef}
            align="center"
            width={150}
            className="!p-2 grid grid-cols-[repeat(5,22px)] gap-1.5"
          >
            {GROUP_COLORS.map((color) => (
              <Button
                key={color}
                type="button"
                variant="ghost"
                size="none"
                title={GROUP_LABELS[color]}
                className={`h-[22px] w-[22px] !rounded-md border p-0 hover:!bg-transparent ${
                  group.data.color === color
                    ? '!border-fg shadow-[0_0_0_1px_var(--text-1)]'
                    : 'border-transparent hover:!border-border-strong'
                } ${GROUP_BG[color]}`}
                onClick={() => {
                  setGroupColor(group.id, color)
                  setMenu(null)
                }}
              />
            ))}
          </Popover>
        ) : null}
      </div>

      <div className="mx-1 h-[18px] w-px bg-divider" />

      <Button
        type="button"
        variant="ghost"
        size="none"
        className="h-8 gap-1.5 rounded-card px-2.5 text-[13px] !font-normal"
        onClick={() => ungroup(group.id)}
      >
        <Icon name="minimize" size={14} />
        <span>解组</span>
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="none"
        className="h-8 gap-1.5 rounded-card px-2.5 text-[13px] !font-normal hover:!bg-danger hover:!text-fg-inverse"
        onClick={remove}
      >
        <Icon name="close" size={14} />
        <span>删除</span>
      </Button>
    </div>
  )
}
