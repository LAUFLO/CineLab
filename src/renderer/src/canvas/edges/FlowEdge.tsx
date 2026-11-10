import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react'

type FlowEdgeProps = EdgeProps & {
  onClick?: (event: React.MouseEvent) => void
  onDoubleClick?: (event: React.MouseEvent) => void
}

export function FlowEdge({
  id,
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
        stroke: selected ? 'var(--link)' : 'var(--edge-default)',
        strokeWidth: selected ? 2 : 1.5,
        filter: selected ? 'drop-shadow(0 0 4px var(--glow))' : undefined,
        transition: 'stroke 150ms ease, stroke-width 150ms ease',
        cursor: 'pointer'
      }}
    />
  )
}
