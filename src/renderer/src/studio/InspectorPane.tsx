import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { TimelineAnalysisKind } from '@shared/ipc-contract'
import { formatTimecode } from '@shared/timeline-layout'
import { evaluateClipKeys } from '@shared/timeline-keyframes'
import { newMarkerId, type ClipKey, type TimelineClip } from '@shared/timeline-schema'
import { useTimelineStore } from '../stores/timeline'
import { useUIStore } from '../stores/ui'

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
      <input readOnly value={value} />
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
        <span>内容</span>
        <textarea
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
        />
      </label>
      <small className="studio-field-hint">失焦或 Ctrl+Enter 保存</small>

      <label className="studio-field">
        <span>字体</span>
        <input
          value={fontFamily}
          onChange={(event) => setFontFamily(event.target.value)}
          onBlur={() => commit({ fontFamily })}
        />
      </label>

      <label className="studio-field">
        <span>字号</span>
        <input
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
        <input
          type="color"
          value={color}
          onChange={(event) => setColor(event.target.value)}
          onBlur={() => commit({ color })}
        />
      </label>

      <label className="studio-field">
        <span>对齐</span>
        <select
          value={text.align}
          onChange={(event) =>
            commit({ align: event.target.value as TextStyle['align'] })
          }
        >
          <option value="left">左</option>
          <option value="center">中</option>
          <option value="right">右</option>
        </select>
      </label>

      <div className="studio-field-row">
        <label className="studio-check">
          <input
            type="checkbox"
            checked={text.bold}
            onChange={(event) => commit({ bold: event.target.checked })}
          />
          粗体
        </label>
        <label className="studio-check">
          <input
            type="checkbox"
            checked={text.italic}
            onChange={(event) => commit({ italic: event.target.checked })}
          />
          斜体
        </label>
        <label className="studio-check">
          <input
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
          />
          阴影
        </label>
      </div>

      <label className="studio-field">
        <span>描边</span>
        <input
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
      showToast(
        error instanceof Error ? error.message : String(error),
        'error'
      )
    } finally {
      setRunning(null)
    }
  }

  return (
    <Section title="AI 分析">
      <div className="studio-field-row">
        {canShots ? (
          <button
            type="button"
            className="studio-ghost-btn"
            disabled={running !== null}
            onClick={() => void run('shots')}
          >
            {running === 'shots' ? '检测中…' : '镜头'}
          </button>
        ) : null}
        <button
          type="button"
          className="studio-ghost-btn"
          disabled={running !== null}
          onClick={() => void run('silences')}
        >
          {running === 'silences' ? '检测中…' : '静音'}
        </button>
        <button
          type="button"
          className="studio-ghost-btn"
          disabled={running !== null}
          onClick={() => void run('beats')}
        >
          {running === 'beats' ? '检测中…' : '节拍'}
        </button>
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
        <select
          value={property}
          onChange={(event) =>
            selectProperty(event.target.value as ClipKey['property'])
          }
        >
          <option value="position">位置</option>
          <option value="scale">缩放</option>
          <option value="rotation">旋转</option>
          <option value="opacity">透明度</option>
          <option value="volume">音量</option>
        </select>
        {property === 'position' ? (
          <>
            <input
              className="studio-keyframe-input"
              type="number"
              step={0.01}
              value={x}
              onChange={(event) => setX(Number(event.target.value) || 0)}
            />
            <input
              className="studio-keyframe-input"
              type="number"
              step={0.01}
              value={y}
              onChange={(event) => setY(Number(event.target.value) || 0)}
            />
          </>
        ) : (
          <input
            className="studio-keyframe-input"
            type="number"
            step={property === 'rotation' ? 1 : 0.01}
            value={value}
            onChange={(event) => setValue(Number(event.target.value) || 0)}
          />
        )}
        <button type="button" className="studio-ghost-btn" onClick={addKey}>
          添加
        </button>
      </div>

      {clip.keys.length === 0 ? (
        <small className="studio-field-hint">把播放头移到片段内，再添加关键帧</small>
      ) : (
        <div className="studio-keyframes">
          {clip.keys.map((key, index) => (
            <div className="studio-keyframe" key={`${key.property}-${index}`}>
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
              <input
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
              />
              {typeof key.value === 'object' ? (
                <>
                  <input
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
                  />
                  <input
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
                  />
                </>
              ) : (
                <input
                  className="studio-keyframe-input"
                  type="number"
                  step={0.01}
                  value={key.value}
                  onChange={(event) =>
                    patchKey(index, {
                      value: Number(event.target.value) || 0
                    })
                  }
                />
              )}
              <select
                value={key.ease}
                onChange={(event) =>
                  patchKey(index, {
                    ease: event.target.value as ClipKey['ease']
                  })
                }
              >
                <option value="linear">线性</option>
                <option value="ease-in">缓入</option>
                <option value="ease-out">缓出</option>
                <option value="ease-in-out">缓入缓出</option>
              </select>
              <button
                type="button"
                className="studio-icon-btn"
                title="删除关键帧"
                onClick={() =>
                  updateKeys(clip.keys.filter((_, itemIndex) => itemIndex !== index))
                }
              >
                ×
              </button>
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
  const clip = doc?.clips.find((item) => item.id === selectedIds[0]) ?? null

  const detachAudio = async (): Promise<void> => {
    if (!clip?.media || clip.kind !== 'video') return
    const probe = await window.api.media.probe(clip.media.path).catch(() => null)
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
    type: 'none' | 'fade' | 'dip-black',
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

  if (!doc) {
    return <aside className="studio-inspector" />
  }

  return (
    <aside className="studio-inspector">
      <div className="studio-inspector__head">属性</div>

      {clip ? (
        <>
          <Section title="基础">
            <Field label="名称" value={clip.name || '—'} />
            <Field label="起点" value={formatTimecode(clip.startMs)} />
            <Field label="时长" value={formatTimecode(clip.durationMs)} />
            {clip.kind !== 'text' ? (
              <label className="studio-field">
                <span>速度</span>
                <select
                  value={clip.speed}
                  onChange={(event) => changeSpeed(Number(event.target.value))}
                >
                  {[0.25, 0.5, 1, 1.5, 2, 4].map((speed) => (
                    <option key={speed} value={speed}>
                      {speed}×
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <Field label="速度" value={`${clip.speed.toFixed(1)}×`} />
            )}
          </Section>

          <Section title="画面">
            <label className="studio-field">
              <span>缩放</span>
              <input
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
              />
            </label>
            <label className="studio-field">
              <span>X 偏移</span>
              <input
                type="number"
                min={-10}
                max={10}
                step={0.01}
                value={clip.transform?.offsetX ?? 0}
                onChange={(event) =>
                  changeTransform({ offsetX: Number(event.target.value) || 0 })
                }
              />
            </label>
            <label className="studio-field">
              <span>Y 偏移</span>
              <input
                type="number"
                min={-10}
                max={10}
                step={0.01}
                value={clip.transform?.offsetY ?? 0}
                onChange={(event) =>
                  changeTransform({ offsetY: Number(event.target.value) || 0 })
                }
              />
            </label>
            <label className="studio-field">
              <span>旋转</span>
              <input
                type="number"
                min={-360}
                max={360}
                step={1}
                value={clip.transform?.rotation ?? 0}
                onChange={(event) =>
                  changeTransform({ rotation: Number(event.target.value) || 0 })
                }
              />
            </label>
            <label className="studio-field">
              <span>不透明度</span>
              <input
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
              />
            </label>
            <Field label="混合" value={BLEND_LABEL[clip.blend] ?? clip.blend} />
            {clip.kind === 'video' || clip.kind === 'image' ? (
              <button
                type="button"
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
              >
                画中画预设
              </button>
            ) : null}
          </Section>

          {clip.kind === 'video' || clip.kind === 'image' ? (
            <Section title="转场">
              <label className="studio-field">
                <span>类型</span>
                <select
                  value={clip.transitionIn?.type ?? 'none'}
                  onChange={(event) =>
                    changeTransition(
                      event.target.value as 'none' | 'fade' | 'dip-black',
                      clip.transitionIn?.durationMs ?? 500
                    )
                  }
                >
                  <option value="none">无</option>
                  <option value="fade">交叉淡化</option>
                  <option value="dip-black">黑场</option>
                </select>
              </label>
              <label className="studio-field">
                <span>时长</span>
                <input
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
                />
              </label>
            </Section>
          ) : null}

          <Section title="声音">
            <Field label="音量" value={`${Math.round(clip.volume * 100)}%`} />
            <Field label="淡入" value={`${clip.fadeInMs} ms`} />
            <Field label="淡出" value={`${clip.fadeOutMs} ms`} />
            {clip.kind !== 'text' ? (
              <label className="studio-check">
                <input
                  type="checkbox"
                  checked={clip.preservePitch}
                  onChange={(event) =>
                    dispatch({
                      op: 'updateClip',
                      clipId: clip.id,
                      patch: { preservePitch: event.target.checked }
                    })
                  }
                />
                变速时保持音高
              </label>
            ) : null}
            {clip.kind === 'video' && clip.media ? (
              <button
                type="button"
                className="studio-ghost-btn"
                onClick={() => void detachAudio()}
              >
                分离音频
              </button>
            ) : null}
          </Section>

          {clip.kind !== 'text' ? (
            <AnalysisSection clip={clip} />
          ) : null}

          {clip.kind !== 'text' ? (
            <KeyframeSection clip={clip} playheadMs={playheadMs} />
          ) : null}

          {clip.kind === 'text' ? (
            <SubtitleSection clip={clip} />
          ) : (
            <Section title="文字">
              <Field label="内容" value={clip.text?.content ?? '—'} />
              <Field label="字号" value={`${clip.text?.fontSize ?? 64} px`} />
              <Field label="颜色" value={clip.text?.color ?? '—'} />
            </Section>
          )}
        </>
      ) : (
        <Section title="时间线">
          <Field label="名称" value={doc.name} />
          <Field label="分辨率" value={`${doc.video.width} × ${doc.video.height}`} />
          <Field label="帧率" value={`${doc.video.fps} fps`} />
          <Field label="片段" value={`${doc.clips.length} 个`} />
          <Field label="轨道" value={`${doc.tracks.length} 条`} />
          <Field label="标记" value={`${doc.markers.length} 个`} />
          {doc.markers.length > 0 ? (
            <button
              type="button"
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
            >
              清除全部标记
            </button>
          ) : null}
        </Section>
      )}
    </aside>
  )
}
