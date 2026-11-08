import type { CineNodeData } from '@shared/canvas-schema'
import { Icon } from '../../components/Icon'
import { useFilmStudyStore } from '../../stores/film-study'

interface StudyNodeCardProps {
  nodeId: string
  data: CineNodeData
}

export function StudyNodeCard({ nodeId, data }: StudyNodeCardProps) {
  const openRoom = useFilmStudyStore((state) => state.openRoom)
  const cancel = useFilmStudyStore((state) => state.cancel)
  const retry = useFilmStudyStore((state) => state.retry)
  const opening = useFilmStudyStore((state) => state.opening)
  const summary = data.studySummary
  const busy = data.status === 'queued' || data.status === 'running'
  const ready = data.status === 'done' && Boolean(data.studyId)
  const interval = summary?.interval ?? data.studyInterval ?? 1

  return (
    <div
      className="study-node-card nodrag nopan"
      onDoubleClick={(event) => {
        event.stopPropagation()
        if (ready) void openRoom(nodeId)
      }}
    >
      <div className="study-node-card__head">
        <span className="study-node-card__badge">
          <Icon name="film" size={12} />
          拉片室
        </span>
        <span className="study-node-card__source" title={data.sourceName}>
          {data.sourceName ?? '视频'}
        </span>
      </div>

      <div className="study-node-card__meta">
        {summary
          ? `${summary.frameCount} 帧 · ${summary.segmentCount} 段 · ${interval}s/帧`
          : `${interval}s/帧`}
      </div>

      {busy ? (
        <div className="study-node-card__progress">
          <div
            className="study-node-card__progress-fill"
            style={{ width: `${Math.max(2, data.progress ?? 0)}%` }}
          />
        </div>
      ) : null}

      {data.status === 'error' ? (
        <div className="study-node-card__error" title={data.error}>
          {data.error ?? '抽帧失败'}
        </div>
      ) : null}

      <div className="study-node-card__actions">
        {busy ? (
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={(event) => {
              event.stopPropagation()
              void cancel(nodeId)
            }}
          >
            取消抽帧
          </button>
        ) : data.status === 'error' ? (
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={(event) => {
              event.stopPropagation()
              void retry(nodeId)
            }}
          >
            重试抽帧
          </button>
        ) : !ready ? (
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={(event) => {
              event.stopPropagation()
              void retry(nodeId)
            }}
          >
            开始抽帧
          </button>
        ) : (
          <button
            type="button"
            className="study-node-card__enter"
            disabled={!ready || opening}
            onClick={(event) => {
              event.stopPropagation()
              void openRoom(nodeId)
            }}
          >
            <Icon name="play" size={12} />
            {opening ? '正在打开…' : '进入拉片室'}
          </button>
        )}
      </div>
    </div>
  )
}
