export interface AlignmentGuide {
  orientation: 'vertical' | 'horizontal'
  position: number
}

export function AlignmentGuides({ guides }: { guides: AlignmentGuide[] }) {
  if (guides.length === 0) return null

  return (
    <div className="alignment-guides">
      {guides.map((guide, index) => (
        <div
          key={`${guide.orientation}-${index}`}
          className={`alignment-guide alignment-guide--${guide.orientation}`}
          style={
            guide.orientation === 'vertical'
              ? { left: guide.position }
              : { top: guide.position }
          }
        />
      ))}
    </div>
  )
}
