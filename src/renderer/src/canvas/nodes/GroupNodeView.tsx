import { useEffect, useRef, useState } from 'react'
import {
  Handle,
  Position,
  useReactFlow,
  type NodeProps
} from '@xyflow/react'
import { Icon } from '../../components/Icon'
import { useCanvasStore, type GroupNode } from '../../stores/canvas'
import { useUIStore } from '../../stores/ui'

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
      className={`group-node group-node--${data.color} ${
        data.mode === 'storyboard' ? 'group-node--storyboard' : ''
      } ${selected ? 'is-selected' : ''}`}
    >
      <div
        className="group-node__header"
        onDoubleClick={(event) => {
          event.stopPropagation()
          setDraft(data.title)
          setEditing(true)
        }}
      >
        {editing ? (
          <input
            ref={inputRef}
            className="group-node__input nodrag"
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
          <span className="group-node__title">{data.title}</span>
        )}
        <span className="group-node__count">{childCount} 个节点</span>
      </div>

      <Handle
        type="target"
        position={Position.Left}
        className="cnode__handle cnode__handle--left"
        title="接收上游连线"
      >
        <Icon name="plus" size={12} className="cnode__handle-icon" />
      </Handle>

      <Handle
        type="source"
        position={Position.Right}
        className="cnode__handle cnode__handle--right"
        title="引用组内节点生成"
        onClick={openFromHandle}
      >
        <Icon name="plus" size={12} className="cnode__handle-icon" />
      </Handle>
    </div>
  )
}
