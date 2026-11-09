import { useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Icon } from '../../components/Icon'
import { useCanvasStore, type StageNode } from '../../stores/canvas'
import { useStageStore } from '../../stage/stageStore'

export function StageNodeView({ id, data, selected }: NodeProps<StageNode>) {
  const patchStageNode = useCanvasStore((state) => state.patchStageNode)
  const openStage = useStageStore((state) => state.openStage)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(data.title)

  const submitTitle = (): void => {
    const next = titleDraft.trim()
    setEditingTitle(false)
    if (next && next !== data.title) patchStageNode(id, { title: next })
  }

  return (
    <div className={`cnode stage-node ${selected ? 'is-selected' : ''}`}>
      <div
        className="cnode__title"
        onDoubleClick={(event) => {
          event.stopPropagation()
          setTitleDraft(data.title)
          setEditingTitle(true)
        }}
      >
        <Icon name="frame" size={12} />
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
        <span className="stage-node__badge">场景</span>
      </div>

      <div
        className="cnode__card stage-node__card"
        onDoubleClick={(event) => {
          event.stopPropagation()
          void openStage(id)
        }}
      >
        <div className="stage-node__preview">
          <Icon name="grid" size={32} />
          <span>3D 片场</span>
        </div>

        <div className="stage-node__stats">
          <span>{data.objectCount ?? 0} 对象</span>
          <span className="stage-node__dot">·</span>
          <span>{data.cameraCount ?? 0} 机位</span>
          <span className="stage-node__dot">·</span>
          <span>{data.shotCount ?? 0} 镜头</span>
        </div>

        <button
          type="button"
          className="stage-node__open nodrag nopan"
          onClick={(event) => {
            event.stopPropagation()
            void openStage(id)
          }}
        >
          <Icon name="frame" size={13} />
          打开导演台
        </button>
      </div>

      <Handle
        type="target"
        position={Position.Left}
        className="cnode__handle cnode__handle--left"
        title="接收参考素材"
      >
        <Icon name="plus" size={12} className="cnode__handle-icon" />
      </Handle>

      <Handle
        type="source"
        position={Position.Right}
        className="cnode__handle cnode__handle--right stage-node__handle--derived"
        isConnectable={false}
        title="截图与预演由导演台派生"
      />
    </div>
  )
}
