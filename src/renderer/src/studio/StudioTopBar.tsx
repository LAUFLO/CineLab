import { Icon } from '../components/Icon'
import { docDurationMs, formatTimecode } from '@shared/timeline-layout'
import { useStudioStore } from '../stores/studio'
import { useTimelineStore } from '../stores/timeline'

export function StudioTopBar() {
  const close = useStudioStore((state) => state.closeStudio)
  const toggleLeft = useStudioStore((state) => state.toggleLeft)
  const toggleRight = useStudioStore((state) => state.toggleRight)
  const doc = useTimelineStore((state) => state.doc)
  const totalMs = doc ? docDurationMs(doc) : 0

  return (
    <header className="studio-top">
      <div className="studio-top__left">
        <button type="button" className="studio-icon-btn" onClick={close} title="返回画布">
          <Icon name="chevron-left" size={14} />
        </button>
        <span className="studio-top__title">剪辑室 · {doc?.name ?? '未命名项目'}</span>
      </div>

      <div className="studio-top__meta">
        <span className="studio-saved-dot" />
        <span>已保存</span>
        <span className="studio-top__sep" />
        <span>{formatTimecode(totalMs)}</span>
        <span className="studio-top__sep" />
        <span>
          {doc ? `${doc.video.width} × ${doc.video.height} · ${doc.video.fps}fps` : '—'}
        </span>
      </div>

      <div className="studio-top__right">
        <button
          type="button"
          className="studio-icon-btn"
          onClick={toggleLeft}
          title="切换素材池"
        >
          <Icon name="library" size={14} />
        </button>
        <button
          type="button"
          className="studio-icon-btn"
          onClick={toggleRight}
          title="切换检查器"
        >
          <Icon name="layers" size={14} />
        </button>
        <span className="studio-top__hint">成片在画布节点生成</span>
        <button type="button" className="studio-icon-btn" onClick={close} title="关闭">
          <Icon name="close" size={14} />
        </button>
      </div>
    </header>
  )
}
