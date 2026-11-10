import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Icon } from '../../components/Icon'
import type { FilmNode } from '../../stores/canvas'

/**
 * 旧版独立成片节点的兜底渲染。
 * 项目加载时会把成片合并进剪辑室节点，正常情况下不会出现这个组件。
 */
export function FilmNodeView({ selected }: NodeProps<FilmNode>) {
  return (
    <div className={`cnode studio-node ${selected ? 'is-selected' : ''}`}>
      <div className="cnode__title">
        <Icon name="film" size={12} />
        <span>成片</span>
      </div>

      <div className="cnode__card studio-node__card">
        <div className="studio-node__fallback">
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
