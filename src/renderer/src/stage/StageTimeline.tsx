import { useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import { useStageStore } from './stageStore'
import { NativeSelect, Button, Input } from '../components/ui'

function formatTime(ms: number): string {
  const seconds = Math.max(0, ms) / 1000
  return `${seconds.toFixed(1)}s`
}

const MINI_BUTTON_CLASS =
  'size-[18px] shrink-0 border border-border p-0 !rounded-[5px] text-[13px] leading-none !font-normal text-fg-muted hover:bg-surface-hover hover:text-fg'

const TEXT_BUTTON_CLASS =
  'h-7 gap-[5px] !rounded-[7px] bg-surface px-2.5 text-[11px] !font-normal !text-fg hover:!border-border hover:bg-surface-hover hover:!text-fg'

const SHOT_BUTTON_CLASS =
  'flex w-full min-w-0 !justify-start items-center gap-1.5 border border-transparent px-1.5 py-[5px] !rounded-md text-left text-[11px] !font-normal text-fg-muted hover:bg-surface-hover data-[active]:border-border-strong data-[active]:bg-surface-hover data-[active]:text-fg'

const FIELD_CLASS = '!h-[26px] !rounded-[5px] !px-1.5 !text-[10px] font-mono'

export function StageTimeline() {
  const doc = useStageStore((state) => state.doc)
  const selectedShotId = useStageStore((state) => state.selectedShotId)
  const selectedKeyframeIndex = useStageStore(
    (state) => state.selectedKeyframeIndex
  )
  const playbackMs = useStageStore((state) => state.playbackMs)
  const playing = useStageStore((state) => state.playing)
  const selectShot = useStageStore((state) => state.selectShot)
  const addShot = useStageStore((state) => state.addShot)
  const removeSelectedShot = useStageStore((state) => state.removeSelectedShot)
  const setShotDuration = useStageStore((state) => state.setShotDuration)
  const captureKeyframe = useStageStore((state) => state.captureKeyframe)
  const removeKeyframe = useStageStore((state) => state.removeKeyframe)
  const seek = useStageStore((state) => state.seek)
  const play = useStageStore((state) => state.play)
  const pause = useStageStore((state) => state.pause)

  const shot = doc?.shots.find((item) => item.id === selectedShotId)
  const duration = shot?.durationMs ?? 5000
  const track = shot?.cameraTrack ?? []
  const [durationDraft, setDurationDraft] = useState(
    (duration / 1000).toFixed(1)
  )

  useEffect(() => {
    setDurationDraft((duration / 1000).toFixed(1))
  }, [duration, selectedShotId])

  const commitDuration = (raw: string): void => {
    const seconds = Number(raw)
    if (Number.isFinite(seconds)) {
      setShotDuration(seconds * 1000)
    } else {
      setDurationDraft((duration / 1000).toFixed(1))
    }
  }

  const handleCapture = (): void => {
    if (!shot) return
    if (playing) {
      pause()
      window.setTimeout(() => captureKeyframe(), 60)
      return
    }
    captureKeyframe()
  }

  const handleTrackClick = (
    event: React.PointerEvent<HTMLDivElement>
  ): void => {
    if (!shot) return
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0) return
    const ratio = Math.min(
      1,
      Math.max(0, (event.clientX - rect.left) / rect.width)
    )
    seek(ratio * shot.durationMs)
  }

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-[10px] border border-border bg-surface [grid-area:timeline]">
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-2.5 py-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="text-[11px] text-fg-subtle">镜头</span>
          <NativeSelect
            className="!h-[26px] !w-auto !max-w-[180px] !rounded-[5px] !px-1.5 !text-[11px]"
            value={selectedShotId ?? ''}
            onChange={(event) => selectShot(event.target.value || null)}
          >
            <option value="">未选择</option>
            {doc?.shots.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name ?? item.id}
              </option>
            ))}
          </NativeSelect>
          <Button
            type="button"
            variant="ghost"
            size="none"
            className={MINI_BUTTON_CLASS}
            title="添加镜头"
            onClick={() => addShot()}
          >
            +
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="none"
            className={MINI_BUTTON_CLASS}
            title="删除镜头"
            disabled={!shot}
            onClick={() => removeSelectedShot()}
          >
            <Icon name="trash" size={11} />
          </Button>
        </div>

        <div className="flex min-w-0 items-center gap-1.5">
          <Button
            type="button"
            variant="secondary"
            size="none"
            className={TEXT_BUTTON_CLASS}
            onClick={() => (playing ? pause() : play())}
            disabled={!shot}
          >
            <Icon name={playing ? 'pause' : 'play'} size={12} />
            {playing ? '暂停' : '播放'}
          </Button>
          <span className="min-w-24 font-mono text-[10px] text-fg-muted">
            {formatTime(playbackMs)} / {formatTime(duration)}
          </span>
        </div>

        <div className="flex min-w-0 items-center gap-1.5">
          <label className="flex items-center gap-1 text-[11px] text-fg-subtle">
            时长
            <Input
              className="!h-[26px] !w-[54px] !rounded-[5px] !px-1.5 !text-[10px] font-mono"
              value={durationDraft}
              inputMode="decimal"
              onChange={(event) => setDurationDraft(event.target.value)}
              onBlur={(event) => commitDuration(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
              }}
            />
            秒
          </label>
        </div>

        <div className="flex-1" />

        <div className="flex min-w-0 items-center gap-1.5">
          <Button
            type="button"
            variant="secondary"
            size="none"
            className={TEXT_BUTTON_CLASS}
            onClick={handleCapture}
            disabled={!shot}
          >
            <Icon name="pin" size={12} />
            捕获关键帧
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="none"
            className={TEXT_BUTTON_CLASS}
            onClick={() => removeKeyframe(selectedKeyframeIndex ?? -1)}
            disabled={selectedKeyframeIndex === null}
          >
            <Icon name="trash" size={12} />
            删除关键帧
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 [grid-template-columns:190px_minmax(0,1fr)] max-[900px]:[grid-template-columns:150px_minmax(0,1fr)]">
        <div className="flex flex-col gap-0.5 overflow-y-auto border-r border-border p-1.5">
          {doc?.shots.length ? (
            doc.shots.map((item) => (
              <Button
                key={item.id}
                type="button"
                variant="ghost"
                size="none"
                className={SHOT_BUTTON_CLASS}
                data-active={item.id === selectedShotId ? '' : undefined}
                onClick={() => selectShot(item.id)}
              >
                <Icon name="video" size={12} />
                <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                  {item.name ?? item.id}
                </span>
                <small className="text-[10px] text-fg-subtle">
                  {formatTime(item.durationMs)}
                </small>
              </Button>
            ))
          ) : (
            <div className="px-1.5 py-2.5 text-[11px] leading-relaxed text-fg-subtle">
              还没有镜头，点上方「+」创建
            </div>
          )}
        </div>

        <div
          className="relative min-w-0 cursor-crosshair overflow-hidden px-3.5 pt-[26px] pb-3.5"
          onPointerDown={handleTrackClick}
        >
          <div className="absolute top-[5px] right-3.5 left-3.5 h-3.5 font-mono text-[9px] text-fg-subtle">
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
              <span
                key={ratio}
                className="absolute -translate-x-1/2 whitespace-nowrap first:translate-x-0 last:-translate-x-full"
                style={{ left: `${ratio * 100}%` }}
              >
                {formatTime(duration * ratio)}
              </span>
            ))}
          </div>

          <div className="relative h-[82px] rounded-[7px] border border-border [background:repeating-linear-gradient(to_right,transparent_0,transparent_calc(25%_-_1px),var(--border)_calc(25%_-_1px),var(--border)_25%),var(--surface-raised)]">
            {track.map((key, index) => (
              <Button
                key={`${key.timeMs}-${index}`}
                type="button"
                variant="ghost"
                size="none"
                className={`absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 !rounded-full border-2 border-surface p-0 shadow-[0_0_0_1px_var(--border-strong)] ${
                  index === selectedKeyframeIndex
                    ? '!bg-accent !shadow-[0_0_0_2px_var(--border-strong)] hover:!bg-accent'
                    : 'bg-fg-subtle hover:!bg-fg'
                }`}
                style={{
                  left: `${(key.timeMs / duration) * 100}%`
                }}
                title={`${formatTime(key.timeMs)} · FOV ${key.fov}`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  useStageStore.setState({
                    selectedKeyframeIndex: index
                  })
                  seek(key.timeMs)
                }}
              />
            ))}
            <div
              className="pointer-events-none absolute top-0 bottom-0 w-px bg-warning"
              style={{
                left: `${Math.min(100, (playbackMs / duration) * 100)}%`
              }}
            />
          </div>

          {!shot ? (
            <div className="pointer-events-none absolute top-[58%] left-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] whitespace-nowrap text-fg-subtle">
              选择一个镜头查看运镜
            </div>
          ) : track.length === 0 ? (
            <div className="pointer-events-none absolute top-[58%] left-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] whitespace-nowrap text-fg-subtle">
              调整视角后点「捕获关键帧」，至少两个关键帧才能形成运镜
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
