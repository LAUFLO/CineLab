import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react'

export function FlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  markerEnd
}: EdgeProps) {
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
      style={{
        stroke: selected ? 'var(--link)' : 'var(--edge-default)',
        strokeWidth: selected ? 2 : 1.5,
        filter: selected ? 'drop-shadow(0 0 4px var(--glow))' : undefined,
        transition: 'stroke 150ms ease, stroke-width 150ms ease'
      }}
    />
  )
}
