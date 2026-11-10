import { useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import { useStageStore } from './stageStore'

function formatTime(ms: number): string {
  const seconds = Math.max(0, ms) / 1000
  return `${seconds.toFixed(1)}s`
}

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
    <section className="stage-timeline">
      <header className="stage-timeline__head">
        <div className="stage-timeline__group">
          <span className="stage-timeline__label">镜头</span>
          <select
            className="stage-timeline__select"
            value={selectedShotId ?? ''}
            onChange={(event) =>
              selectShot(event.target.value || null)
            }
          >
            <option value="">未选择</option>
            {doc?.shots.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name ?? item.id}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="stage-mini-button"
            title="添加镜头"
            onClick={() => addShot()}
          >
            +
          </button>
          <button
            type="button"
            className="stage-mini-button"
            title="删除镜头"
            disabled={!shot}
            onClick={() => removeSelectedShot()}
          >
            <Icon name="trash" size={11} />
          </button>
        </div>

        <div className="stage-timeline__group">
          <button
            type="button"
            className="stage-text-button"
            onClick={() => (playing ? pause() : play())}
            disabled={!shot}
          >
            <Icon name={playing ? 'pause' : 'play'} size={12} />
            {playing ? '暂停' : '播放'}
          </button>
          <span className="stage-timeline__time">
            {formatTime(playbackMs)} / {formatTime(duration)}
          </span>
        </div>

        <div className="stage-timeline__group">
          <label className="stage-timeline__duration">
            时长
            <input
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

        <div className="stage-timeline__spacer" />

        <div className="stage-timeline__group">
          <button
            type="button"
            className="stage-text-button"
            onClick={handleCapture}
            disabled={!shot}
          >
            <Icon name="pin" size={12} />
            捕获关键帧
          </button>
          <button
            type="button"
            className="stage-text-button"
            onClick={() =>
              removeKeyframe(selectedKeyframeIndex ?? -1)
            }
            disabled={selectedKeyframeIndex === null}
          >
            <Icon name="trash" size={12} />
            删除关键帧
          </button>
        </div>
      </header>

      <div className="stage-timeline__body">
        <div className="stage-timeline__shots">
          {doc?.shots.length ? (
            doc.shots.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`stage-timeline__shot ${
                  item.id === selectedShotId ? 'is-selected' : ''
                }`}
                onClick={() => selectShot(item.id)}
              >
                <Icon name="video" size={12} />
                <span>{item.name ?? item.id}</span>
                <small>{formatTime(item.durationMs)}</small>
              </button>
            ))
          ) : (
            <div className="stage-timeline__empty">
              还没有镜头，点上方「+」创建
            </div>
          )}
        </div>

        <div
          className="stage-timeline__track"
          onPointerDown={handleTrackClick}
        >
          <div className="stage-timeline__ruler">
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
              <span key={ratio} style={{ left: `${ratio * 100}%` }}>
                {formatTime(duration * ratio)}
              </span>
            ))}
          </div>

          <div className="stage-timeline__lane">
            {track.map((key, index) => (
              <button
                key={`${key.timeMs}-${index}`}
                type="button"
                className={`stage-keyframe ${
                  index === selectedKeyframeIndex ? 'is-selected' : ''
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
              className="stage-playhead"
              style={{
                left: `${Math.min(100, (playbackMs / duration) * 100)}%`
              }}
            />
          </div>

          {!shot ? (
            <div className="stage-timeline__hint">选择一个镜头查看运镜</div>
          ) : track.length === 0 ? (
            <div className="stage-timeline__hint">
              调整视角后点「捕获关键帧」，至少两个关键帧才能形成运镜
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
