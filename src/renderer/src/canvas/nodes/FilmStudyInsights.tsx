import type {
  FilmStudy,
  FilmStudyAudiencePoint,
  FilmStudySegment
} from '@shared/film-study'

function studyTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = Math.max(0, seconds - minutes * 60)
  return `${String(minutes).padStart(2, '0')}:${rest.toFixed(1).padStart(4, '0')}`
}

function emotionColor(type: string): string {
  if (
    ['tension', 'anxiety', 'conflict', 'sadness'].includes(type)
  ) {
    return 'var(--danger)'
  }
  if (['warmth', 'romance', 'hope', 'release'].includes(type)) {
    return 'var(--warning)'
  }
  if (['inspiration', 'humor'].includes(type)) {
    return 'var(--success)'
  }
  return 'var(--link)'
}

interface StructurePanelProps {
  study: FilmStudy
  selectedSegmentId: string | null
  onSelectSegment: (segment: FilmStudySegment) => void
}

export function StructurePanel({
  study,
  selectedSegmentId,
  onSelectSegment
}: StructurePanelProps) {
  const segments = [...study.segments].sort(
    (a, b) => a.startTime - b.startTime
  )

  const configuredLines = study.storyLines ?? []
  const lineGroups = configuredLines.map((line) => ({
    id: line.id,
    title: line.title,
    segments: segments.filter((segment) => {
      const primary = segment.primaryLine
      const shared = segment.sharedLines ?? []
      return (
        primary === line.id ||
        primary === line.title ||
        shared.includes(line.id) ||
        shared.includes(line.title)
      )
    })
  }))

  const fallbackGroups = (() => {
    if (lineGroups.some((group) => group.segments.length > 0)) {
      return lineGroups
    }
    const byLine = new Map<string, FilmStudySegment[]>()
    for (const segment of segments) {
      const key = segment.primaryLine || segment.type || '未分类'
      const list = byLine.get(key) ?? []
      list.push(segment)
      byLine.set(key, list)
    }
    return [...byLine.entries()].map(([title, list]) => ({
      id: title,
      title,
      segments: list
    }))
  })()

  const structureGroups = (() => {
    const map = new Map<string, FilmStudySegment[]>()
    for (const segment of segments) {
      const key = segment.structureRole || segment.type || '未分类'
      const list = map.get(key) ?? []
      list.push(segment)
      map.set(key, list)
    }
    return [...map.entries()]
      .map(([title, list]) => ({ title, segments: list }))
      .sort(
        (a, b) =>
          (a.segments[0]?.startTime ?? 0) -
          (b.segments[0]?.startTime ?? 0)
      )
  })()

  return (
    <div className="film-study-insights">
      <div className="film-study-room__side-title">剧情泳道</div>
      {fallbackGroups.length === 0 ? (
        <div className="film-study-empty">导入 AI 结果后显示剧情线</div>
      ) : (
        fallbackGroups.map((group) => (
          <div className="film-study-lane" key={group.id}>
            <div className="film-study-lane__head">
              <span>{group.title}</span>
              <span>{group.segments.length}</span>
            </div>
            {group.segments.length === 0 ? (
              <div className="film-study-lane__empty">暂无段落</div>
            ) : (
              group.segments.map((segment) => (
                <button
                  key={segment.id}
                  type="button"
                  className={`film-study-insight-row${
                    segment.id === selectedSegmentId ? ' is-active' : ''
                  }`}
                  onClick={() => onSelectSegment(segment)}
                >
                  <span>{studyTime(segment.startTime)}</span>
                  <strong>{segment.title}</strong>
                </button>
              ))
            )}
          </div>
        ))
      )}

      <div className="film-study-room__side-title film-study-insights__gap">
        结构树
      </div>
      {structureGroups.length === 0 ? (
        <div className="film-study-empty">导入 AI 结果后显示结构角色</div>
      ) : (
        structureGroups.map((group, index) => (
          <details
            className="film-study-tree"
            key={group.title}
            open={index === 0}
          >
            <summary>
              <span>{group.title}</span>
              <span>{group.segments.length}</span>
            </summary>
            {group.segments.map((segment) => (
              <button
                key={segment.id}
                type="button"
                className={`film-study-insight-row${
                  segment.id === selectedSegmentId ? ' is-active' : ''
                }`}
                onClick={() => onSelectSegment(segment)}
              >
                <span>{studyTime(segment.startTime)}</span>
                <strong>{segment.title}</strong>
              </button>
            ))}
          </details>
        ))
      )}
    </div>
  )
}

interface EmotionPanelProps {
  points: FilmStudyAudiencePoint[]
  duration: number
  onSeek: (time: number) => void
}

export function EmotionPanel({
  points,
  duration,
  onSeek
}: EmotionPanelProps) {
  const sorted = [...points].sort((a, b) => a.time - b.time)
  if (sorted.length === 0) {
    return (
      <div className="film-study-insights">
        <div className="film-study-room__side-title">观众情绪曲线</div>
        <div className="film-study-empty">导入 AI 结果后显示情绪曲线</div>
      </div>
    )
  }

  const width = Math.max(duration, 1)
  const coords = sorted.map((point) => ({
    x: Math.max(0, Math.min(100, (point.time / width) * 100)),
    y: 50 - Math.max(0, Math.min(100, point.intensity)) * 0.46
  }))
  const polyline = coords.map((point) => `${point.x},${point.y}`).join(' ')
  const area = `0,50 ${polyline} 100,50`

  return (
    <div className="film-study-insights">
      <div className="film-study-room__side-title">观众情绪曲线</div>
      <div className="film-study-emotion">
        <svg
          viewBox="0 0 100 50"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <line
            x1="0"
            y1="50"
            x2="100"
            y2="50"
            stroke="var(--divider)"
            strokeWidth="0.5"
            vectorEffect="non-scaling-stroke"
          />
          <polygon points={area} fill="var(--surface-hover)" />
          <polyline
            points={polyline}
            fill="none"
            stroke="var(--link)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
          {sorted.map((point, index) => (
            <circle
              key={point.id}
              cx={coords[index].x}
              cy={coords[index].y}
              r="1.4"
              fill={emotionColor(point.emotionType)}
              stroke="var(--surface)"
              strokeWidth="0.5"
              vectorEffect="non-scaling-stroke"
            >
              <title>
                {studyTime(point.time)} · {point.title} · {point.intensity}
              </title>
            </circle>
          ))}
        </svg>
      </div>
      <div className="film-study-emotion__list">
        {sorted.map((point) => (
          <button
            key={point.id}
            type="button"
            className="film-study-insight-row"
            onClick={() => onSeek(point.time)}
          >
            <span>{studyTime(point.time)}</span>
            <strong>{point.title}</strong>
            <span className="film-study-emotion__value">
              {point.intensity}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
