import { useEffect, useState } from 'react'
import {
  STAGE_POSE_PRESETS,
  type StageAspect,
  type StageCamera,
  type StageObject,
  type StageVec3
} from '@shared/stage-schema'
import { STAGE_MOTIONS } from '@shared/stage-motions'
import { ShotInspector } from './ShotInspector'
import { useStageStore } from './stageStore'
import { Input, NativeSelect, Button } from '../components/ui'

const TYPE_LABEL: Record<StageObject['type'], string> = {
  human: '人物',
  box: '立方体',
  sphere: '球体',
  plane: '平面',
  gltf: '模型',
  crowd: '群众'
}

const ASPECTS: StageAspect[] = ['16:9', '9:16', '1:1']

const FIELD_CLASS = '!h-[26px] !rounded-md !px-1.5 !text-[10px] font-mono'
const FIELD_LABEL_CLASS =
  'flex items-baseline justify-between text-[11px] text-fg-subtle'
const FIELD_GROUP_CLASS = 'mt-2 flex flex-col gap-1'
const DANGER_BUTTON_CLASS =
  'mt-2.5 h-7 !rounded-md border border-[color-mix(in_srgb,var(--danger)_40%,var(--border))] bg-transparent text-[11px] !font-normal !text-danger hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] hover:!text-danger'
const ACTION_BUTTON_CLASS =
  'mt-2.5 h-7 !rounded-md bg-surface text-[11px] !font-normal !text-fg hover:bg-surface-hover hover:!text-fg'

function format(value: number, scale = 1): string {
  const result = value * scale
  return Number.isInteger(result) ? String(result) : result.toFixed(2)
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2.5 py-[3px]">
      <span className="shrink-0 text-[11px] text-fg-subtle">{label}</span>
      <strong className="overflow-hidden text-right font-mono text-[10px] font-medium text-ellipsis whitespace-nowrap text-fg">
        {value}
      </strong>
    </div>
  )
}

function Vec3Field({
  label,
  value,
  onCommit,
  scale = 1,
  suffix = ''
}: {
  label: string
  value: StageVec3
  onCommit: (value: StageVec3) => void
  scale?: number
  suffix?: string
}) {
  const [draft, setDraft] = useState(() =>
    value.map((item) => format(item, scale))
  )

  useEffect(() => {
    setDraft(value.map((item) => format(item, scale)))
  }, [value, scale])

  const commit = (index: number, raw: string): void => {
    const next = [...draft]
    next[index] = raw
    setDraft(next)

    const numbers = next.map((item) => Number(item))
    if (numbers.every((item) => Number.isFinite(item))) {
      onCommit([numbers[0], numbers[1], numbers[2]])
    } else {
      setDraft(value.map((item) => format(item, scale)))
    }
  }

  return (
    <div className={FIELD_GROUP_CLASS}>
      <span className={FIELD_LABEL_CLASS}>
        {label}
        {suffix ? (
          <small className="text-[9px] text-fg-subtle">{suffix}</small>
        ) : null}
      </span>
      <div className="grid grid-cols-3 gap-1">
        {draft.map((item, index) => (
          <Input
            key={index}
            className={FIELD_CLASS}
            value={item}
            inputMode="decimal"
            onChange={(event) => {
              const next = [...draft]
              next[index] = event.target.value
              setDraft(next)
            }}
            onBlur={(event) => commit(index, event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
            }}
          />
        ))}
      </div>
    </div>
  )
}

function NumberField({
  label,
  value,
  min,
  max,
  onCommit
}: {
  label: string
  value: number
  min: number
  max: number
  onCommit: (value: number) => void
}) {
  const [draft, setDraft] = useState(String(value))

  useEffect(() => {
    setDraft(String(value))
  }, [value])

  const commit = (raw: string): void => {
    const number = Number(raw)
    if (Number.isFinite(number) && number >= min && number <= max) {
      onCommit(number)
    } else {
      setDraft(String(value))
    }
  }

  return (
    <label className={FIELD_GROUP_CLASS}>
      <span className={FIELD_LABEL_CLASS}>
        {label}
        <small className="text-[9px] text-fg-subtle">
          {min}-{max}
        </small>
      </span>
      <Input
        className={FIELD_CLASS}
        value={draft}
        inputMode="decimal"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => commit(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
      />
    </label>
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

  useEffect(() => {
    setDraft(value)
  }, [value])

  return (
    <label className={FIELD_GROUP_CLASS}>
      <span className={FIELD_LABEL_CLASS}>{label}</span>
      <Input
        className={FIELD_CLASS}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => {
          const next = event.currentTarget.value.trim()
          if (next && next !== value) onCommit(next)
          else setDraft(value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
      />
    </label>
  )
}

function ObjectInspector({ object }: { object: StageObject }) {
  const updateObject = useStageStore((state) => state.updateObject)
  const removeSelectedObject = useStageStore(
    (state) => state.removeSelectedObject
  )

  return (
    <section className="flex flex-col gap-1">
      <header className="mb-1 flex flex-col gap-0.5 border-b border-border pb-2">
        <span className="text-[10px] text-fg-subtle">对象</span>
        <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px]">
          {object.name}
        </strong>
      </header>
      <Row label="类型" value={TYPE_LABEL[object.type]} />

      <Vec3Field
        label="位置"
        value={object.transform.position}
        onCommit={(position) =>
          updateObject(object.id, { transform: { position } })
        }
      />
      <Vec3Field
        label="旋转"
        value={object.transform.rotation}
        scale={180 / Math.PI}
        suffix="°"
        onCommit={(rotation) =>
          updateObject(object.id, {
            transform: {
              rotation: rotation.map(
                (item) => (item * Math.PI) / 180
              ) as StageVec3
            }
          })
        }
      />
      <Vec3Field
        label="缩放"
        value={object.transform.scale}
        onCommit={(scale) => updateObject(object.id, { transform: { scale } })}
      />

      <label className={FIELD_GROUP_CLASS}>
        <span className={FIELD_LABEL_CLASS}>姿势</span>
        <NativeSelect
          className={FIELD_CLASS}
          value={object.pose ?? 'stand'}
          onChange={(event) =>
            updateObject(object.id, { pose: event.target.value })
          }
        >
          {STAGE_POSE_PRESETS.map((pose) => (
            <option key={pose} value={pose}>
              {STAGE_MOTIONS[pose]?.name ?? pose}
            </option>
          ))}
        </NativeSelect>
      </label>

      <label className={FIELD_GROUP_CLASS}>
        <span className={FIELD_LABEL_CLASS}>颜色</span>
        <Input
          className="!h-7 !rounded-md !p-0.5 cursor-pointer"
          type="color"
          value={object.color ?? '#9ca3af'}
          onChange={(event) =>
            updateObject(object.id, { color: event.target.value })
          }
        />
      </label>

      <label
        className={`${FIELD_GROUP_CLASS} !flex-row items-center justify-between`}
      >
        <span className={FIELD_LABEL_CLASS}>可见</span>
        <Input
          className="!h-[13px] !w-[13px] !rounded-none !border-0 !bg-transparent !p-0 accent-pick-bar"
          type="checkbox"
          checked={object.visible !== false}
          onChange={(event) =>
            updateObject(object.id, { visible: event.target.checked })
          }
        />
      </label>

      <Button
        type="button"
        variant="ghost"
        size="none"
        className={DANGER_BUTTON_CLASS}
        onClick={() => removeSelectedObject()}
      >
        删除对象
      </Button>
    </section>
  )
}

function CameraInspector({ camera }: { camera: StageCamera }) {
  const updateCamera = useStageStore((state) => state.updateCamera)
  const removeSelectedCamera = useStageStore(
    (state) => state.removeSelectedCamera
  )
  const selectCamera = useStageStore((state) => state.selectCamera)

  return (
    <section className="flex flex-col gap-1">
      <header className="mb-1 flex flex-col gap-0.5 border-b border-border pb-2">
        <span className="text-[10px] text-fg-subtle">机位</span>
        <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px]">
          {camera.name}
        </strong>
      </header>

      <TextField
        label="名称"
        value={camera.name}
        onCommit={(name) => updateCamera(camera.id, { name })}
      />
      <Vec3Field
        label="位置"
        value={camera.position}
        onCommit={(position) => updateCamera(camera.id, { position })}
      />
      <Vec3Field
        label="注视点"
        value={camera.target}
        onCommit={(target) => updateCamera(camera.id, { target })}
      />
      <NumberField
        label="FOV"
        value={camera.fov}
        min={10}
        max={120}
        onCommit={(fov) => updateCamera(camera.id, { fov })}
      />

      <label className={FIELD_GROUP_CLASS}>
        <span className={FIELD_LABEL_CLASS}>画幅</span>
        <NativeSelect
          className={FIELD_CLASS}
          value={camera.aspect ?? '16:9'}
          onChange={(event) =>
            updateCamera(camera.id, {
              aspect: event.target.value as StageAspect
            })
          }
        >
          {ASPECTS.map((aspect) => (
            <option key={aspect} value={aspect}>
              {aspect}
            </option>
          ))}
        </NativeSelect>
      </label>

      <Button
        type="button"
        variant="secondary"
        size="none"
        className={ACTION_BUTTON_CLASS}
        onClick={() => selectCamera(camera.id)}
      >
        切换到此机位
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="none"
        className={DANGER_BUTTON_CLASS}
        onClick={() => removeSelectedCamera()}
      >
        删除机位
      </Button>
    </section>
  )
}

export function StageInspector() {
  const doc = useStageStore((state) => state.doc)
  const selectedObjectId = useStageStore((state) => state.selectedObjectId)
  const selectedCameraId = useStageStore((state) => state.selectedCameraId)
  const selectedShotId = useStageStore((state) => state.selectedShotId)

  if (!doc) return null

  const object = doc.objects.find((item) => item.id === selectedObjectId)
  if (object) return <ObjectInspector object={object} />

  const camera = doc.cameras.find((item) => item.id === selectedCameraId)
  if (camera) return <CameraInspector camera={camera} />

  if (selectedShotId) return <ShotInspector />

  return (
    <section className="flex flex-col gap-1">
      <header className="mb-1 flex flex-col gap-0.5 border-b border-border pb-2">
        <span className="text-[10px] text-fg-subtle">场景</span>
        <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px]">
          {doc.name}
        </strong>
      </header>
      <Row label="对象" value={`${doc.objects.length}`} />
      <Row label="机位" value={`${doc.cameras.length}`} />
      <Row label="镜头" value={`${doc.shots.length}`} />
      <Row label="背景" value={doc.background.kind} />
      <p className="mt-2.5 text-[10px] leading-relaxed text-fg-subtle">
        选中对象或机位后可编辑属性；也可以在视口里拖拽变换。
      </p>
    </section>
  )
}
