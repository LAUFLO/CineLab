import { useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Icon } from '../../components/Icon'
import { useCanvasStore, type StageNode } from '../../stores/canvas'
import { useStageStore } from '../../stage/stageStore'
import { Input, Button } from '../../components/ui'

const CARD_CLASS =
  'relative flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-hidden rounded-card border bg-surface-raised p-4 text-center shadow-node transition-colors duration-[120ms]'

const TITLE_CLASS =
  'flex h-7 shrink-0 items-center gap-[5px] overflow-hidden pl-1 text-xs whitespace-nowrap text-fg-muted group-data-[selected]:text-fg'

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
    <div
      data-cnode
      data-node-kind="stage"
      data-selected={selected || undefined}
      className="group relative flex h-full w-full flex-col"
    >
      <div
        className={TITLE_CLASS}
        onDoubleClick={(event) => {
          event.stopPropagation()
          setTitleDraft(data.title)
          setEditingTitle(true)
        }}
      >
        <Icon name="frame" size={12} />
        {editingTitle ? (
          <Input
            className="nodrag nopan !h-5 !w-[140px] !rounded-md !border-border-strong !bg-surface-hover !px-1.5 !text-xs"
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
        <span className="ml-auto rounded-pill bg-surface-hover px-[7px] py-px text-[10px] leading-4 whitespace-nowrap text-fg-muted">
          场景
        </span>
      </div>

      <div
        data-node-card
        className={`${CARD_CLASS} ${
          selected
            ? 'border-border-selected'
            : 'border-border group-hover:border-border-strong'
        }`}
        onDoubleClick={(event) => {
          event.stopPropagation()
          void openStage(id)
        }}
      >
        <div className="flex flex-col items-center gap-1 text-[11px] text-fg-subtle">
          <Icon name="grid" size={32} />
          <span>3D 片场</span>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-fg-muted">
          <span>{data.objectCount ?? 0} 对象</span>
          <span className="text-fg-subtle">·</span>
          <span>{data.cameraCount ?? 0} 机位</span>
          <span className="text-fg-subtle">·</span>
          <span>{data.shotCount ?? 0} 镜头</span>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="none"
          className="nodrag nopan !h-[30px] gap-[5px] self-center !rounded-md !border !border-border !bg-surface !px-3 !text-xs !font-normal !text-fg hover:!bg-surface-hover hover:!text-fg"
          onClick={(event) => {
            event.stopPropagation()
            void openStage(id)
          }}
        >
          <Icon name="frame" size={13} />
          打开导演台
        </Button>
      </div>

      <Handle
        type="target"
        position={Position.Left}
        data-handle="left"
        title="接收参考素材"
      >
        <Icon name="plus" size={12} />
      </Handle>

      <Handle
        type="source"
        position={Position.Right}
        data-handle="right" data-derived
        isConnectable={false}
        title="截图与预演由导演台派生"
      />
    </div>
  )
}
