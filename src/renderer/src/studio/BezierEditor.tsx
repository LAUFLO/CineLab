import { useRef, useState } from 'react'

type BezierPoints = [number, number, number, number]

export function BezierEditor({
  value,
  onChange
}: {
  value: BezierPoints
  onChange: (value: BezierPoints) => void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [dragging, setDragging] = useState<0 | 1 | null>(null)
  const width = 220
  const height = 120
  const pad = 16
  const [x1, y1, x2, y2] = value

  const toX = (x: number): number => pad + x * (width - pad * 2)
  const toY = (y: number): number => height - pad - y * (height - pad * 2)

  const update = (event: React.PointerEvent<SVGSVGElement>): void => {
    if (dragging === null || !svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const x = Math.min(
      1,
      Math.max(
        0,
        (((event.clientX - rect.left) / rect.width) * width - pad) /
          (width - pad * 2)
      )
    )
    const y = Math.min(
      1,
      Math.max(
        0,
        (height -
          ((event.clientY - rect.top) / rect.height) * height -
          pad) /
          (height - pad * 2)
      )
    )
    const next = [...value] as BezierPoints
    next[dragging * 2] = x
    next[dragging * 2 + 1] = y
    onChange(next)
  }

  return (
    <svg
      ref={svgRef}
      className="studio-bezier"
      viewBox={`0 0 ${width} ${height}`}
      onPointerMove={update}
      onPointerUp={() => setDragging(null)}
      onPointerLeave={() => setDragging(null)}
    >
      <rect
        x={pad}
        y={pad}
        width={width - pad * 2}
        height={height - pad * 2}
        rx={4}
        fill="var(--surface)"
        stroke="var(--border)"
      />
      <line
        x1={toX(0)}
        y1={toY(0)}
        x2={toX(1)}
        y2={toY(1)}
        stroke="var(--border)"
        strokeDasharray="3 3"
      />
      <line
        x1={toX(0)}
        y1={toY(0)}
        x2={toX(x1)}
        y2={toY(y1)}
        stroke="var(--text-3)"
      />
      <line
        x1={toX(1)}
        y1={toY(1)}
        x2={toX(x2)}
        y2={toY(y2)}
        stroke="var(--text-3)"
      />
      <path
        d={`M ${toX(0)} ${toY(0)} C ${toX(x1)} ${toY(y1)} ${toX(x2)} ${toY(
          y2
        )} ${toX(1)} ${toY(1)}`}
        fill="none"
        stroke="var(--pick-bar)"
        strokeWidth={2}
      />
      <circle
        cx={toX(x1)}
        cy={toY(y1)}
        r={6}
        fill="var(--pick-bar)"
        style={{ cursor: 'grab' }}
        onPointerDown={(event) => {
          event.stopPropagation()
          setDragging(0)
        }}
      />
      <circle
        cx={toX(x2)}
        cy={toY(y2)}
        r={6}
        fill="var(--pick-bar)"
        style={{ cursor: 'grab' }}
        onPointerDown={(event) => {
          event.stopPropagation()
          setDragging(1)
        }}
      />
    </svg>
  )
}
