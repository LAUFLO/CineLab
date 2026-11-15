export interface AlignmentGuide {
  orientation: 'vertical' | 'horizontal'
  position: number
}

export function AlignmentGuides({ guides }: { guides: AlignmentGuide[] }) {
  if (guides.length === 0) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-[80]">
      {guides.map((guide, index) => (
        <div
          key={`${guide.orientation}-${index}`}
          className={`absolute border-dashed border-link opacity-[0.85] ${
            guide.orientation === 'vertical'
              ? 'inset-y-0 border-l'
              : 'inset-x-0 border-t'
          }`}
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
