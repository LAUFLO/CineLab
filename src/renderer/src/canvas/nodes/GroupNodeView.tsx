import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react'
import { Icon } from '../../components/Icon'
import { useCanvasStore, type GroupNode } from '../../stores/canvas'
import { useUIStore } from '../../stores/ui'
import { Input } from '../../components/ui'

export function GroupNodeView({ id, data, selected }: NodeProps<GroupNode>) {
  const childCount = useCanvasStore(
    (state) => state.nodes.filter((node) => node.parentId === id).length
  )
  const renameGroup = useCanvasStore((state) => state.renameGroup)
  const renameId = useUIStore((state) => state.groupRenameId)
  const clearGroupRename = useUIStore((state) => state.clearGroupRename)
  const openMenu = useUIStore((state) => state.openMenu)
  const { screenToFlowPosition } = useReactFlow()

  const openFromHandle = (event: React.MouseEvent): void => {
    event.stopPropagation()
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const center = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    }

    openMenu({
      screen: { x: rect.right + 10, y: rect.top - 6 },
      flow: screenToFlowPosition(center),
      source: { nodeId: id, handle: 'source' }
    })
  }

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(data.title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (renameId !== id) return
    setDraft(data.title)
    setEditing(true)
    clearGroupRename()
  }, [renameId, id, data.title, clearGroupRename])

  useEffect(() => {
    if (!editing) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing])

  const commit = (): void => {
    renameGroup(id, draft)
    setEditing(false)
  }

  const cancel = (): void => {
    setDraft(data.title)
    setEditing(false)
  }

  return (
    <div
      data-node-kind="group"
      data-selected={selected || undefined}
      className={`relative h-full w-full rounded-panel transition-[border-color,box-shadow] duration-[120ms] ${
        data.mode === 'storyboard'
          ? 'border-[1.5px] border-dashed'
          : 'border border-solid'
      } ${
        selected
          ? 'border-[var(--group-color)] shadow-[0_0_0_1px_color-mix(in_srgb,var(--group-color)_45%,transparent)]'
          : 'border-[color-mix(in_srgb,var(--group-color)_60%,transparent)]'
      } bg-[color-mix(in_srgb,var(--group-color)_6%,transparent)]`}
      style={
        {
          '--group-color': `var(--group-${data.color}, var(--group-blue))`
        } as CSSProperties
      }
    >
      <div
        className="flex h-9 cursor-grab items-center gap-2 px-3"
        onDoubleClick={(event) => {
          event.stopPropagation()
          setDraft(data.title)
          setEditing(true)
        }}
      >
        {editing ? (
          <Input
            ref={inputRef}
            className="nodrag !h-6 min-w-0 flex-1 !rounded-md !border-[var(--group-color)] !bg-surface !px-1.5 !text-[13px]"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commit()
              if (event.key === 'Escape') cancel()
            }}
            onBlur={commit}
          />
        ) : (
          <span className="truncate text-[13px] font-medium text-fg">
            {data.title}
          </span>
        )}
        <span className="ml-auto text-[11px] whitespace-nowrap text-fg-subtle">
          {childCount} 个节点
        </span>
      </div>

      <Handle
        type="target"
        position={Position.Left}
        data-handle="left"
        title="接收上游连线"
      >
        <Icon name="plus" size={12} />
      </Handle>

      <Handle
        type="source"
        position={Position.Right}
        data-handle="right"
        title="引用组内节点生成"
        onClick={openFromHandle}
      >
        <Icon name="plus" size={12} />
      </Handle>
    </div>
  )
}
