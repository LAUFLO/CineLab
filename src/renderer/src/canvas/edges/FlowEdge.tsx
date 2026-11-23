import {
  BaseEdge,
  getBezierPath,
  useEdgesStore,
  useNode,
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
  const sourceSelected = useNode(source)?.selected ?? false
  const targetSelected = useNode(target)?.selected ?? false
  const glowEnabled = useEdgesStore((state) => state.edges.length <= 300)
  const highlighted = selected || sourceSelected || targetSelected

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
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        style={{
          stroke: highlighted ? 'var(--text-1)' : 'var(--edge-default)',
          strokeWidth: 1.5,
          transition: 'stroke 150ms ease, stroke-width 150ms ease',
          cursor: 'pointer'
        }}
      />
      {highlighted ? (
        <path
          d={path}
          className={
            glowEnabled
              ? 'react-flow__edge-flow-band [animation:edge-flow_1.2s_linear_infinite]'
              : 'react-flow__edge-flow-band'
          }
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray={glowEnabled ? '12 28' : undefined}
          pathLength={glowEnabled ? 100 : undefined}
          style={{
            pointerEvents: 'none',
            filter: glowEnabled
              ? 'drop-shadow(0 0 5px var(--glow))'
              : undefined
          }}
        />
      ) : null}
    </>
  )
}
