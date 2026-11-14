import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { TimelineAnalysisKind } from '@shared/ipc-contract'
import type { TimeRange } from '@shared/timeline-edit'
import { formatTimecode } from '@shared/timeline-layout'
import { evaluateClipKeys } from '@shared/timeline-keyframes'
import {
  buildBeatMarkerPlan,
  buildBeatSplitPlan,
  buildRemoveSilencePlan,
  buildSplitByShotsPlan,
  type TimelinePlan
} from '@shared/timeline-tools'
import { DEFAULT_AUDIO_FX } from '@shared/audio-fx'
import { DEFAULT_FILTER, FILTER_PRESETS } from '@shared/filters'
import { SUBTITLE_PRESETS } from '@shared/subtitle-presets'
import {
  newMarkerId,
  type AudioFxSettings,
  type ClipFilter,
  type ClipKey,
  type TimelineClip
} from '@shared/timeline-schema'
import { useTimelineStore } from '../stores/timeline'
import { applyTimelinePlan } from './timeline-plan-runner'
import { useUIStore } from '../stores/ui'
import {
  Button,
  IconButton,
  Input,
  Select,
  Textarea,
  NativeSelect
} from '../components/ui'
import { BezierEditor } from './BezierEditor'

const BLEND_LABEL: Record<string, string> = {
  normal: '正常',
  multiply: '正片叠底',
  screen: '滤色',
  add: '相加',
  lighten: '变亮',
  darken: '变暗'
}

type TextStyle = NonNullable<TimelineClip['text']>

const DEFAULT_TEXT: TextStyle = {
  content: '',
  fontFamily: 'Arial',
  fontSize: 64,
  color: '#ffffff',
  bold: false,
  italic: false,
  align: 'center'
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <label className="studio-field">
      <span>{label}</span>
      <Input readOnly value={value} unstyled />
    </label>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="studio-inspector__section" open>
      <summary>{title}</summary>
      <div className="studio-inspector__body">{children}</div>
    </details>
  )
}

function textOf(clip: TimelineClip): TextStyle {
  return { ...DEFAULT_TEXT, ...(clip.text ?? {}) }
}

function SubtitleSection({ clip }: { clip: TimelineClip }) {
  const dispatch = useTimelineStore((state) => state.dispatch)
  const text = textOf(clip)
  const [content, setContent] = useState(text.content)
  const [fontFamily, setFontFamily] = useState(text.fontFamily)
  const [color, setColor] = useState(text.color)
  const latestRef = useRef(text)

  useEffect(() => {
    const next = textOf(clip)
    latestRef.current = next
    setContent(next.content)
    setFontFamily(next.fontFamily)
    setColor(next.color)
  }, [clip.id, clip.text?.content, clip.text?.fontFamily, clip.text?.color])

  const commit = (patch: Partial<TextStyle>): void => {
    const next = {
      ...latestRef.current,
      ...patch,
      content: patch.content ?? content
    }
    latestRef.current = next
    dispatch({
      op: 'updateClip',
      clipId: clip.id,
      patch: {
        name: (next.content.trim() || '字幕').slice(0, 60),
        text: next
      }
    })
  }

  return (
    <Section title="字幕">
      <label className="studio-field">
        <span>预设</span>
        <NativeSelect
          value=""
          onChange={(event) => {
            const preset = SUBTITLE_PRESETS.find(
              (item) => item.id === event.target.value
            )
            if (preset) commit(preset.style)
          }}
          unstyled
        >
          <option value="">选择样式</option>
          {SUBTITLE_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label className="studio-field">
        <span>内容</span>
        <Textarea
          className="studio-textarea"
          rows={4}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          onBlur={() => commit({ content })}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault()
              commit({ content })
            }
          }}
          unstyled
        />
      </label>
      <small className="studio-field-hint">失焦或 Ctrl+Enter 保存</small>

      <label className="studio-field">
        <span>字体</span>
        <Input
          value={fontFamily}
          onChange={(event) => setFontFamily(event.target.value)}
          onBlur={() => commit({ fontFamily })}
        />
      </label>

      <label className="studio-field">
        <span>字号</span>
        <Input
          type="number"
          min={8}
          max={400}
          value={text.fontSize}
          onChange={(event) =>
            commit({ fontSize: Math.max(8, Number(event.target.value) || 64) })
          }
        />
      </label>

      <label className="studio-field">
        <span>颜色</span>
        <Input
          type="color"
          value={color}
          onChange={(event) => setColor(event.target.value)}
          onBlur={() => commit({ color })}
          unstyled
        />
      </label>

      <label className="studio-field">
        <span>对齐</span>
        <NativeSelect
          value={text.align}
          onChange={(event) =>
            commit({ align: event.target.value as TextStyle['align'] })
          }
          unstyled
        >
          <option value="left">左</option>
          <option value="center">中</option>
          <option value="right">右</option>
        </NativeSelect>
      </label>

      <div className="studio-field-row">
        <label className="studio-check">
          <Input
            type="checkbox"
            checked={text.bold}
            onChange={(event) => commit({ bold: event.target.checked })}
            unstyled
          />
          粗体
        </label>
        <label className="studio-check">
          <Input
            type="checkbox"
            checked={text.italic}
            onChange={(event) => commit({ italic: event.target.checked })}
            unstyled
          />
          斜体
        </label>
        <label className="studio-check">
          <Input
            type="checkbox"
            checked={Boolean(text.shadow)}
            onChange={(event) =>
              commit({
                shadow: event.target.checked
                  ? {
                      color: '#000000',
                      blur: 8,
                      offsetX: 0,
                      offsetY: 2
                    }
                  : undefined
              })
            }
            unstyled
          />
          阴影
        </label>
      </div>

      <label className="studio-field">
        <span>描边</span>
        <Input
          type="number"
          min={0}
          max={20}
          value={text.stroke?.width ?? 0}
          onChange={(event) =>
            commit({
              stroke: {
                color: text.stroke?.color ?? '#000000',
                width: Math.max(0, Number(event.target.value) || 0)
              }
            })
          }
        />
      </label>
    </Section>
  )
}

const ANALYSIS_LABEL: Record<TimelineAnalysisKind, string> = {
  shots: '镜头',
  silences: '静音',
  beats: '节拍'
}

function AnalysisSection({ clip }: { clip: TimelineClip }) {
  const dispatch = useTimelineStore((state) => state.dispatch)
  const showToast = useUIStore((state) => state.showToast)
  const [running, setRunning] = useState<TimelineAnalysisKind | null>(null)
  const media = clip.media

  if (!media) return null
  const canShots = clip.kind === 'video' && media.kind === 'video'

  const run = async (kind: TimelineAnalysisKind): Promise<void> => {
    if (running) return
    setRunning(kind)
    try {
      const result = await window.api.timeline.analyze({
        kind,
        path: media.path,
        scope: media.scope,
        sourceStartMs: clip.sourceStartMs,
        durationMs: clip.durationMs,
        speed: clip.speed
      })

      const latest = useTimelineStore.getState()
      const doc = latest.doc
      if (!doc) return
      if (result.markers.length === 0) {
        showToast(`没有检测到${ANALYSIS_LABEL[kind]}`, 'error')
        return
      }

      const room = Math.max(0, 500 - doc.markers.length)
      if (room === 0) {
        showToast('标记已达上限 500 个', 'error')
        return
      }

      const markers = result.markers.slice(0, room).map((marker) => ({
        id: newMarkerId(),
        atMs: Math.max(0, Math.round(clip.startMs + marker.atMs)),
        durationMs: kind === 'silences' ? marker.durationMs : undefined,
        label: marker.label,
        color: marker.color
      }))

      latest.dispatch({
        op: 'batch',
        label: `AI 分析 · ${ANALYSIS_LABEL[kind]}`,
        commands: markers.map((marker) => ({ op: 'addMarker', marker }))
      })
      showToast(`已添加 ${markers.length} 个${ANALYSIS_LABEL[kind]}标记`)
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setRunning(null)
    }
  }

  return (
    <Section title="AI 分析">
      <div className="studio-field-row">
        {canShots ? (
          <Button
            className="studio-ghost-btn"
            disabled={running !== null}
            onClick={() => void run('shots')}
            unstyled
          >
            {running === 'shots' ? '检测中…' : '镜头'}
          </Button>
        ) : null}
        <Button
          className="studio-ghost-btn"
          disabled={running !== null}
          onClick={() => void run('silences')}
          unstyled
        >
          {running === 'silences' ? '检测中…' : '静音'}
        </Button>
        <Button
          className="studio-ghost-btn"
          disabled={running !== null}
          onClick={() => void run('beats')}
          unstyled
        >
          {running === 'beats' ? '检测中…' : '节拍'}
        </Button>
      </div>
      <small className="studio-field-hint">
        检测结果写入时间线标尺，可点击标记跳转
      </small>
    </Section>
  )
}

function KeyframeSection({
  clip,
  playheadMs
}: {
  clip: TimelineClip
  playheadMs: number
}) {
  const dispatch = useTimelineStore((state) => state.dispatch)
  const [property, setProperty] = useState<ClipKey['property']>('scale')
  const [value, setValue] = useState(1)
  const [x, setX] = useState(0)
  const [y, setY] = useState(0)

  const current = evaluateClipKeys(clip, playheadMs)
  const at =
    clip.durationMs <= 0
      ? 0
      : Math.min(1, Math.max(0, (playheadMs - clip.startMs) / clip.durationMs))

  const selectProperty = (next: ClipKey['property']): void => {
    setProperty(next)
    if (next === 'position') {
      setX(current.position.x)
      setY(current.position.y)
    } else {
      setValue(current[next])
    }
  }

  const updateKeys = (keys: ClipKey[]): void => {
    dispatch({
      op: 'updateClip',
      clipId: clip.id,
      patch: { keys }
    })
  }

  const addKey = (): void => {
    const key: ClipKey = {
      property,
      at,
      value: property === 'position' ? { x, y } : value,
      ease: 'linear'
    }
    const keys = clip.keys.filter(
      (item) => !(item.property === property && Math.abs(item.at - at) < 0.001)
    )
    updateKeys([...keys, key])
  }

  const patchKey = (index: number, patch: Partial<ClipKey>): void => {
    updateKeys(
      clip.keys.map((key, itemIndex) =>
        itemIndex === index ? { ...key, ...patch } : key
      )
    )
  }

  return (
    <Section title="关键帧">
      <div className="studio-field-row">
        <NativeSelect
          value={property}
          onChange={(event) =>
            selectProperty(event.target.value as ClipKey['property'])
          }
          unstyled
        >
          <option value="position">位置</option>
          <option value="scale">缩放</option>
          <option value="rotation">旋转</option>
          <option value="opacity">透明度</option>
          <option value="volume">音量</option>
        </NativeSelect>
        {property === 'position' ? (
          <>
            <Input
              className="studio-keyframe-input"
              type="number"
              step={0.01}
              value={x}
              onChange={(event) => setX(Number(event.target.value) || 0)}
              unstyled
            />
            <Input
              className="studio-keyframe-input"
              type="number"
              step={0.01}
              value={y}
              onChange={(event) => setY(Number(event.target.value) || 0)}
              unstyled
            />
          </>
        ) : (
          <Input
            className="studio-keyframe-input"
            type="number"
            step={property === 'rotation' ? 1 : 0.01}
            value={value}
            onChange={(event) => setValue(Number(event.target.value) || 0)}
            unstyled
          />
        )}
        <Button className="studio-ghost-btn" onClick={addKey} unstyled>
          添加
        </Button>
      </div>

      {clip.keys.length === 0 ? (
        <small className="studio-field-hint">
          把播放头移到片段内，再添加关键帧
        </small>
      ) : (
        <div className="studio-keyframes">
          {clip.keys.map((key, index) => (
            <div
              className="studio-keyframe-group"
              key={`${key.property}-${index}`}
            >
              <div className="studio-keyframe">
                <span className="studio-keyframe__prop">
                  {
                    {
                      position: '位置',
                      scale: '缩放',
                      rotation: '旋转',
                      opacity: '透明度',
                      volume: '音量'
                    }[key.property]
                  }
                </span>
                <Input
                  className="studio-keyframe-input"
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={Math.round(key.at * 1000) / 10}
                  title="片段内百分比"
                  onChange={(event) =>
                    patchKey(index, {
                      at: Math.min(
                        1,
                        Math.max(0, (Number(event.target.value) || 0) / 100)
                      )
                    })
                  }
                  unstyled
                />
                {typeof key.value === 'object' ? (
                  <>
                    <Input
                      className="studio-keyframe-input"
                      type="number"
                      step={0.01}
                      value={key.value.x}
                      onChange={(event) =>
                        patchKey(index, {
                          value: {
                            x: Number(event.target.value) || 0,
                            y: (key.value as { x: number; y: number }).y
                          }
                        })
                      }
                      unstyled
                    />
                    <Input
                      className="studio-keyframe-input"
                      type="number"
                      step={0.01}
                      value={key.value.y}
                      onChange={(event) =>
                        patchKey(index, {
                          value: {
                            x: (key.value as { x: number; y: number }).x,
                            y: Number(event.target.value) || 0
                          }
                        })
                      }
                      unstyled
                    />
                  </>
                ) : (
                  <Input
                    className="studio-keyframe-input"
                    type="number"
                    step={0.01}
                    value={key.value}
                    onChange={(event) =>
                      patchKey(index, {
                        value: Number(event.target.value) || 0
                      })
                    }
                    unstyled
                  />
                )}
                <NativeSelect
                  value={key.ease}
                  onChange={(event) =>
                    patchKey(index, {
                      ease: event.target.value as ClipKey['ease'],
                      bezier:
                        event.target.value === 'bezier'
                          ? (key.bezier ?? [0.42, 0, 0.58, 1])
                          : undefined
                    })
                  }
                  unstyled
                >
                  <option value="linear">线性</option>
                  <option value="ease-in">缓入</option>
                  <option value="ease-out">缓出</option>
                  <option value="ease-in-out">缓入缓出</option>
                  <option value="bezier">曲线</option>
                </NativeSelect>
                <IconButton
                  label="删除关键帧"
                  className="studio-icon-btn"
                  onClick={() =>
                    updateKeys(
                      clip.keys.filter((_, itemIndex) => itemIndex !== index)
                    )
                  }
                  unstyled
                >
                  ×
                </IconButton>
              </div>
              {key.ease === 'bezier' ? (
                <BezierEditor
                  value={key.bezier ?? [0.42, 0, 0.58, 1]}
                  onChange={(bezier) =>
                    patchKey(index, { ease: 'bezier', bezier })
                  }
                />
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

export function InspectorPane() {
  const doc = useTimelineStore((state) => state.doc)
  const selectedIds = useTimelineStore((state) => state.selectedIds)
  const dispatch = useTimelineStore((state) => state.dispatch)
  const playheadMs = useTimelineStore((state) => state.playheadMs)
  const showToast = useUIStore((state) => state.showToast)
  const requestConfirm = useUIStore((state) => state.requestConfirm)
  type AutoCutAction = 'silence' | 'shots' | 'beats' | 'beat-split'
  const [runningAction, setRunningAction] = useState<AutoCutAction | null>(null)
  const [pane, setPane] = useState<'props' | 'visual' | 'audio'>('props')
  const clip = doc?.clips.find((item) => item.id === selectedIds[0]) ?? null

  const confirmPlan = (
    plan: TimelinePlan,
    label: string,
    clearSelection = false
  ): void => {
    if (plan.commands.length === 0) {
      showToast(plan.summary, 'error')
      return
    }
    requestConfirm({
      title: `自动粗剪 · ${label}`,
      message: [plan.summary, ...plan.warnings].join('\n'),
      confirmLabel: '应用',
      onConfirm: () => {
        applyTimelinePlan(plan, {
          label: `自动粗剪 · ${label}`,
          clearSelection
        })
        showToast(plan.summary)
      }
    })
  }

  const runRemoveSilence = async (): Promise<void> => {
    if (runningAction) return
    const state = useTimelineStore.getState()
    const currentDoc = state.doc
    if (!currentDoc) return

    const selected = currentDoc.clips.find(
      (item) =>
        state.selectedIds.includes(item.id) &&
        item.media &&
        (item.kind === 'video' || item.kind === 'audio') &&
        !item.muted
    )
    const targets = selected
      ? [selected]
      : currentDoc.clips.filter((item) => {
          const track = currentDoc.tracks.find(
            (candidate) => candidate.id === item.trackId
          )
          return (
            item.media &&
            (item.kind === 'video' || item.kind === 'audio') &&
            !item.muted &&
            track?.locked !== true
          )
        })

    if (targets.length === 0) {
      showToast('时间线上没有可检测的视频/音频片段', 'error')
      return
    }

    setRunningAction('silence')
    try {
      const ranges: TimeRange[] = []
      let failed = 0

      for (const item of targets) {
        if (!item.media) continue
        try {
          const result = await window.api.timeline.analyze({
            kind: 'silences',
            path: item.media.path,
            scope: item.media.scope,
            sourceStartMs: item.sourceStartMs,
            durationMs: item.durationMs,
            speed: item.speed
          })
          for (const marker of result.markers) {
            if (!marker.durationMs) continue
            ranges.push({
              startMs: item.startMs + marker.atMs,
              endMs: item.startMs + marker.atMs + marker.durationMs
            })
          }
        } catch {
          failed += 1
        }
      }

      const plan = buildRemoveSilencePlan(currentDoc, ranges, {
        paddingMs: 120,
        minDurationMs: 400
      })
      if (failed > 0) {
        plan.warnings.push(`${failed} 个片段检测失败，已跳过`)
      }
      confirmPlan(plan, '删静音', true)
    } finally {
      setRunningAction(null)
    }
  }

  const runSplitByShots = async (): Promise<void> => {
    if (runningAction) return
    const state = useTimelineStore.getState()
    const currentDoc = state.doc
    if (!currentDoc) return

    const target = currentDoc.clips.find(
      (item) =>
        state.selectedIds.includes(item.id) &&
        item.kind === 'video' &&
        item.media &&
        !item.muted
    )
    if (!target?.media) {
      showToast('先选中一个视频片段', 'error')
      return
    }

    setRunningAction('shots')
    try {
      const result = await window.api.timeline.analyze({
        kind: 'shots',
        path: target.media.path,
        scope: target.media.scope,
        sourceStartMs: target.sourceStartMs,
        durationMs: target.durationMs,
        speed: target.speed
      })
      const cuts = result.markers.map((marker) => target.startMs + marker.atMs)
      const plan = buildSplitByShotsPlan(currentDoc, target.id, cuts, {
        minShotMs: 500,
        edgePaddingMs: 100
      })
      confirmPlan(plan, '按镜头切分')
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setRunningAction(null)
    }
  }

  const runBeatAction = async (mode: 'markers' | 'split'): Promise<void> => {
    if (runningAction) return
    const state = useTimelineStore.getState()
    const currentDoc = state.doc
    if (!currentDoc) return

    const target = currentDoc.clips.find(
      (item) =>
        state.selectedIds.includes(item.id) &&
        item.media &&
        (item.kind === 'video' || item.kind === 'audio') &&
        !item.muted
    )
    if (!target?.media) {
      showToast('先选中一个音频或视频片段作为节拍源', 'error')
      return
    }

    setRunningAction(mode === 'markers' ? 'beats' : 'beat-split')
    try {
      const result = await window.api.timeline.analyze({
        kind: 'beats',
        path: target.media.path,
        scope: target.media.scope,
        sourceStartMs: target.sourceStartMs,
        durationMs: target.durationMs,
        speed: target.speed
      })
      const beats = result.markers.map((marker) => target.startMs + marker.atMs)
      const plan =
        mode === 'markers'
          ? buildBeatMarkerPlan(currentDoc, beats)
          : buildBeatSplitPlan(currentDoc, beats, {
              trackId: target.kind === 'video' ? target.trackId : undefined
            })
      confirmPlan(plan, mode === 'markers' ? '节拍标记' : '节拍切分')
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setRunningAction(null)
    }
  }

  const detachAudio = async (): Promise<void> => {
    if (!clip?.media || clip.kind !== 'video') return
    const probe = await window.api.media
      .probe(clip.media.path)
      .catch(() => null)
    if (!probe?.hasAudio) {
      showToast('该视频没有音轨', 'error')
      return
    }
    dispatch({ op: 'detachAudio', clipId: clip.id })
    showToast('已分离到音频轨，视频片段已静音')
  }

  const changeSpeed = (speed: number): void => {
    if (!clip) return
    dispatch({ op: 'setClipSpeed', clipId: clip.id, speed })
  }

  const changeTransition = (
    type: 'none' | NonNullable<TimelineClip['transitionIn']>['type'],
    durationMs: number
  ): void => {
    if (!clip) return
    dispatch({
      op: 'updateClip',
      clipId: clip.id,
      patch: {
        transitionIn:
          type === 'none'
            ? undefined
            : { type, durationMs: Math.min(3000, Math.max(200, durationMs)) }
      }
    })
  }

  const changeTransform = (
    patch: Partial<NonNullable<TimelineClip['transform']>>
  ): void => {
    if (!clip) return
    dispatch({ op: 'setClipTransform', clipId: clip.id, transform: patch })
  }

  const updateAudioFx = (patch: Partial<AudioFxSettings>): void => {
    if (!clip) return
    dispatch({
      op: 'updateClip',
      clipId: clip.id,
      patch: {
        audioFx: { ...(clip.audioFx ?? DEFAULT_AUDIO_FX), ...patch }
      }
    })
  }

  const changeFilter = (patch: Partial<ClipFilter>): void => {
    if (!clip) return
    dispatch({
      op: 'updateClip',
      clipId: clip.id,
      patch: {
        filter: { ...(clip.filter ?? DEFAULT_FILTER), ...patch }
      }
    })
  }

  if (!doc) {
    return <aside className="studio-inspector" />
  }

  return (
    <aside className="studio-inspector">
      <div className="studio-inspector__tabs">
        <Button
          type="button"
          className={`studio-inspector__tab ${pane === 'props' ? 'is-active' : ''}`}
          onClick={() => setPane('props')}
          unstyled
        >
          属性
        </Button>
        <Button
          type="button"
          className={`studio-inspector__tab ${pane === 'visual' ? 'is-active' : ''}`}
          onClick={() => setPane('visual')}
          unstyled
        >
          画面
        </Button>
        <Button
          type="button"
          className={`studio-inspector__tab ${pane === 'audio' ? 'is-active' : ''}`}
          onClick={() => setPane('audio')}
          unstyled
        >
          音频
        </Button>
      </div>

      {clip ? (
        <>
          {pane === 'props' ? (
            <Section title="基础">
              <Field label="名称" value={clip.name || '—'} />
              <Field label="起点" value={formatTimecode(clip.startMs)} />
              <Field label="时长" value={formatTimecode(clip.durationMs)} />
              {clip.kind !== 'text' ? (
                <label className="studio-field">
                  <span>速度</span>
                  <Select
                    value={String(clip.speed)}
                    options={[0.25, 0.5, 1, 1.5, 2, 4].map((speed) => ({
                      value: String(speed),
                      label: `${speed}×`
                    }))}
                    onChange={(value) => changeSpeed(Number(value))}
                  />
                </label>
              ) : (
                <Field label="速度" value={`${clip.speed.toFixed(1)}×`} />
              )}
            </Section>
          ) : null}

          {pane === 'visual' ? (
            <Section title="画面">
              <label className="studio-field">
                <span>缩放</span>
                <Input
                  type="number"
                  min={0.01}
                  max={20}
                  step={0.05}
                  value={clip.transform?.scale ?? 1}
                  onChange={(event) =>
                    changeTransform({
                      scale: Math.max(0.01, Number(event.target.value) || 1)
                    })
                  }
                  unstyled
                />
              </label>
              <label className="studio-field">
                <span>X 偏移</span>
                <Input
                  type="number"
                  min={-10}
                  max={10}
                  step={0.01}
                  value={clip.transform?.offsetX ?? 0}
                  onChange={(event) =>
                    changeTransform({
                      offsetX: Number(event.target.value) || 0
                    })
                  }
                  unstyled
                />
              </label>
              <label className="studio-field">
                <span>Y 偏移</span>
                <Input
                  type="number"
                  min={-10}
                  max={10}
                  step={0.01}
                  value={clip.transform?.offsetY ?? 0}
                  onChange={(event) =>
                    changeTransform({
                      offsetY: Number(event.target.value) || 0
                    })
                  }
                  unstyled
                />
              </label>
              <label className="studio-field">
                <span>旋转</span>
                <Input
                  type="number"
                  min={-360}
                  max={360}
                  step={1}
                  value={clip.transform?.rotation ?? 0}
                  onChange={(event) =>
                    changeTransform({
                      rotation: Number(event.target.value) || 0
                    })
                  }
                  unstyled
                />
              </label>
              <label className="studio-field">
                <span>不透明度</span>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(clip.opacity * 100)}
                  onChange={(event) =>
                    dispatch({
                      op: 'updateClip',
                      clipId: clip.id,
                      patch: {
                        opacity: Math.min(
                          1,
                          Math.max(0, (Number(event.target.value) || 0) / 100)
                        )
                      }
                    })
                  }
                  unstyled
                />
              </label>
              <Field
                label="混合"
                value={BLEND_LABEL[clip.blend] ?? clip.blend}
              />
              {clip.kind === 'video' || clip.kind === 'image' ? (
                <Button
                  className="studio-ghost-btn"
                  title="缩放为 35% 并移到右下角；放到 V2 轨叠加在 V1 上"
                  onClick={() =>
                    changeTransform({
                      scale: 0.35,
                      offsetX: 0.28,
                      offsetY: 0.28,
                      rotation: 0
                    })
                  }
                  unstyled
                >
                  画中画预设
                </Button>
              ) : null}
            </Section>
          ) : null}

          {pane === 'visual' &&
          (clip.kind === 'video' || clip.kind === 'image') ? (
            <Section title="滤镜">
              <label className="studio-field">
                <span>预设</span>
                <Select
                  value=""
                  options={[
                    { value: '', label: '选择滤镜' },
                    ...FILTER_PRESETS.map((preset) => ({
                      value: preset.id,
                      label: preset.name
                    }))
                  ]}
                  onChange={(value) => {
                    const preset = FILTER_PRESETS.find(
                      (item) => item.id === value
                    )
                    if (!preset) return
                    dispatch({
                      op: 'updateClip',
                      clipId: clip.id,
                      patch: { filter: { ...preset.value } }
                    })
                  }}
                />
              </label>
              <label className="studio-field">
                <span>亮度</span>
                <Input
                  type="range"
                  min={0.5}
                  max={1.5}
                  step={0.01}
                  value={clip.filter?.brightness ?? 1}
                  onChange={(event) =>
                    changeFilter({ brightness: Number(event.target.value) })
                  }
                  unstyled
                />
              </label>
              <label className="studio-field">
                <span>对比度</span>
                <Input
                  type="range"
                  min={0.5}
                  max={1.8}
                  step={0.01}
                  value={clip.filter?.contrast ?? 1}
                  onChange={(event) =>
                    changeFilter({ contrast: Number(event.target.value) })
                  }
                  unstyled
                />
              </label>
              <label className="studio-field">
                <span>饱和度</span>
                <Input
                  type="range"
                  min={0}
                  max={2}
                  step={0.01}
                  value={clip.filter?.saturation ?? 1}
                  onChange={(event) =>
                    changeFilter({ saturation: Number(event.target.value) })
                  }
                  unstyled
                />
              </label>
              <label className="studio-field">
                <span>模糊</span>
                <Input
                  type="range"
                  min={0}
                  max={12}
                  step={0.5}
                  value={clip.filter?.blur ?? 0}
                  onChange={(event) =>
                    changeFilter({ blur: Number(event.target.value) })
                  }
                  unstyled
                />
              </label>
              <label className="studio-field">
                <span>暗角</span>
                <Input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={clip.filter?.vignette ?? 0}
                  onChange={(event) =>
                    changeFilter({ vignette: Number(event.target.value) })
                  }
                  unstyled
                />
              </label>
              <label className="studio-check">
                <Input
                  type="checkbox"
                  checked={(clip.filter?.grayscale ?? 0) > 0}
                  onChange={(event) =>
                    changeFilter({ grayscale: event.target.checked ? 1 : 0 })
                  }
                  unstyled
                />
                黑白
              </label>
              <label className="studio-check">
                <Input
                  type="checkbox"
                  checked={(clip.filter?.sepia ?? 0) > 0}
                  onChange={(event) =>
                    changeFilter({ sepia: event.target.checked ? 0.55 : 0 })
                  }
                  unstyled
                />
                复古
              </label>
            </Section>
          ) : null}

          {pane === 'visual' &&
          (clip.kind === 'video' || clip.kind === 'image') ? (
            <Section title="转场">
              <label className="studio-field">
                <span>类型</span>
                <Select
                  value={clip.transitionIn?.type ?? 'none'}
                  options={[
                    { value: 'none', label: '无' },
                    { value: 'fade', label: '交叉淡化' },
                    { value: 'dip-black', label: '黑场' },
                    { value: 'wipe-left', label: '左擦除' },
                    { value: 'wipe-right', label: '右擦除' },
                    { value: 'slide-left', label: '左滑入' },
                    { value: 'slide-right', label: '右滑入' },
                    { value: 'zoom-in', label: '缩放进入' }
                  ]}
                  onChange={(value) =>
                    changeTransition(
                      value as
                        | 'none'
                        | NonNullable<TimelineClip['transitionIn']>['type'],
                      clip.transitionIn?.durationMs ?? 500
                    )
                  }
                />
              </label>
              <label className="studio-field">
                <span>时长</span>
                <Input
                  type="number"
                  min={200}
                  max={3000}
                  step={100}
                  disabled={!clip.transitionIn}
                  value={clip.transitionIn?.durationMs ?? 500}
                  onChange={(event) =>
                    changeTransition(
                      clip.transitionIn?.type ?? 'none',
                      Number(event.target.value) || 500
                    )
                  }
                  unstyled
                />
              </label>
            </Section>
          ) : null}

          {pane === 'audio' ? (
            <Section title="声音">
              <Field label="音量" value={`${Math.round(clip.volume * 100)}%`} />
              <Field label="淡入" value={`${clip.fadeInMs} ms`} />
              <Field label="淡出" value={`${clip.fadeOutMs} ms`} />
              {clip.kind !== 'text' ? (
                <label className="studio-check">
                  <Input
                    type="checkbox"
                    checked={clip.preservePitch}
                    onChange={(event) =>
                      dispatch({
                        op: 'updateClip',
                        clipId: clip.id,
                        patch: { preservePitch: event.target.checked }
                      })
                    }
                    unstyled
                  />
                  变速时保持音高
                </label>
              ) : null}
              {clip.kind !== 'text' ? (
                <>
                  <label className="studio-check">
                    <Input
                      type="checkbox"
                      checked={clip.audioFx?.denoise ?? false}
                      onChange={(event) =>
                        updateAudioFx({ denoise: event.target.checked })
                      }
                      unstyled
                    />
                    降噪
                  </label>
                  <label className="studio-check">
                    <Input
                      type="checkbox"
                      checked={clip.audioFx?.enhanceVoice ?? false}
                      onChange={(event) =>
                        updateAudioFx({ enhanceVoice: event.target.checked })
                      }
                      unstyled
                    />
                    增强人声
                  </label>
                  <label className="studio-check">
                    <Input
                      type="checkbox"
                      checked={clip.audioFx?.loudness ?? false}
                      onChange={(event) =>
                        updateAudioFx({ loudness: event.target.checked })
                      }
                      unstyled
                    />
                    响度均衡
                  </label>
                  <label className="studio-field">
                    <span>变声</span>
                    <Select
                      value={clip.audioFx?.voiceEffect ?? 'none'}
                      options={[
                        { value: 'none', label: '无' },
                        { value: 'chipmunk', label: '花栗鼠' },
                        { value: 'robot', label: '机器人' },
                        { value: 'telephone', label: '电话' }
                      ]}
                      onChange={(value) =>
                        updateAudioFx({
                          voiceEffect: value as AudioFxSettings['voiceEffect']
                        })
                      }
                    />
                  </label>
                  <small className="studio-field-hint">
                    音频清理在导出时生效
                  </small>
                </>
              ) : null}
              {clip.kind === 'video' && clip.media ? (
                <Button
                  className="studio-ghost-btn"
                  onClick={() => void detachAudio()}
                  unstyled
                >
                  分离音频
                </Button>
              ) : null}
            </Section>
          ) : null}

          {pane === 'props' && clip.kind !== 'text' ? (
            <AnalysisSection clip={clip} />
          ) : null}

          {pane === 'audio' &&
          (clip.kind === 'video' || clip.kind === 'audio') &&
          clip.media ? (
            <Section title="自动粗剪">
              <Button
                className="studio-ghost-btn"
                disabled={runningAction !== null}
                onClick={() => void runRemoveSilence()}
                unstyled
              >
                {runningAction === 'silence' ? '检测中…' : '删除静音'}
              </Button>
              {clip.kind === 'video' ? (
                <Button
                  className="studio-ghost-btn"
                  disabled={runningAction !== null}
                  onClick={() => void runSplitByShots()}
                  unstyled
                >
                  {runningAction === 'shots' ? '检测中…' : '按镜头切分'}
                </Button>
              ) : null}
              <Button
                className="studio-ghost-btn"
                disabled={runningAction !== null}
                onClick={() => void runBeatAction('markers')}
                unstyled
              >
                {runningAction === 'beats' ? '检测中…' : '节拍标记'}
              </Button>
              <Button
                className="studio-ghost-btn"
                disabled={runningAction !== null}
                onClick={() => void runBeatAction('split')}
                unstyled
              >
                {runningAction === 'beat-split' ? '检测中…' : '节拍切分'}
              </Button>
              <small className="studio-field-hint">
                静音两端保留 120ms，过短区间跳过；所有操作可 Ctrl+Z 恢复
              </small>
            </Section>
          ) : null}

          {pane === 'visual' && clip.kind !== 'text' ? (
            <KeyframeSection clip={clip} playheadMs={playheadMs} />
          ) : null}

          {pane === 'props' ? (
            clip.kind === 'text' ? (
              <SubtitleSection clip={clip} />
            ) : (
              <Section title="文字">
                <Field label="内容" value={clip.text?.content ?? '—'} />
                <Field label="字号" value={`${clip.text?.fontSize ?? 64} px`} />
                <Field label="颜色" value={clip.text?.color ?? '—'} />
              </Section>
            )
          ) : null}
        </>
      ) : (
        <Section title="时间线">
          <Field label="名称" value={doc.name} />
          <div className="studio-field">
            <span>画幅</span>
            <div className="studio-ratio-row">
              {[
                { label: '9:16', width: 1080, height: 1920 },
                { label: '16:9', width: 1920, height: 1080 },
                { label: '21:9', width: 2560, height: 1080 },
                { label: '3:4', width: 1080, height: 1440 },
                { label: '4:3', width: 1440, height: 1080 },
                { label: '1:1', width: 1080, height: 1080 }
              ].map((item) => (
                <Button
                  key={item.label}
                  type="button"
                  className={`studio-ratio-btn${
                    doc.video.width === item.width &&
                    doc.video.height === item.height
                      ? ' is-active'
                      : ''
                  }`}
                  onClick={() =>
                    dispatch({
                      op: 'setTimelineVideo',
                      video: {
                        ...doc.video,
                        width: item.width,
                        height: item.height
                      }
                    })
                  }
                  unstyled
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>
          <Field
            label="分辨率"
            value={`${doc.video.width} × ${doc.video.height}`}
          />
          <Field label="帧率" value={`${doc.video.fps} fps`} />
          <Field label="片段" value={`${doc.clips.length} 个`} />
          <Field label="轨道" value={`${doc.tracks.length} 条`} />
          <Field label="标记" value={`${doc.markers.length} 个`} />
          <Button
            className="studio-ghost-btn"
            disabled={runningAction !== null}
            onClick={() => void runRemoveSilence()}
            unstyled
          >
            {runningAction === 'silence' ? '检测中…' : '整条时间线删静音'}
          </Button>
          {doc.markers.length > 0 ? (
            <Button
              className="studio-ghost-btn"
              onClick={() =>
                dispatch({
                  op: 'batch',
                  label: '清除全部标记',
                  commands: doc.markers.map((marker) => ({
                    op: 'removeMarker',
                    markerId: marker.id
                  }))
                })
              }
              unstyled
            >
              清除全部标记
            </Button>
          ) : null}
        </Section>
      )}
    </aside>
  )
}
