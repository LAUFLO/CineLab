import { docDurationMs, formatTimecode } from '@shared/timeline-layout'
import { useTimelineStore } from '../stores/timeline'
import { PreviewStage } from './PreviewStage'
import { Button } from '../components/ui'

export function PreviewPane() {
  const playheadMs = useTimelineStore((state) => state.playheadMs)
  const doc = useTimelineStore((state) => state.doc)
  const playing = useTimelineStore((state) => state.playing)
  const togglePlay = useTimelineStore((state) => state.togglePlay)
  const pause = useTimelineStore((state) => state.pause)
  const setPlayhead = useTimelineStore((state) => state.setPlayhead)
  const totalMs = doc ? docDurationMs(doc) : 0

  const toggle = (): void => {
    if (!playing && totalMs > 0 && playheadMs >= totalMs - 1) setPlayhead(0)
    togglePlay()
  }

  return (
    <section className="studio-preview">
      <div className="studio-preview__frame">
        <PreviewStage />
        {doc && doc.clips.length === 0 ? (
          <div className="studio-preview__slot">
            <span>预览画布</span>
            <small>从左侧拖入素材开始</small>
          </div>
        ) : null}
      </div>

      <div className="studio-transport">
        <Button
          type="button"
          className="studio-icon-btn"
          onClick={() => {
            pause()
            setPlayhead(0)
          }}
          title="回到开头"
          unstyled
        >
          ⏮
        </Button>
        <Button
          type="button"
          className="studio-icon-btn"
          onClick={toggle}
          title={playing ? '暂停' : '播放'}
          unstyled
        >
          {playing ? '⏸' : '▶'}
        </Button>
        <span className="studio-transport__time">
          {formatTimecode(playheadMs)}{' '}
          <span className="studio-transport__dim">
            / {formatTimecode(totalMs)}
          </span>
        </span>
        <span className="studio-transport__spacer" />
        <span className="studio-transport__dim" title="预览与导出均已混音">
          🔊
        </span>
      </div>
    </section>
  )
}
