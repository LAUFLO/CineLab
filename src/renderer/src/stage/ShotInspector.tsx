import { useEffect, useMemo, useState } from 'react'
import type {
  StageCameraAim,
  StageCameraDistance,
  StageCameraHeight,
  StageCameraRelation,
  StageShotFraming,
  StageShotIntent,
  StageShotIntentKey
} from '@shared/stage-schema'
import { solveStageShotIntent } from '@shared/stage-shot-intent'
import { Button, Input, NativeSelect } from '../components/ui'
import { useStageStore } from './stageStore'

const FRAMINGS: StageShotFraming[] = ['single', 'two_shot', 'group']
const RELATIONS: StageCameraRelation[] = [
  'front',
  'front_side',
  'side',
  'back_side',
  'behind',
  'over_shoulder',
  'hold'
]
const DISTANCES: StageCameraDistance[] = ['close', 'medium', 'far']
const HEIGHTS: StageCameraHeight[] = ['floor', 'low', 'eye', 'high', 'crane']
const AIMS: StageCameraAim[] = ['feet', 'body', 'face']

const LABEL: Record<string, string> = {
  front: '正面',
  front_side: '前侧',
  side: '侧面',
  back_side: '后侧',
  behind: '背后',
  over_shoulder: '过肩',
  hold: '原地摇',
  close: '近景',
  medium: '中景',
  far: '远景',
  floor: '地面',
  low: '低机位',
  eye: '眼平',
  high: '高机位',
  crane: '摇臂',
  feet: '脚',
  body: '身体',
  face: '脸',
  single: '单人',
  two_shot: '双人',
  group: '群体'
}

function Field({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-[11px] text-fg-muted">
      <span className="shrink-0">{label}</span>
      {children}
    </label>
  )
}

function Select<T extends string>({
  value,
  options,
  onChange
}: {
  value: T
  options: readonly T[]
  onChange: (value: T) => void
}) {
  return (
    <NativeSelect
      className="h-7 min-w-0 flex-1 rounded-md px-1.5 text-[11px]"
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {LABEL[option] ?? option}
        </option>
      ))}
    </NativeSelect>
  )
}

export function ShotInspector() {
  const doc = useStageStore((state) => state.doc)
  const shotId = useStageStore((state) => state.selectedShotId)
  const playbackMs = useStageStore((state) => state.playbackMs)
  const setShotIntent = useStageStore((state) => state.setShotIntent)
  const clearShotIntent = useStageStore((state) => state.clearShotIntent)

  const shot = doc?.shots.find((item) => item.id === shotId)
  const [framing, setFraming] = useState<StageShotFraming>('single')
  const [relation, setRelation] = useState<StageCameraRelation>('front')
  const [side, setSide] = useState<'left' | 'right'>('right')
  const [distance, setDistance] = useState<StageCameraDistance>('medium')
  const [height, setHeight] = useState<StageCameraHeight>('eye')
  const [aim, setAim] = useState<StageCameraAim>('body')
  const [angleOffset, setAngleOffset] = useState(0)
  const [subjectIds, setSubjectIds] = useState<string[]>([])
  const [towardId, setTowardId] = useState('')
  const [notes, setNotes] = useState<string[]>([])

  useEffect(() => {
    if (!shot) return
    const first = shot.intent?.keys[0]
    if (first) {
      setFraming(first.framing)
      setRelation(first.relation)
      setSide(first.side ?? 'right')
      setDistance(first.distance ?? 'medium')
      setHeight(first.height ?? 'eye')
      setAim(first.aim ?? 'body')
      setAngleOffset(first.angleOffsetDeg ?? 0)
      setSubjectIds(first.subjectIds)
      setTowardId(first.towardId ?? '')
    } else if (doc?.objects[0]) {
      setSubjectIds([doc.objects[0].id])
      setTowardId('')
    }
    setNotes([])
  }, [shot?.id, doc?.objects.length])

  const subjects = useMemo(() => doc?.objects ?? [], [doc?.objects])

  if (!doc || !shot) return null

  const toggleSubject = (objectId: string) => {
    setSubjectIds((current) => {
      if (current.includes(objectId)) {
        const next = current.filter((id) => id !== objectId)
        return next.length > 0 ? next : current
      }
      const limit =
        framing === 'single' ? 1 : framing === 'two_shot' ? 2 : 8
      return [...current, objectId].slice(0, limit)
    })
  }

  const apply = () => {
    const key: StageShotIntentKey = {
      timeMs: Math.round(playbackMs),
      subjectIds:
        subjectIds.length > 0 ? subjectIds : [subjects[0]?.id ?? ''],
      framing,
      relation,
      side,
      distance,
      height,
      aim,
      angleOffsetDeg: angleOffset
    }
    if (relation === 'over_shoulder' && towardId) key.towardId = towardId

    const existing = (shot.intent?.keys ?? []).filter(
      (item) => Math.abs(item.timeMs - key.timeMs) > 1
    )
    const intent: StageShotIntent = {
      version: 1,
      keys: [...existing, key].sort((a, b) => a.timeMs - b.timeMs)
    }
    const solved = solveStageShotIntent(doc, { ...shot, intent })
    setNotes(solved.notes)
    setShotIntent(intent)
  }

  return (
    <section className="flex flex-col gap-2">
      <header className="mb-1 flex flex-col gap-0.5 border-b border-border pb-2">
        <span className="text-[10px] text-fg-subtle">镜头语义</span>
        <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px]">
          {shot.name ?? shot.id}
        </strong>
      </header>

      <Field label="构图">
        <Select value={framing} options={FRAMINGS} onChange={setFraming} />
      </Field>
      <Field label="机位关系">
        <Select value={relation} options={RELATIONS} onChange={setRelation} />
      </Field>
      <Field label="左右">
        <Select
          value={side}
          options={['left', 'right'] as const}
          onChange={setSide}
        />
      </Field>
      <Field label="景别">
        <Select value={distance} options={DISTANCES} onChange={setDistance} />
      </Field>
      <Field label="高度">
        <Select value={height} options={HEIGHTS} onChange={setHeight} />
      </Field>
      <Field label="瞄准">
        <Select value={aim} options={AIMS} onChange={setAim} />
      </Field>
      <Field label="角度偏移">
        <Input
          type="number"
          className="h-7 w-20 text-right text-[11px]"
          value={angleOffset}
          min={0}
          max={360}
          step={5}
          onChange={(event) => setAngleOffset(Number(event.target.value))}
        />
      </Field>

      {relation === 'over_shoulder' ? (
        <Field label="看向">
          <NativeSelect
            className="h-7 min-w-0 flex-1 rounded-md px-1.5 text-[11px]"
            value={towardId}
            onChange={(event) => setTowardId(event.target.value)}
          >
            <option value="">选择对象</option>
            {subjects
              .filter((item) => !subjectIds.includes(item.id))
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </NativeSelect>
        </Field>
      ) : null}

      <div className="mt-1 flex flex-col gap-1">
        <span className="text-[10px] text-fg-subtle">
          主体（{framing === 'single' ? '1' : framing === 'two_shot' ? '2' : '2–8'}）
        </span>
        <div className="max-h-32 overflow-auto rounded-md border border-border p-1">
          {subjects.length === 0 ? (
            <span className="text-[10px] text-fg-subtle">舞台里还没有对象</span>
          ) : (
            subjects.map((item) => (
              <label
                key={item.id}
                className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-[11px] hover:bg-white/5"
              >
                <Input
                  unstyled
                  type="checkbox"
                  checked={subjectIds.includes(item.id)}
                  onChange={() => toggleSubject(item.id)}
                />
                <span className="truncate">{item.name}</span>
              </label>
            ))
          )}
        </div>
      </div>

      <Button
        variant="primary"
        size="none"
        className="mt-1 h-8 rounded-md px-2 text-[12px] font-semibold text-black hover:opacity-90"
        onClick={apply}
      >
        在当前时间写入关键帧
      </Button>
      <Button
        variant="secondary"
        size="none"
        className="h-7 rounded-md px-2 text-[11px] text-fg-muted hover:bg-white/5"
        onClick={() => {
          clearShotIntent()
          setNotes([])
        }}
      >
        转手工（保留轨迹）
      </Button>

      {notes.length > 0 ? (
        <div className="mt-1 flex flex-col gap-1 rounded-md border border-border bg-white/[0.03] p-1.5 text-[10px] leading-relaxed text-fg-muted">
          {notes.map((note) => (
            <span key={note}>{note}</span>
          ))}
        </div>
      ) : null}
    </section>
  )
}
