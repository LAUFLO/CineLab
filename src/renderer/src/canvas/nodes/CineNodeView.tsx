import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react'
import { NODE_META, type NodeKind } from '@shared/canvas-schema'
import { Icon, type IconName } from '../../components/Icon'
import type { CineNode } from '../../stores/canvas'
import { useUIStore } from '../../stores/ui'

const ASSET_BASE = 'cinelab-asset://local'

const NODE_ICON: Record<NodeKind, IconName> = {
  text: 'text',
  image: 'image',
  video: 'video',
  audio: 'audio'
}

export function CineNodeView({ id, data, selected }: NodeProps<CineNode>) {
  const meta = NODE_META[data.kind]
  const { screenToFlowPosition } = useReactFlow()
  const openMenu = useUIStore((state) => state.openMenu)

  const latest =
    data.outputs && data.outputs.length > 0
      ? data.outputs[data.outputs.length - 1]
      : null

  const assetSrc = latest ? `${ASSET_BASE}/${latest.path}` : data.outputUrl
  const isBusy = data.status === 'queued' || data.status === 'running'

  const openFromHandle = (
    event: React.MouseEvent,
    handle: 'source' | 'target'
  ): void => {
    event.stopPropagation()
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }

    openMenu({
      screen: { x: rect.right + 10, y: rect.top - 6 },
      flow: screenToFlowPosition(center),
      source: { nodeId: id, handle }
    })
  }

  return (
    <div className={`cnode ${selected ? 'is-selected' : ''}`}>
      <div className="cnode__title">
        <Icon name={NODE_ICON[data.kind]} size={12} />
        <span>{data.title}</span>
        {data.status === 'done' ? <span className="cnode__badge">已完成</span> : null}
        {data.status === 'error' ? <span className="cnode__badge is-error">失败</span> : null}
      </div>

      <div className="cnode__card" style={{ minHeight: meta.height }}>
        <div className={`cnode__preview cnode__preview--${data.kind}`}>
          {assetSrc && data.kind === 'image' ? (
            <img src={assetSrc} alt="" className="cnode__media" loading="lazy" />
          ) : assetSrc && data.kind === 'video' ? (
            <video src={assetSrc} className="cnode__media" muted playsInline />
          ) : (
            <Icon
              name={NODE_ICON[data.kind]}
              size={data.kind === 'text' ? 44 : 40}
              className="cnode__placeholder"
            />
          )}

          {data.kind === 'text' && data.text ? (
            <p className="cnode__text">{data.text}</p>
          ) : null}

          {isBusy ? (
            <div className="cnode__progress">
              <div
                className="cnode__progress-bar"
                style={{ width: `${data.progress ?? 0}%` }}
              />
              <span className="cnode__progress-text">
                {data.status === 'queued'
                  ? '排队中'
                  : `${Math.round(data.progress ?? 0)}%`}
              </span>
            </div>
          ) : null}

          {data.status === 'error' && data.error ? (
            <div className="cnode__error" title={data.error}>
              {data.error}
            </div>
          ) : null}
        </div>
      </div>

      <Handle
        type="target"
        position={Position.Left}
        className="cnode__handle cnode__handle--left"
        title="接收上游连线"
      >
        <Icon name="plus" size={12} />
      </Handle>

      <Handle
        type="source"
        position={Position.Right}
        className="cnode__handle cnode__handle--right"
        title="生成下游节点"
        onClick={(event) => openFromHandle(event, 'source')}
      >
        <Icon name="plus" size={12} />
      </Handle>
    </div>
  )
}
