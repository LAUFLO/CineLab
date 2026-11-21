import { useCallback } from 'react'
import {
  BaseEdge,
  getBezierPath,
  useStore,
  type EdgeProps
} from '@xyflow/react'

type FlowEdgeProps = EdgeProps & {
  onClick?: (event: React.MouseEvent) => void
  onDoubleClick?: (event: React.MouseEvent) => void
}

export function FlowEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  markerEnd,
  onClick,
  onDoubleClick
}: FlowEdgeProps) {
  const nodeHighlighted = useStore(
    useCallback(
      (state) =>
        Boolean(
          state.nodeLookup.get(source)?.selected ||
          state.nodeLookup.get(target)?.selected
        ),
      [source, target]
    )
  )
  const glowEnabled = useStore((state) => state.edges.length <= 300)
  const highlighted = selected || nodeHighlighted

  const [path] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.35
  })

  return (
    <BaseEdge
      id={id}
      path={path}
      markerEnd={markerEnd}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      style={{
        stroke: highlighted ? 'var(--link)' : 'var(--edge-default)',
        strokeWidth: highlighted ? 2 : 1.5,
        filter:
          highlighted && glowEnabled
            ? 'drop-shadow(0 0 4px var(--glow))'
            : undefined,
        transition: 'stroke 150ms ease, stroke-width 150ms ease',
        cursor: 'pointer'
      }}
    />
  )
}
