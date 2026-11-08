import { useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { formatTimecode } from '@shared/timeline-layout'
import { Icon } from '../../components/Icon'
import {
  isFilmNode,
  useCanvasStore,
  type StudioNode
} from '../../stores/canvas'
import { useStudioStore } from '../../stores/studio'

const FILM_STATUS_LABEL: Record<string, string> = {
  pending: '待生成',
  rendering: '渲染中',
  ready: '可导出',
  stale: '待更新',
  empty: '时间线为空',
  missing: '成片缺失'
}

export function StudioNodeView({ id, data, selected }: NodeProps<StudioNode>) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(data.title)
  const patchStudioNode = useCanvasStore((state) => state.patchStudioNode)
  const status = useCanvasStore((state) => {
    const hasClips = (data.clipCount ?? 0) > 0
    if (!data.filmNodeId) return hasClips ? 'missing' : 'pending'
    const film = state.nodes.find((node) => node.id === data.filmNodeId)
    if (!film || !isFilmNode(film)) return hasClips ? 'missing' : 'pending'
    return film.data.filmStatus ?? 'pending'
  })
  const openStudio = useStudioStore((state) => state.openStudio)

  const submitTitle = (): void => {
    const next = titleDraft.trim()
    setEditingTitle(false)
    if (next && next !== data.title) patchStudioNode(id, { title: next })
  }

  const clipCount = data.clipCount ?? 0
  const durationMs = data.durationMs ?? 0

  const open = (event: React.MouseEvent): void => {
    event.stopPropagation()
    openStudio(id)
  }

  return (
    <div className={`cnode studio-node ${selected ? 'is-selected' : ''}`}>
      <div
        className="cnode__title"
        onDoubleClick={(event) => {
          event.stopPropagation()
          setTitleDraft(data.title)
          setEditingTitle(true)
        }}
      >
        <Icon name="film" size={12} />
        {editingTitle ? (
          <input
            className="cnode__title-input nodrag nopan"
            value={titleDraft}
            autoFocus
            onChange={(event) => setTitleDraft(event.target.value)}
            onBlur={submitTitle}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submitTitle()
              if (event.key === 'Escape') setEditingTitle(false)
            }}
            onClick={(event) => event.stopPropagation()}
          />
        ) : (
          <span>{data.title}</span>
        )}
        <span className={`studio-node__badge is-${status}`}>
          {FILM_STATUS_LABEL[status] ?? status}
        </span>
      </div>

      <div className="cnode__card studio-node__card" onDoubleClick={open}>
        <div className="studio-node__body">
          <div className="studio-node__stats">
            <span>{clipCount} 个片段</span>
            <span className="studio-node__dot">·</span>
            <span>{formatTimecode(durationMs)}</span>
          </div>
          <button
            type="button"
            className="studio-node__open nodrag nopan"
            onClick={open}
          >
            <Icon name="film" size={13} />
            进入剪辑室
          </button>
        </div>
      </div>

      <Handle
        type="target"
        position={Position.Left}
        className="cnode__handle cnode__handle--left"
        title="接收素材连线"
      >
        <Icon name="plus" size={12} className="cnode__handle-icon" />
      </Handle>

      <Handle
        type="source"
        position={Position.Right}
        className="cnode__handle cnode__handle--right studio-node__handle--derived"
        isConnectable={false}
        title="成片由系统自动派生"
      />
    </div>
  )
}
