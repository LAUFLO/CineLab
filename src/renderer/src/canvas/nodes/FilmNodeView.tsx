import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Icon } from '../../components/Icon'
import type { FilmNode } from '../../stores/canvas'

const CARD_CLASS =
  'cnode__card relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-card border bg-surface-raised shadow-node transition-colors duration-[120ms]'

const TITLE_CLASS =
  'flex h-7 shrink-0 items-center gap-[5px] overflow-hidden pl-1 text-xs whitespace-nowrap text-fg-muted group-[.is-selected]:text-fg'

/**
 * 旧版独立成片节点的兜底渲染。
 * 项目加载时会把成片合并进剪辑室节点，正常情况下不会出现这个组件。
 */
export function FilmNodeView({ selected }: NodeProps<FilmNode>) {
  return (
    <div
      className={`cnode group relative flex h-full w-full flex-col ${
        selected ? 'is-selected' : ''
      }`}
    >
      <div className={TITLE_CLASS}>
        <Icon name="film" size={12} />
        <span>成片</span>
      </div>

      <div
        className={`${CARD_CLASS} ${
          selected
            ? 'border-border-selected'
            : 'border-border group-hover:border-border-strong'
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
        className="cnode__handle cnode__handle--left film-node__handle--passive"
        isConnectable={false}
      />

      <Handle
        type="source"
        position={Position.Right}
        className="cnode__handle cnode__handle--right"
      />
    </div>
  )
}
