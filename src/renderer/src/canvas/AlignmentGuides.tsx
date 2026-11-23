export interface AlignmentGuide {
  orientation: 'vertical' | 'horizontal'
  position: number
}

export function AlignmentGuides({ guides }: { guides: AlignmentGuide[] }) {
  if (guides.length === 0) return null

  return (
    <svg
      data-alignment-guides
      className="pointer-events-none fixed inset-0 z-[80] h-full w-full"
    >
      {guides.map((guide, index) => (
        <line
          key={`${guide.orientation}-${index}`}
          x1={guide.orientation === 'vertical' ? guide.position : 0}
          y1={guide.orientation === 'vertical' ? 0 : guide.position}
          x2={guide.orientation === 'vertical' ? guide.position : '100%'}
          y2={guide.orientation === 'vertical' ? '100%' : guide.position}
          stroke="var(--accent)"
          strokeWidth={1}
          strokeDasharray="8 6"
          opacity={0.9}
        />
      ))}
    </svg>
  )
}
