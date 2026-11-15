import type {
  FilmStudy,
  FilmStudyAudiencePoint,
  FilmStudySegment
} from '@shared/film-study'
import { Button, cn } from '../../components/ui'

function studyTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = Math.max(0, seconds - minutes * 60)
  return `${String(minutes).padStart(2, '0')}:${rest.toFixed(1).padStart(4, '0')}`
}

function emotionTone(type: string): string {
  if (['tension', 'anxiety', 'conflict', 'sadness'].includes(type)) {
    return 'fill-danger'
  }
  if (['warmth', 'romance', 'hope', 'release'].includes(type)) {
    return 'fill-warning'
  }
  if (['inspiration', 'humor'].includes(type)) {
    return 'fill-success'
  }
  return 'fill-link'
}

const INSIGHTS_CLASS = 'flex flex-col gap-[7px]'
const SIDE_TITLE_CLASS = 'mb-1.5 text-[11px] text-fg-subtle'
const EMPTY_CLASS = 'py-2 text-[11px] text-fg-subtle'
const LANE_CLASS =
  'rounded-lg border border-border bg-surface-raised px-2 py-[7px]'
const LANE_HEAD_CLASS =
  'flex items-center justify-between gap-2 px-0.5 pt-px pb-[5px] text-[11px] text-fg-muted'
const LANE_COUNT_CLASS = 'text-fg-subtle tabular-nums'
const LANE_EMPTY_CLASS = 'px-0.5 py-[3px] text-[10px] text-fg-subtle'
const ROW_CLASS =
  '!flex w-full !items-center !justify-start gap-[7px] !rounded-[6px] px-1.5 py-[5px] text-left !font-normal'
const ROW_ACTIVE_CLASS = 'bg-surface-hover !text-fg'
const TREE_CLASS =
  'rounded-lg border border-border bg-surface-raised px-2 py-1.5 [&[open]>summary]:mb-[3px]'
const TREE_SUMMARY_CLASS =
  'flex cursor-pointer items-center justify-between gap-2 py-0.5 text-[11px] text-fg-muted select-none [&::-webkit-details-marker]:hidden'
const CHART_CARD_CLASS =
  'rounded-lg border border-border bg-surface-raised p-[7px]'
const ROW_TIME_CLASS = 'shrink-0 text-[10px] text-fg-subtle tabular-nums'
const ROW_TITLE_CLASS = 'min-w-0 flex-1 truncate text-[11.5px] font-medium'

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
  const segments = [...study.segments].sort((a, b) => a.startTime - b.startTime)

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
          (a.segments[0]?.startTime ?? 0) - (b.segments[0]?.startTime ?? 0)
      )
  })()

  return (
    <div className={INSIGHTS_CLASS}>
      <div className={SIDE_TITLE_CLASS}>剧情泳道</div>
      {fallbackGroups.length === 0 ? (
        <div className={EMPTY_CLASS}>导入 AI 结果后显示剧情线</div>
      ) : (
        fallbackGroups.map((group) => (
          <div className={LANE_CLASS} key={group.id}>
            <div className={LANE_HEAD_CLASS}>
              <span>{group.title}</span>
              <span className={LANE_COUNT_CLASS}>{group.segments.length}</span>
            </div>
            {group.segments.length === 0 ? (
              <div className={LANE_EMPTY_CLASS}>暂无段落</div>
            ) : (
              group.segments.map((segment) => (
                <Button
                  key={segment.id}
                  type="button"
                  variant="ghost"
                  size="none"
                  className={cn(
                    ROW_CLASS,
                    segment.id === selectedSegmentId && ROW_ACTIVE_CLASS
                  )}
                  onClick={() => onSelectSegment(segment)}
                >
                  <span className={ROW_TIME_CLASS}>
                    {studyTime(segment.startTime)}
                  </span>
                  <strong className={ROW_TITLE_CLASS}>{segment.title}</strong>
                </Button>
              ))
            )}
          </div>
        ))
      )}

      <div className={cn(SIDE_TITLE_CLASS, 'mt-4')}>结构树</div>
      {structureGroups.length === 0 ? (
        <div className={EMPTY_CLASS}>导入 AI 结果后显示结构角色</div>
      ) : (
        structureGroups.map((group, index) => (
          <details className={TREE_CLASS} key={group.title} open={index === 0}>
            <summary className={TREE_SUMMARY_CLASS}>
              <span>{group.title}</span>
              <span className={LANE_COUNT_CLASS}>{group.segments.length}</span>
            </summary>
            {group.segments.map((segment) => (
              <Button
                key={segment.id}
                type="button"
                variant="ghost"
                size="none"
                className={cn(
                  ROW_CLASS,
                  segment.id === selectedSegmentId && ROW_ACTIVE_CLASS
                )}
                onClick={() => onSelectSegment(segment)}
              >
                <span className={ROW_TIME_CLASS}>
                  {studyTime(segment.startTime)}
                </span>
                <strong className={ROW_TITLE_CLASS}>{segment.title}</strong>
              </Button>
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

export function EmotionPanel({ points, duration, onSeek }: EmotionPanelProps) {
  const sorted = [...points].sort((a, b) => a.time - b.time)
  if (sorted.length === 0) {
    return (
      <div className={INSIGHTS_CLASS}>
        <div className={SIDE_TITLE_CLASS}>观众情绪曲线</div>
        <div className={EMPTY_CLASS}>导入 AI 结果后显示情绪曲线</div>
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
    <div className={INSIGHTS_CLASS}>
      <div className={SIDE_TITLE_CLASS}>观众情绪曲线</div>
      <div className={CHART_CARD_CLASS}>
        <svg
          viewBox="0 0 100 50"
          preserveAspectRatio="none"
          aria-hidden="true"
          className="block h-[140px] w-full"
        >
          <line
            x1="0"
            y1="50"
            x2="100"
            y2="50"
            strokeWidth="0.5"
            vectorEffect="non-scaling-stroke"
            className="stroke-divider"
          />
          <polygon points={area} className="fill-surface-hover" />
          <polyline
            points={polyline}
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            className="fill-none stroke-link"
          />
          {sorted.map((point, index) => (
            <circle
              key={point.id}
              cx={coords[index].x}
              cy={coords[index].y}
              r="1.4"
              strokeWidth="0.5"
              vectorEffect="non-scaling-stroke"
              className={cn(emotionTone(point.emotionType), 'stroke-surface')}
            >
              <title>
                {studyTime(point.time)} · {point.title} · {point.intensity}
              </title>
            </circle>
          ))}
        </svg>
      </div>
      <div className="flex flex-col gap-0.5">
        {sorted.map((point) => (
          <Button
            key={point.id}
            type="button"
            variant="ghost"
            size="none"
            className={ROW_CLASS}
            onClick={() => onSeek(point.time)}
          >
            <span className={ROW_TIME_CLASS}>{studyTime(point.time)}</span>
            <strong className={ROW_TITLE_CLASS}>{point.title}</strong>
            <span className="shrink-0 text-[10px] text-fg-subtle tabular-nums">
              {point.intensity}
            </span>
          </Button>
        ))}
      </div>
    </div>
  )
}
