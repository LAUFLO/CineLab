import { createPortal } from 'react-dom'
import { useFilmStudyStore } from '../../stores/film-study'
import { useUIStore } from '../../stores/ui'
import { Icon } from '../../components/Icon'
import {
  buildStudyTableMarkdown,
  segmentCopyText,
  segmentDuration,
  segmentMetaLine,
  studyClock
} from './study-sheet'

export function FilmStudySheet() {
  const nodeId = useFilmStudyStore((state) => state.sheetNodeId)
  const study = useFilmStudyStore((state) => state.sheetStudy)
  const loading = useFilmStudyStore((state) => state.sheetLoading)
  const close = useFilmStudyStore((state) => state.closeSheet)
  const openRoom = useFilmStudyStore((state) => state.openRoom)
  const showToast = useUIStore((state) => state.showToast)

  if (!nodeId) return null

  const copy = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      showToast('已复制')
    } catch {
      showToast('复制失败', 'error')
    }
  }

  const body = loading ? (
    <div className="film-study-sheet__empty">正在读取分镜表…</div>
  ) : !study ? (
    <div className="film-study-sheet__empty">没有可用的拉片结果</div>
  ) : (
    <>
      {!study.autoAnalyzedAt ? (
        <div className="film-study-sheet__warn">
          当前只有基础分镜，景别 / 运镜 / 提示词尚未生成。可在拉片节点选择 AI
          描述后重新拉片。
        </div>
      ) : null}

      <div className="film-study-sheet__table-wrap">
        <table className="film-study-sheet__table">
          <thead>
            <tr>
              <th>镜号</th>
              <th>时间</th>
              <th>景别</th>
              <th>机位</th>
              <th>运镜</th>
              <th>光线</th>
              <th>画面</th>
              <th>提示词</th>
              <th>人声 / 音乐</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {study.segments.map((segment, index) => (
              <tr key={segment.id}>
                <td className="film-study-sheet__index">
                  {String(index + 1).padStart(2, '0')}
                </td>
                <td className="film-study-sheet__time">
                  {studyClock(segment.startTime)}
                  <br />
                  <span>{segmentDuration(segment).toFixed(1)}s</span>
                </td>
                <td>{segment.shotSize ?? '—'}</td>
                <td>{segment.cameraAngle ?? '—'}</td>
                <td>{segment.cameraMove ?? '—'}</td>
                <td>{segment.lighting ?? '—'}</td>
                <td className="film-study-sheet__text">
                  <strong>{segment.title}</strong>
                  {segment.visualDescription ? (
                    <p>{segment.visualDescription}</p>
                  ) : null}
                </td>
                <td className="film-study-sheet__text">
                  {segment.imagePrompt ?? '—'}
                </td>
                <td className="film-study-sheet__text">
                  {segment.voiceOver ? (
                    <p>人声：{segment.voiceOver}</p>
                  ) : null}
                  {segment.musicCue ? (
                    <p>音乐：{segment.musicCue}</p>
                  ) : null}
                  {!segment.voiceOver && !segment.musicCue ? '—' : null}
                </td>
                <td>
                  <button
                    type="button"
                    className="icon-btn"
                    title="复制这一镜的提示词"
                    onClick={() =>
                      void copy(segmentCopyText(segment, index))
                    }
                  >
                    <Icon name="copy" size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )

  return createPortal(
    <div className="film-study-sheet" onPointerDown={close}>
      <div
        className="film-study-sheet__panel"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="film-study-sheet__head">
          <div className="film-study-sheet__title">
            <Icon name="film" size={15} />
            <span>分镜表</span>
            <span className="film-study-sheet__source">
              {study?.sourceName ?? ''}
            </span>
          </div>
          <div className="film-study-sheet__meta">
            {study ? (
              <>
                <span>{study.segments.length} 个分镜</span>
                <span>{study.frames.length} 张代表帧</span>
                <span>{studyClock(study.duration)}</span>
              </>
            ) : null}
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={!study}
              onClick={() => void copy(study ? buildStudyTableMarkdown(study) : '')}
            >
              复制整表
            </button>
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={!study}
              onClick={() =>
                study
                  ? void window.api.filmStudy
                      .exportMarkdown(study.id)
                      .catch((error) =>
                        showToast(
                          error instanceof Error
                            ? error.message
                            : String(error),
                          'error'
                        )
                      )
                  : undefined
              }
            >
              导出 Markdown
            </button>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => {
                const target = nodeId
                close()
                void openRoom(target)
              }}
            >
              高级编辑
            </button>
            <button
              type="button"
              className="icon-btn"
              title="关闭"
              onClick={close}
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        </header>

        <div className="film-study-sheet__body">{body}</div>
      </div>
    </div>,
    document.body
  )
}
