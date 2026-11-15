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
    <section className="flex min-h-0 min-w-0 flex-col gap-2 overflow-hidden rounded-[10px] border border-border bg-surface p-2.5 [grid-area:preview]">
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[8px] bg-media-bg [container-type:size]">
        <PreviewStage />
        {doc && doc.clips.length === 0 ? (
          <div className="pointer-events-none absolute left-1/2 top-1/2 flex aspect-[16/9] w-[min(100cqw,calc(100cqh_*_16_/_9))] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-1.5 rounded-[8px] border border-dashed border-border-strong text-[13px] text-fg-subtle">
            <span>预览画布</span>
            <small className="text-[11px] text-fg-subtle opacity-70">
              从左侧拖入素材开始
            </small>
          </div>
        ) : null}
      </div>

      <div className="flex h-[34px] shrink-0 items-center gap-1 px-1">
        <Button
          type="button"
          variant="ghost"
          size="none"
          className="h-7 gap-1 !rounded-[7px] px-2 text-xs !font-normal"
          onClick={() => {
            pause()
            setPlayhead(0)
          }}
          title="回到开头"
        >
          ⏮
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="none"
          className="h-7 gap-1 !rounded-[7px] px-2 text-xs !font-normal"
          onClick={toggle}
          title={playing ? '暂停' : '播放'}
        >
          {playing ? '⏸' : '▶'}
        </Button>
        <span className="ml-1 tabular-nums text-xs text-fg">
          {formatTimecode(playheadMs)}{' '}
          <span className="text-fg-subtle">
            / {formatTimecode(totalMs)}
          </span>
        </span>
        <span className="flex-1" />
        <span className="text-fg-subtle" title="预览与导出均已混音">
          🔊
        </span>
      </div>
    </section>
  )
}
