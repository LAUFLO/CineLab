import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Icon } from '../../components/Icon'
import type { FilmNode } from '../../stores/canvas'

const CARD_CLASS =
  'relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-card bg-surface-raised shadow-node transition-colors duration-[120ms]'
const CARD_BORDER_CLASS = 'border border-border group-hover:border-border-strong'
const CARD_SELECTED_BORDER_CLASS = 'border-2 border-border-selected'

const TITLE_CLASS =
  'flex h-7 shrink-0 items-center gap-[5px] overflow-hidden pl-1 text-xs whitespace-nowrap text-fg-muted group-data-[selected]:text-fg'

/**
 * 旧版独立成片节点的兜底渲染。
 * 项目加载时会把成片合并进剪辑室节点，正常情况下不会出现这个组件。
 */
export function FilmNodeView({ selected }: NodeProps<FilmNode>) {
  return (
    <div
      data-cnode
      data-node-kind="film"
      data-selected={selected || undefined}
      className="group relative flex h-full w-full flex-col"
    >
      <div className={TITLE_CLASS}>
        <Icon name="film" size={12} />
        <span>成片</span>
      </div>

      <div
        data-node-card
        className={`${CARD_CLASS} ${
          selected ? CARD_SELECTED_BORDER_CLASS : CARD_BORDER_CLASS
        }`}
      >
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-xs text-fg-subtle">
          <Icon name="film" size={30} />
          <span>成片已合并到剪辑室节点</span>
          <span>重新打开项目会自动迁移</span>
        </div>
      </div>

      <Handle
        type="target"
        position={Position.Left}
        data-handle="left" data-passive
        isConnectable={false}
      />

      <Handle
        type="source"
        position={Position.Right}
        data-handle="right"
      />
    </div>
  )
}
