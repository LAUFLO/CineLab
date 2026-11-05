import { useEffect, useRef, useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import { useCanvasStore, type GroupNode } from '../../stores/canvas'
import { useUIStore } from '../../stores/ui'

export function GroupNodeView({ id, data, selected }: NodeProps<GroupNode>) {
  const childCount = useCanvasStore(
    (state) => state.nodes.filter((node) => node.parentId === id).length
  )
  const renameGroup = useCanvasStore((state) => state.renameGroup)
  const renameId = useUIStore((state) => state.groupRenameId)
  const clearGroupRename = useUIStore((state) => state.clearGroupRename)

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
        selected ? 'is-selected' : ''
      }`}
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
    </div>
  )
}
