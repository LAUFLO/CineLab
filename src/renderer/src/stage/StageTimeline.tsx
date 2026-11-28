import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { useStageStore } from './stageStore'
import {
  NativeSelect,
  Button,
  Input,
  Dialog,
  Textarea,
  Menu,
  MenuItem,
  MenuSeparator
} from '../components/ui'
import { buildProgramTimeline, programAt } from '@shared/stage-program'
import type { ProgramSegment } from '@shared/stage-program'
import {
  buildCameraMoveTrack,
  CAMERA_MOVE_PRESETS,
  type CameraMovePreset
} from '@shared/stage-camera-moves'
import type {
  DirectorStageDoc,
  StageProgramEntry
} from '@shared/stage-schema'

function formatTime(ms: number): string {
  const seconds = Math.max(0, ms) / 1000
  return `${seconds.toFixed(1)}s`
}

function currentEntries(doc: DirectorStageDoc): StageProgramEntry[] {
  return doc.program?.entries?.length
    ? doc.program.entries
    : doc.shots.map((shot) => ({ shotId: shot.id }))
}

function commitProgram(entries: StageProgramEntry[]): void {
  useStageStore.getState().applyCommands([
    { type: 'setProgram', program: { version: 1, entries } }
  ])
}

const MINI_BUTTON_CLASS =
  'size-[18px] shrink-0 border border-border p-0 !rounded-md text-[13px] leading-none !font-normal text-fg-muted hover:bg-surface-hover hover:text-fg'

const TEXT_BUTTON_CLASS =
  'h-7 gap-[5px] !rounded-md bg-surface px-2.5 text-[11px] !font-normal !text-fg hover:!border-border hover:bg-surface-hover hover:!text-fg'

const SHOT_BUTTON_CLASS =
  'flex w-full min-w-0 !justify-start items-center gap-1.5 border border-transparent px-1.5 py-[5px] !rounded-md text-left text-[11px] !font-normal text-fg-muted hover:bg-surface-hover data-[active]:border-border-strong data-[active]:bg-surface-hover data-[active]:text-fg'

const FIELD_CLASS = '!h-[26px] !rounded-md !px-1.5 !text-[10px] font-mono'

export function StageTimeline() {
  const doc = useStageStore((state) => state.doc)
  const selectedShotId = useStageStore((state) => state.selectedShotId)
  const selectedKeyframeIndex = useStageStore(
    (state) => state.selectedKeyframeIndex
  )
  const playbackMs = useStageStore((state) => state.playbackMs)
  const playbackScope = useStageStore((state) => state.playbackScope)
  const programMs = useStageStore((state) => state.programMs)
  const playing = useStageStore((state) => state.playing)
  const selectShot = useStageStore((state) => state.selectShot)
  const addShot = useStageStore((state) => state.addShot)
  const autoCoverage = useStageStore((state) => state.autoCoverage)
  const selectedObjectId = useStageStore((state) => state.selectedObjectId)
  const removeSelectedShot = useStageStore((state) => state.removeSelectedShot)
  const setShotDuration = useStageStore((state) => state.setShotDuration)
  const captureKeyframe = useStageStore((state) => state.captureKeyframe)
  const removeKeyframe = useStageStore((state) => state.removeKeyframe)
  const seek = useStageStore((state) => state.seek)
  const seekProgram = useStageStore((state) => state.seekProgram)
  const play = useStageStore((state) => state.play)
  const pause = useStageStore((state) => state.pause)

  const [libraryOpen, setLibraryOpen] = useState(false)
  const [dialogueOpen, setDialogueOpen] = useState(false)
  const [dialogueScript, setDialogueScript] = useState('')
  const [autoCoverageOpen, setAutoCoverageOpen] = useState(false)
  const [autoSubjects, setAutoSubjects] = useState<string[]>([])
  const [autoMenuPosition, setAutoMenuPosition] = useState({ x: 0, y: 0 })

  const shot = doc?.shots.find((item) => item.id === selectedShotId)
  const duration = shot?.durationMs ?? 5000
  const track = shot?.cameraTrack ?? []
  const timeline = useMemo(
    () =>
      doc
        ? buildProgramTimeline(doc)
        : { segments: [], durationMs: 0 },
    [doc]
  )
  const entries = useMemo(() => (doc ? currentEntries(doc) : []), [doc])
  const humans = useMemo(
    () => doc?.objects.filter((object) => object.type === 'human') ?? [],
    [doc]
  )
  const library = useMemo(() => {
    if (!doc) return []
    const used = new Set(entries.map((entry) => entry.shotId))
    return doc.shots.filter((item) => !used.has(item.id))
  }, [doc, entries])

  const scopeDuration =
    playbackScope === 'program' ? timeline.durationMs : duration
  const scopeTime = playbackScope === 'program' ? programMs : playbackMs
  const programPlayhead =
    playbackScope === 'program'
      ? programMs
      : (() => {
          const segment = timeline.segments.find(
            (item) => item.shotId === selectedShotId
          )
          return segment
            ? Math.min(segment.endMs, segment.startMs + playbackMs)
            : 0
        })()
  const canPlay =
    playbackScope === 'program' ? timeline.durationMs > 0 : !!shot

  const [dragIndex, setDragIndex] = useState<number | null>(null)

  const applyCameraMove = (presetId: string): void => {
    const state = useStageStore.getState()
    const doc = state.doc
    const shotId = state.selectedShotId
    if (!doc || !shotId || !presetId) return
    const shot = doc.shots.find((item) => item.id === shotId)
    const camera = shot
      ? doc.cameras.find((item) => item.id === shot.cameraId)
      : undefined
    if (!shot || !camera) return
    state.applyCommands([
      {
        type: 'setCameraTrack',
        shotId,
        track: buildCameraMoveTrack(presetId as CameraMovePreset, camera, shot.durationMs)
      }
    ])
  }

  const startDrag = (
    event: React.PointerEvent,
    index: number,
    keyTimeMs: number
  ): void => {
    event.stopPropagation()
    const target = event.currentTarget as HTMLElement
    const trackEl = target.parentElement
    if (!trackEl) return
    setDragIndex(index)
    useStageStore.setState({ selectedKeyframeIndex: index })
    seek(keyTimeMs)
    const move = (moveEvent: PointerEvent): void => {
      const rect = trackEl.getBoundingClientRect()
      if (rect.width <= 0) return
      const ratio = Math.min(1, Math.max(0, (moveEvent.clientX - rect.left) / rect.width))
      const state = useStageStore.getState()
      const doc = state.doc
      const shotId = state.selectedShotId
      if (!doc || !shotId) return
      const shot = doc.shots.find((item) => item.id === shotId)
      if (!shot) return
      const nextTrack = (shot.cameraTrack ?? []).map((key, i) =>
        i === index
          ? { ...key, timeMs: Math.round(ratio * shot.durationMs) }
          : key
      )
      state.applyCommands([
        { type: 'setCameraTrack', shotId, track: nextTrack }
      ])
    }
    const up = (): void => {
      setDragIndex(null)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

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

  const handleDialogueCoverage = (): void => {
    const script = dialogueScript.trim()
    if (!script) return
    const applied = useStageStore.getState().dialogueCoverage(script)
    if (applied) {
      setDialogueOpen(false)
      setDialogueScript('')
    }
  }

  const openAutoCoverage = (): void => {
    const state = useStageStore.getState()
    const people =
      state.doc?.objects.filter((object) => object.type === 'human') ?? []
    if (people.length === 0) {
      useStageStore.setState({
        error: '场景里还没有人物，请先点左侧「+」添加人物，或让 CineBot 帮你搭景'
      })
      return
    }
    const selected = state.selectedObjectId
    setAutoSubjects((current) =>
      current.length > 0
        ? current
        : selected && people.some((object) => object.id === selected)
          ? [selected]
          : people.slice(0, 2).map((object) => object.id)
    )
    setAutoCoverageOpen(true)
  }

  const toggleAutoSubject = (objectId: string): void => {
    setAutoSubjects((current) =>
      current.includes(objectId)
        ? current.filter((id) => id !== objectId)
        : current.length >= 8
          ? current
          : [...current, objectId]
    )
  }

  const handleAutoCoverage = (): void => {
    const state = useStageStore.getState()
    if (!state.doc) return
    const people = state.doc.objects.filter(
      (object) => object.type === 'human'
    )
    const selected = state.selectedObjectId
    const fallback =
      selected && people.some((object) => object.id === selected)
        ? [selected]
        : people.slice(0, 2).map((object) => object.id)
    const subjectIds = (autoSubjects.length > 0 ? autoSubjects : fallback)
      .filter((id) => people.some((object) => object.id === id))
      .slice(0, 8)
    if (subjectIds.length === 0) {
      useStageStore.setState({
        error: '请至少选择一个人物'
      })
      return
    }
    const applied = state.autoCoverage({
      subjectIds,
      mode: 'auto',
      pace: 1,
      replace: true
    })
    if (applied) setAutoCoverageOpen(false)
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
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0) return
    const ratio = Math.min(
      1,
      Math.max(0, (event.clientX - rect.left) / rect.width)
    )
    if (playbackScope === 'program') {
      seekProgram(ratio * timeline.durationMs)
      return
    }
    if (!shot) return
    seek(ratio * shot.durationMs)
  }

  const moveEntry = (index: number, delta: number): void => {
    const target = index + delta
    if (target < 0 || target >= entries.length) return
    const next = [...entries]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)
    commitProgram(next)
  }

  const removeEntry = (index: number): void => {
    if (index < 0 || index >= entries.length) return
    commitProgram(entries.filter((_, itemIndex) => itemIndex !== index))
  }

  const addEntry = (shotId: string): void => {
    commitProgram([...entries, { shotId }])
  }

  const selectSegment = (segment: ProgramSegment): void => {
    const target = doc?.shots.find((item) => item.id === segment.shotId)
    if (target) selectShot(target.id)

    const overlaps = timeline.segments.filter(
      (item) =>
        item.startMs < segment.endMs && item.endMs > segment.startMs
    )
    if (overlaps.length <= 1) return

    const effective = programAt(timeline, segment.startMs)
    if (effective?.entryIndex === segment.entryIndex) return

    const maxFront = Math.max(...overlaps.map((item) => item.front))
    commitProgram(
      entries.map((entry, index) =>
        index === segment.entryIndex
          ? { ...entry, front: maxFront + 1 }
          : entry
      )
    )
  }

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-card border border-border bg-surface [grid-area:timeline]">
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-2.5 py-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="text-[11px] text-fg-subtle">镜头</span>
          <NativeSelect
            className="!h-[26px] !w-auto !max-w-[180px] !rounded-md !px-1.5 !text-[11px]"
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
            disabled={!canPlay}
          >
            <Icon name={playing ? 'pause' : 'play'} size={12} />
            {playing ? '暂停' : '播放'}
          </Button>
          <span className="min-w-24 font-mono text-[10px] text-fg-muted">
            {formatTime(scopeTime)} / {formatTime(scopeDuration)}
          </span>
          <span className="rounded-md border border-border px-1.5 py-0.5 text-[9px] text-fg-subtle">
            {playbackScope === 'program' ? '整片' : '镜头'}
          </span>
        </div>

        <div className="flex min-w-0 items-center gap-1.5">
          <label className="flex items-center gap-1 text-[11px] text-fg-subtle">
            时长
            <Input
              className="!h-[26px] !w-[54px] !rounded-md !px-1.5 !text-[10px] font-mono"
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
          <div className="relative">
            <Button
              type="button"
              variant="secondary"
              size="none"
              className={TEXT_BUTTON_CLASS}
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect()
                setAutoMenuPosition({
                  x: rect.right - 224,
                  y: rect.bottom + 6
                })
                openAutoCoverage()
              }}
              disabled={!doc}
              title="选择人物后自动排全景、中景、近景；重复生成会替换上次自动分镜"
            >
              自动分镜
            </Button>
            <Menu
              open={autoCoverageOpen}
              onClose={() => setAutoCoverageOpen(false)}
              x={autoMenuPosition.x}
              y={autoMenuPosition.y}
              width={224}
            >
              <div className="px-2 py-1 text-[10px] text-fg-subtle">
                选择主体（1–8 人）
              </div>
              {humans.map((object) => (
                <MenuItem
                  key={object.id}
                  active={autoSubjects.includes(object.id)}
                  trailing={
                    autoSubjects.includes(object.id) ? '✓' : undefined
                  }
                  onSelect={() => toggleAutoSubject(object.id)}
                >
                  {object.name}
                </MenuItem>
              ))}
              <MenuSeparator />
              <MenuItem
                disabled={autoSubjects.length === 0}
                onSelect={() => handleAutoCoverage()}
              >
                生成分镜
              </MenuItem>
              <MenuItem onSelect={() => setAutoCoverageOpen(false)}>
                取消
              </MenuItem>
            </Menu>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="none"
            className={TEXT_BUTTON_CLASS}
            onClick={() => setDialogueOpen(true)}
            disabled={!doc}
            title="粘贴「角色：台词」，按每句台词切镜并配字幕"
          >
            按对白
          </Button>
          <NativeSelect
            className="!h-7 !min-w-[76px] !rounded-md !px-2 !text-[11px]"
            value=""
            disabled={!shot}
            onChange={(event) => {
              applyCameraMove(event.target.value)
              event.target.value = ''
            }}
            title="按当前机位生成运镜预设"
          >
            <option value="">运镜预设</option>
            {CAMERA_MOVE_PRESETS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </NativeSelect>
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

      <div className="grid min-h-0 flex-1 [grid-template-columns:220px_minmax(0,1fr)] max-[900px]:[grid-template-columns:170px_minmax(0,1fr)]">
        <div className="flex flex-col gap-0.5 overflow-y-auto border-r border-border p-1.5">
          {entries.length ? (
            entries.map((entry, index) => {
              const item = doc?.shots.find(
                (candidate) => candidate.id === entry.shotId
              )
              if (!item) return null
              const segment = timeline.segments.find(
                (candidate) => candidate.entryIndex === index
              )
              return (
                <div
                  key={`${entry.shotId}-${index}`}
                  className="flex items-center gap-0.5"
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="none"
                    className={SHOT_BUTTON_CLASS}
                    data-active={item.id === selectedShotId ? '' : undefined}
                    onClick={() => selectShot(item.id)}
                  >
                    <span className="w-4 shrink-0 text-right font-mono text-[9px] text-fg-subtle">
                      {index + 1}
                    </span>
                    <Icon name="video" size={12} />
                    <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                      {item.name ?? item.id}
                    </span>
                    <small className="text-[10px] text-fg-subtle">
                      {formatTime(segment?.startMs ?? 0)}
                    </small>
                    {entry.front ? (
                      <small className="text-[9px] text-warning">
                        F{entry.front}
                      </small>
                    ) : null}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="none"
                    className={MINI_BUTTON_CLASS}
                    title="上移"
                    disabled={index === 0}
                    onClick={() => moveEntry(index, -1)}
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="none"
                    className={MINI_BUTTON_CLASS}
                    title="下移"
                    disabled={index === entries.length - 1}
                    onClick={() => moveEntry(index, 1)}
                  >
                    ↓
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="none"
                    className={MINI_BUTTON_CLASS}
                    title="移出成片"
                    onClick={() => removeEntry(index)}
                  >
                    ×
                  </Button>
                </div>
              )
            })
          ) : (
            <div className="px-1.5 py-2.5 text-[11px] leading-relaxed text-fg-subtle">
              成片还没有镜头，点上方「+」创建，或从素材库加入
            </div>
          )}

          {library.length > 0 ? (
            <div className="mt-1 border-t border-border pt-1">
              <Button
                type="button"
                variant="ghost"
                size="none"
                className="flex w-full items-center justify-between px-1.5 py-1 text-[10px] !font-normal text-fg-subtle hover:text-fg"
                onClick={() => setLibraryOpen((open) => !open)}
              >
                <span>素材库（{library.length}）</span>
                <span>{libraryOpen ? '−' : '+'}</span>
              </Button>
              {libraryOpen
                ? library.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-0.5"
                    >
                      <span className="min-w-0 flex-1 overflow-hidden px-1.5 text-ellipsis whitespace-nowrap text-[10px] text-fg-muted">
                        {item.name ?? item.id}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="none"
                        className={MINI_BUTTON_CLASS}
                        title="加入成片"
                        onClick={() => addEntry(item.id)}
                      >
                        +
                      </Button>
                    </div>
                  ))
                : null}
            </div>
          ) : null}
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
                {formatTime(timeline.durationMs * ratio)}
              </span>
            ))}
          </div>

          <div
            className="relative h-[28px] overflow-hidden rounded-md border border-border bg-surface-raised"
            aria-label="成片"
          >
            {timeline.segments.map((segment) => {
              const left =
                timeline.durationMs > 0
                  ? (segment.startMs / timeline.durationMs) * 100
                  : 0
              const width =
                timeline.durationMs > 0
                  ? ((segment.endMs - segment.startMs) /
                      timeline.durationMs) *
                    100
                  : 0
              const overlaps = timeline.segments.filter(
                (item) =>
                  item.startMs < segment.endMs &&
                  item.endMs > segment.startMs
              ).length
              const item = doc?.shots.find(
                (candidate) => candidate.id === segment.shotId
              )
              const active = item?.id === selectedShotId
              return (
                <Button
                  key={segment.entryIndex}
                  type="button"
                  variant="ghost"
                  size="none"
                  className={`absolute top-0 bottom-0 min-w-0 !justify-start overflow-hidden !rounded-none border-r border-surface px-1 text-[9px] !font-normal ${
                    active
                      ? 'bg-accent/25 text-fg'
                      : 'bg-surface-hover text-fg-muted'
                  }`}
                  style={{
                    left: `${left}%`,
                    width: `${Math.max(0.6, width)}%`
                  }}
                  title={`第${segment.entryIndex + 1}条 · ${item?.name ?? segment.shotId} · ${formatTime(segment.startMs)}–${formatTime(segment.endMs)}${overlaps > 1 ? ` · ${overlaps} 条重叠` : ''}`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => selectSegment(segment)}
                >
                  <span className="truncate">
                    {segment.entryIndex + 1}
                  </span>
                  {overlaps > 1 ? (
                    <small className="ml-1 shrink-0 text-[8px] text-warning">
                      +{overlaps - 1}
                    </small>
                  ) : null}
                </Button>
              )
            })}
            <div
              className="pointer-events-none absolute top-0 bottom-0 w-px bg-warning"
              style={{
                left: `${
                  timeline.durationMs > 0
                    ? Math.min(
                        100,
                        (programPlayhead / timeline.durationMs) * 100
                      )
                    : 0
                }%`
              }}
            />
          </div>

          {playbackScope === 'program' ? (
            <div className="mt-2 flex h-[82px] items-center justify-center rounded-md border border-dashed border-border text-[10px] text-fg-subtle">
              整片播放中，切到「镜头」编辑运镜
            </div>
          ) : (
            <div
              className="relative mt-2 h-[82px] rounded-md border border-border [background:repeating-linear-gradient(to_right,transparent_0,transparent_calc(25%_-_1px),var(--border)_calc(25%_-_1px),var(--border)_25%),var(--surface-raised)]"
            >
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
                  onPointerDown={(event) => startDrag(event, index, key.timeMs)}
                  onClick={(event) => {
                    event.stopPropagation()
                    if (dragIndex === null) {
                      useStageStore.setState({
                        selectedKeyframeIndex: index
                      })
                      seek(key.timeMs)
                    }
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
          )}

          {!shot ? (
            <div className="pointer-events-none absolute top-[58%] left-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] whitespace-nowrap text-fg-subtle">
              选择一个镜头查看运镜
            </div>
          ) : playbackScope === 'shot' && track.length === 0 ? (
            <div className="pointer-events-none absolute top-[58%] left-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] whitespace-nowrap text-fg-subtle">
              调整视角后点「捕获关键帧」，至少两个关键帧才能形成运镜
            </div>
          ) : null}
        </div>
      </div>

      <Dialog
        open={dialogueOpen}
        onClose={() => setDialogueOpen(false)}
        title="按对白分镜"
        description="每行一句「角色：台词」，角色名要和场景里的人物名一致；长句会按标点切分。"
        size="md"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDialogueOpen(false)}
            >
              取消
            </Button>
            <Button type="button" onClick={handleDialogueCoverage}>
              生成分镜
            </Button>
          </>
        }
      >
        <Textarea
          value={dialogueScript}
          onChange={(event) => setDialogueScript(event.target.value)}
          rows={8}
          placeholder={'林冲：这风雪，怕是要下一夜了。\n陆谦：兄长且饮一杯。'}
        />
      </Dialog>
    </section>
  )
}
