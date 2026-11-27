import { useEffect, useRef, useState } from 'react'
import type {
  StagePath,
  StagePathTimeKey,
  StageShot,
  StageVec3
} from '@shared/stage-schema'
import { STAGE_EASINGS } from '@shared/stage-schema'
import { normalizeTimeKeys, pathColor } from '@shared/stage-paths'
import { Button, Input, NativeSelect } from '../components/ui'
import { useStageStore } from './stageStore'

const FIELD_CLASS = '!h-7 !rounded-md !text-[11px]'
const FIELD_GROUP_CLASS = 'mt-2 flex flex-col gap-1'
const FIELD_LABEL_CLASS = 'text-[11px] text-fg-subtle'
const DANGER_BUTTON_CLASS =
  'mt-2.5 h-7 !rounded-md border border-[color-mix(in_srgb,var(--danger)_40%,var(--border))] bg-transparent text-[11px] !font-normal !text-danger hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] hover:!text-danger'
const ACTION_BUTTON_CLASS =
  'mt-2 h-7 !rounded-md bg-surface text-[11px] !font-normal !text-fg hover:bg-surface-hover hover:!text-fg'

const KIND_LABEL: Record<StagePath['kind'], string> = {
  camera: '相机路径',
  object: '对象路径',
  follow: '跟随路径'
}

function NumberField({
  label,
  value,
  onCommit,
  step = 0.1,
  suffix = ''
}: {
  label: string
  value: number
  onCommit: (value: number) => void
  step?: number
  suffix?: string
}) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => {
    setDraft(String(value))
  }, [value])
  return (
    <label className={FIELD_GROUP_CLASS}>
      <span className={FIELD_LABEL_CLASS}>
        {label}
        {suffix ? <small className="ml-1 text-fg-subtle">{suffix}</small> : null}
      </span>
      <Input
        className={FIELD_CLASS}
        inputMode="decimal"
        step={step}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const next = Number(draft)
          if (Number.isFinite(next)) onCommit(next)
          else setDraft(String(value))
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
      />
    </label>
  )
}

function PathEditor({ shot, path }: { shot: StageShot; path: StagePath }) {
  const updatePath = useStageStore((state) => state.updatePath)
  const removePath = useStageStore((state) => state.removePath)
  const [curveDraft, setCurveDraft] = useState<StagePathTimeKey[] | null>(null)
  const [smoothDraft, setSmoothDraft] = useState(path.smooth ?? 0.5)
  const dragIndexRef = useRef<number | null>(null)

  const keys = normalizeTimeKeys(path, shot.durationMs)
  const curveKeys = curveDraft ?? keys
  const commitKeys = (next: StagePathTimeKey[]): void => {
    updatePath(shot.id, path.id, { timeKeys: next })
    setCurveDraft(null)
  }

  useEffect(() => {
    setCurveDraft(null)
  }, [path.id, path.timeKeys])

  useEffect(() => {
    setSmoothDraft(path.smooth ?? 0.5)
  }, [path.smooth])

  const addTimeKey = (): void => {
    let index = 1
    let best = 0
    for (let i = 1; i < keys.length; i += 1) {
      const gap = keys[i].at - keys[i - 1].at
      if (gap > best) {
        best = gap
        index = i
      }
    }
    const before = keys[index - 1]
    const after = keys[index]
    const next = keys.slice()
    next.splice(index, 0, {
      at: (before.at + after.at) / 2,
      timeMs: Math.round((before.timeMs + after.timeMs) / 2),
      easing: 'linear'
    })
    commitKeys(next)
  }

  const removeTimeKey = (index: number): void => {
    if (index <= 0 || index >= keys.length - 1) return
    commitKeys(keys.filter((_, keyIndex) => keyIndex !== index))
  }

  const curvePointerDown = (
    event: React.PointerEvent<HTMLDivElement>
  ): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const x = (event.clientX - rect.left) / rect.width
    const y = (event.clientY - rect.top) / rect.height
    let nearest = 0
    let best = Infinity
    curveKeys.forEach((key, index) => {
      const distance = Math.hypot(
        key.at - x,
        key.timeMs / shot.durationMs - y
      )
      if (distance < best) {
        best = distance
        nearest = index
      }
    })
    dragIndexRef.current = nearest
    setCurveDraft(curveKeys)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const curvePointerMove = (
    event: React.PointerEvent<HTMLDivElement>
  ): void => {
    const index = dragIndexRef.current
    const draft = curveDraft
    if (index === null || !draft) return
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const previous = index > 0 ? draft[index - 1] : null
    const following = index < draft.length - 1 ? draft[index + 1] : null
    const rawAt = (event.clientX - rect.left) / rect.width
    const rawTime = ((event.clientY - rect.top) / rect.height) * shot.durationMs
    const at = Math.min(
      following ? following.at - 0.001 : 0.999,
      Math.max(previous ? previous.at + 0.001 : 0.001, rawAt)
    )
    const timeMs = Math.round(
      Math.min(
        following ? following.timeMs - 1 : shot.durationMs,
        Math.max(previous ? previous.timeMs + 1 : 0, rawTime)
      )
    )
    const next = draft.slice()
    next[index] = { ...next[index], at, timeMs }
    setCurveDraft(next)
  }

  const curvePointerUp = (): void => {
    if (dragIndexRef.current !== null && curveDraft) {
      commitKeys(curveDraft)
    }
    dragIndexRef.current = null
  }

  const addPoint = (): void => {
    const last = path.points[path.points.length - 1]?.position
    const previous = path.points[path.points.length - 2]?.position
    if (!last) return
    const next: StageVec3 = previous
      ? [last[0] + (last[0] - previous[0]), last[1], last[2] + (last[2] - previous[2])]
      : [last[0] + 1, last[1], last[2]]
    updatePath(shot.id, path.id, {
      points: [...path.points, { position: next }]
    })
  }

  const removeLastPoint = (): void => {
    if (path.points.length <= 2) return
    updatePath(shot.id, path.id, { points: path.points.slice(0, -1) })
  }

  return (
    <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
      <TextField
        label="名称"
        value={path.name ?? KIND_LABEL[path.kind]}
        onCommit={(name) => updatePath(shot.id, path.id, { name })}
      />

      <div className="flex items-center gap-1.5 text-[10px] text-fg-subtle">
        <span>类型</span>
        <span className="text-fg-muted">{KIND_LABEL[path.kind]}</span>
        <span>·</span>
        <span>{path.points.length} 点</span>
        {path.objectId ? (
          <>
            <span>·</span>
            <span>绑定对象</span>
          </>
        ) : null}
      </div>

      <NumberField
        label="整体高度"
        value={path.height ?? 0}
        onCommit={(height) => updatePath(shot.id, path.id, { height })}
        suffix="m"
      />

      <label className={FIELD_GROUP_CLASS}>
        <span className={FIELD_LABEL_CLASS}>平滑度</span>
        <Input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={smoothDraft}
          onChange={(event) => setSmoothDraft(Number(event.target.value))}
          onPointerUp={() =>
            updatePath(shot.id, path.id, { smooth: smoothDraft })
          }
          onBlur={() => updatePath(shot.id, path.id, { smooth: smoothDraft })}
          className="h-5 accent-pick-bar"
        />
      </label>

      {path.kind === 'camera' ? (
        <>
          <label className={FIELD_GROUP_CLASS}>
            <span className={FIELD_LABEL_CLASS}>相机朝向</span>
            <NativeSelect
              className={FIELD_CLASS}
              value={path.targetMode ?? 'ahead'}
              onChange={(event) =>
                updatePath(shot.id, path.id, {
                  targetMode: event.target.value as StagePath['targetMode']
                })
              }
            >
              <option value="ahead">路径前方</option>
              <option value="fixed">固定目标</option>
              <option value="follow">跟随对象/路径</option>
            </NativeSelect>
          </label>
          <NumberField
            label="Look-ahead"
            value={path.lookAhead ?? 2}
            onCommit={(lookAhead) => updatePath(shot.id, path.id, { lookAhead })}
            suffix="m"
          />
        </>
      ) : null}

      {path.kind === 'object' ? (
        <>
          <label className="mt-2 flex items-center justify-between text-[11px] text-fg-subtle">
            <span>沿切线朝向</span>
            <Input
              type="checkbox"
              className="!h-[13px] !w-[13px] !rounded-none !border-0 !bg-transparent !p-0 accent-pick-bar"
              checked={path.faceTangent !== false}
              onChange={(event) =>
                updatePath(shot.id, path.id, {
                  faceTangent: event.target.checked
                })
              }
            />
          </label>
          <NumberField
            label="朝向偏移"
            value={((path.rotationOffset ?? 0) * 180) / Math.PI}
            onCommit={(degrees) =>
              updatePath(shot.id, path.id, {
                rotationOffset: (degrees * Math.PI) / 180
              })
            }
            suffix="°"
          />
        </>
      ) : null}

      <div className="mt-2 flex items-center justify-between text-[11px] text-fg-subtle">
        <span>时间节点</span>
        <Button
          type="button"
          variant="ghost"
          size="none"
          className="h-5 px-1 text-[10px] !font-normal"
          onClick={addTimeKey}
        >
          + 插入
        </Button>
      </div>

      <div
        className="relative h-20 w-full touch-none rounded-md border border-border bg-surface"
        onPointerDown={curvePointerDown}
        onPointerMove={curvePointerMove}
        onPointerUp={curvePointerUp}
      >
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <polyline
            points={curveKeys
              .map(
                (key) =>
                  `${key.at * 100},${(key.timeMs / shot.durationMs) * 100}`
              )
              .join(' ')}
            fill="none"
            stroke={path.color ?? pathColor(path.kind)}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
          {curveKeys.map((key) => (
            <circle
              key={`${key.at}-${key.timeMs}`}
              cx={key.at * 100}
              cy={(key.timeMs / shot.durationMs) * 100}
              r={2}
              fill={path.color ?? pathColor(path.kind)}
            />
          ))}
        </svg>
      </div>

      <div className="flex flex-col gap-1">
        {keys.map((key, index) => (
          <div
            key={`${index}-${key.at}`}
            className="flex items-center gap-1 text-[10px]"
          >
            <span className="w-9 text-right text-fg-subtle">
              {Math.round(key.at * 100)}%
            </span>
            <Input
              className="!h-6 !flex-1 !rounded-md !px-1.5 !text-[10px]"
              inputMode="numeric"
              defaultValue={key.timeMs}
              key={`time-${path.id}-${index}-${key.timeMs}`}
              onBlur={(event) => {
                const timeMs = Number(event.currentTarget.value)
                if (!Number.isFinite(timeMs)) return
                const next = keys.slice()
                next[index] = {
                  ...next[index],
                  timeMs: Math.max(0, Math.min(shot.durationMs, timeMs))
                }
                commitKeys(next)
              }}
            />
            <NativeSelect
              className="!h-6 !w-[74px] !rounded-md !px-1 !text-[10px]"
              value={key.easing ?? 'linear'}
              onChange={(event) => {
                const next = keys.slice()
                next[index] = {
                  ...next[index],
                  easing: event.target.value as StagePathTimeKey['easing']
                }
                commitKeys(next)
              }}
            >
              {STAGE_EASINGS.map((easing) => (
                <option key={easing} value={easing}>
                  {easing}
                </option>
              ))}
            </NativeSelect>
            <Button
              type="button"
              variant="ghost"
              size="none"
              className="h-5 w-5 shrink-0 px-0 text-[10px] !font-normal"
              disabled={index === 0 || index === keys.length - 1}
              onClick={() => removeTimeKey(index)}
            >
              ×
            </Button>
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] text-fg-subtle">
        <span>控制点</span>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="none"
            className="h-5 px-1 text-[10px] !font-normal"
            onClick={addPoint}
          >
            + 末尾
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="none"
            className="h-5 px-1 text-[10px] !font-normal"
            disabled={path.points.length <= 2}
            onClick={removeLastPoint}
          >
            删除末点
          </Button>
        </div>
      </div>
      <label className="flex items-center justify-between text-[11px] text-fg-subtle">
        <span>闭合路径</span>
        <Input
          type="checkbox"
          className="!h-[13px] !w-[13px] !rounded-none !border-0 !bg-transparent !p-0 accent-pick-bar"
          checked={path.closed === true}
          onChange={(event) =>
            updatePath(shot.id, path.id, { closed: event.target.checked })
          }
        />
      </label>

      <Button
        type="button"
        variant="ghost"
        size="none"
        className={DANGER_BUTTON_CLASS}
        onClick={() => removePath(shot.id, path.id)}
      >
        删除路径
      </Button>
    </div>
  )
}

function TextField({
  label,
  value,
  onCommit
}: {
  label: string
  value: string
  onCommit: (value: string) => void
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <label className={FIELD_GROUP_CLASS}>
      <span className={FIELD_LABEL_CLASS}>{label}</span>
      <Input
        className={FIELD_CLASS}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const next = draft.trim()
          if (next) onCommit(next)
          else setDraft(value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
      />
    </label>
  )
}

export function StagePathInspector() {
  const doc = useStageStore((state) => state.doc)
  const shotId = useStageStore((state) => state.selectedShotId)
  const selectedPathId = useStageStore((state) => state.selectedPathId)
  const selectPath = useStageStore((state) => state.selectPath)
  const setPathVisible = useStageStore((state) => state.setPathVisible)

  if (!doc || !shotId) return null
  const shot = doc.shots.find((item) => item.id === shotId)
  if (!shot) return null
  const paths = shot.paths ?? []
  const selected = paths.find((path) => path.id === selectedPathId)

  return (
    <section className="flex flex-col gap-1 border-t border-border pt-2">
      <header className="flex items-center justify-between text-[10px] text-fg-subtle">
        <span>路径</span>
        <span>{paths.length}</span>
      </header>

      {paths.length === 0 ? (
        <p className="text-[10px] leading-relaxed text-fg-subtle">
          当前镜头没有路径。用顶部「手绘」选择相机路径、对象路径或跟随路径，在视口拖动生成。
        </p>
      ) : (
        <div className="flex flex-col gap-0.5">
          {paths.map((path) => (
            <div
              key={path.id}
              className={`flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] ${
                path.id === selectedPathId ? 'bg-surface-hover' : ''
              }`}
            >
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: path.color ?? pathColor(path.kind) }}
              />
              <Button
                unstyled
                className="min-w-0 flex-1 truncate text-left text-[11px] text-fg-muted hover:text-fg"
                onClick={() => selectPath(path.id)}
                title={path.name ?? KIND_LABEL[path.kind]}
              >
                {path.name ?? KIND_LABEL[path.kind]}
              </Button>
              <span className="shrink-0 text-[9px] text-fg-subtle">
                {KIND_LABEL[path.kind]}
              </span>
              <Input
                type="checkbox"
                className="!h-[13px] !w-[13px] !rounded-none !border-0 !bg-transparent !p-0 accent-pick-bar"
                checked={path.visible !== false}
                onChange={(event) =>
                  setPathVisible(shot.id, path.id, event.target.checked)
                }
                title="显示/隐藏"
              />
            </div>
          ))}
        </div>
      )}

      {selected ? <PathEditor shot={shot} path={selected} /> : null}
    </section>
  )
}
