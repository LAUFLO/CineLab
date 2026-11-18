import { useEffect, useState } from 'react'
import type { PrevisWorldLandmarkKind, PrevisWorldLandmarkSpot, PrevisWorldRef } from '@shared/previs/world-gen'
import {
  PREVIS_WORLD_DENSITIES,
  PREVIS_WORLD_LANDMARK_KINDS,
  PREVIS_WORLD_LANDMARK_SPOTS,
  PREVIS_WORLD_LAYOUTS,
  PREVIS_WORLD_MAX_LANDMARKS,
  PREVIS_WORLD_STYLES,
  PREVIS_WORLD_THEMES,
  PREVIS_WORLD_TIMES,
  PREVIS_WORLD_WEATHERS,
  normalizePrevisWorldRef
} from '@shared/previs/world-gen'
import { PREVIS_WORLD_WATER_KINDS } from '@shared/previs/world-water'
import {
  Button,
  Dialog,
  Field,
  Input,
  NativeSelect,
  Switch
} from '../components/ui'
import { useStageStore } from './stageStore'

const DEFAULT_WORLD: PrevisWorldRef = normalizePrevisWorldRef({
  generatorVersion: 'styled-v1',
  style: 'modern_city',
  layout: 'street',
  density: 'medium',
  timeOfDay: 'dusk',
  weather: 'clear',
  seed: 1,
  extentM: [160, 160]
})

const PRESETS: Array<{ label: string; patch: Partial<PrevisWorldRef> }> = [
  {
    label: '现代街道',
    patch: {
      style: 'modern_city',
      layout: 'street',
      density: 'medium',
      timeOfDay: 'day',
      weather: undefined,
      theme: undefined,
      water: undefined,
      landmarks: []
    }
  },
  {
    label: '江户雨夜',
    patch: {
      style: 'edo',
      layout: 'street',
      density: 'medium',
      timeOfDay: 'night',
      weather: 'rain',
      neon: true,
      theme: undefined,
      water: undefined
    }
  },
  {
    label: '雪地广场',
    patch: {
      style: 'modern_city',
      layout: 'plaza',
      density: 'low',
      timeOfDay: 'day',
      weather: 'snow',
      theme: undefined
    }
  },
  {
    label: '火星基地',
    patch: {
      style: 'custom',
      theme: 'mars',
      layout: 'street',
      density: 'medium',
      timeOfDay: 'day',
      weather: undefined,
      water: undefined
    }
  },
  {
    label: '赛博朋克',
    patch: {
      style: 'modern_city',
      theme: 'cyberpunk',
      timeOfDay: 'night',
      weather: 'rain',
      neon: true
    }
  },
  {
    label: '十字路口',
    patch: {
      style: 'modern_city',
      layout: 'crossroad',
      density: 'high',
      timeOfDay: 'day',
      theme: undefined
    }
  }
]

function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000_000)
}

export function WorldSettingsDialog({
  open,
  onClose
}: {
  open: boolean
  onClose: () => void
}) {
  const doc = useStageStore((state) => state.doc)
  const [draft, setDraft] = useState<PrevisWorldRef>(DEFAULT_WORLD)

  useEffect(() => {
    if (open) setDraft(doc?.world ?? DEFAULT_WORLD)
  }, [open])

  const patch = (next: Partial<PrevisWorldRef>): void => {
    setDraft((current) => ({ ...current, ...next }))
  }

  const apply = (): void => {
    const normalized = normalizePrevisWorldRef(draft)
    useStageStore.getState().applyCommands([
      { type: 'setWorld', world: normalized }
    ])
    onClose()
  }

  const clear = (): void => {
    useStageStore.getState().applyCommands([{ type: 'setWorld' }])
    onClose()
  }

  const applyPreset = (presetPatch: Partial<PrevisWorldRef>): void => {
    setDraft(
      normalizePrevisWorldRef({
        ...draft,
        ...presetPatch,
        styleParams: undefined,
        seed: randomSeed()
      })
    )
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="世界设置"
      description="生成程序化白膜场景，或手动调整街道、建筑、天气和地标。"
      size="lg"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={clear}>
            清除世界
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              取消
            </Button>
            <Button variant="primary" size="sm" onClick={apply}>
              应用
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex max-h-[68vh] flex-col gap-5 overflow-y-auto pr-1">
        <section className="flex flex-col gap-2">
          <span className="text-[11px] font-semibold text-fg-muted">预设</span>
          <div className="grid grid-cols-3 gap-2">
            {PRESETS.map((preset) => (
              <Button
                key={preset.label}
                variant="secondary"
                size="sm"
                onClick={() => applyPreset(preset.patch)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <Field label="风格">
            <NativeSelect
              value={draft.style}
              onChange={(event) =>
                patch({
                  style: event.target.value as PrevisWorldRef['style'],
                  styleParams: undefined
                })
              }
            >
              {PREVIS_WORLD_STYLES.map((style) => (
                <option key={style} value={style}>
                  {style}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="布局">
            <NativeSelect
              value={draft.layout}
              onChange={(event) =>
                patch({
                  layout: event.target.value as PrevisWorldRef['layout']
                })
              }
            >
              {PREVIS_WORLD_LAYOUTS.map((layout) => (
                <option key={layout} value={layout}>
                  {layout}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="密度">
            <NativeSelect
              value={draft.density}
              onChange={(event) =>
                patch({
                  density: event.target.value as PrevisWorldRef['density']
                })
              }
            >
              {PREVIS_WORLD_DENSITIES.map((density) => (
                <option key={density} value={density}>
                  {density}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="时段">
            <NativeSelect
              value={draft.timeOfDay ?? 'day'}
              onChange={(event) =>
                patch({
                  timeOfDay: event.target
                    .value as PrevisWorldRef['timeOfDay']
                })
              }
            >
              {PREVIS_WORLD_TIMES.map((time) => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="天气">
            <NativeSelect
              value={draft.weather ?? 'clear'}
              onChange={(event) => {
                const weather = event.target.value
                patch({
                  ...(weather === 'clear'
                    ? { weather: undefined }
                    : { weather: weather as 'rain' | 'snow' })
                })
              }}
            >
              <option value="clear">clear</option>
              {PREVIS_WORLD_WEATHERS.map((weather) => (
                <option key={weather} value={weather}>
                  {weather}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="主题">
            <NativeSelect
              value={draft.theme ?? 'none'}
              onChange={(event) => {
                const theme = event.target.value
                patch({
                  ...(theme === 'none'
                    ? { theme: undefined }
                    : { theme: theme as PrevisWorldRef['theme'] })
                })
              }}
            >
              <option value="none">none</option>
              {PREVIS_WORLD_THEMES.map((theme) => (
                <option key={theme} value={theme}>
                  {theme}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <Field label="随机种子">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={draft.seed}
                onChange={(event) =>
                  patch({ seed: Number(event.target.value) || 0 })
                }
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => patch({ seed: randomSeed() })}
              >
                随机
              </Button>
            </div>
          </Field>
          <Field label="范围（米）">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={60}
                max={200}
                value={draft.extentM[0]}
                onChange={(event) =>
                  patch({
                    extentM: [
                      Math.min(200, Math.max(60, Number(event.target.value) || 60)),
                      draft.extentM[1]
                    ]
                  })
                }
              />
              <Input
                type="number"
                min={60}
                max={200}
                value={draft.extentM[1]}
                onChange={(event) =>
                  patch({
                    extentM: [
                      draft.extentM[0],
                      Math.min(200, Math.max(60, Number(event.target.value) || 60))
                    ]
                  })
                }
              />
            </div>
          </Field>
          <Field label="建筑间距（0–0.5）">
            <Input
              type="number"
              min={0}
              max={0.5}
              step={0.05}
              value={draft.spacing ?? 0}
              onChange={(event) => {
                const value = Number(event.target.value)
                patch({ spacing: value > 0 ? value : undefined })
              }}
            />
          </Field>
          <Field label="坡道（0–0.2）">
            <Input
              type="number"
              min={0}
              max={0.2}
              step={0.01}
              value={draft.slope ?? 0}
              onChange={(event) => {
                const value = Number(event.target.value)
                patch({ slope: value > 0 ? value : undefined })
              }}
            />
          </Field>
        </section>

        <section className="flex flex-col gap-2">
          <span className="text-[11px] font-semibold text-fg-muted">水面</span>
          <NativeSelect
            value={draft.water?.kind ?? 'none'}
            onChange={(event) => {
              const kind = event.target.value
              patch({
                ...(kind === 'none'
                  ? { water: undefined }
                  : {
                      water: {
                        ...(draft.water ?? {}),
                        kind: kind as NonNullable<
                          PrevisWorldRef['water']
                        >['kind']
                      }
                    })
              })
            }}
          >
            <option value="none">无</option>
            {PREVIS_WORLD_WATER_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </NativeSelect>
        </section>

        <section className="flex items-center justify-between gap-4">
          <span className="text-[11px] font-semibold text-fg-muted">霓虹</span>
          <Switch
            checked={draft.neon === true}
            onChange={(checked) =>
              patch({ neon: checked ? true : undefined })
            }
            label="霓虹"
          />
        </section>
        <section className="flex items-center justify-between gap-4">
          <span className="text-[11px] font-semibold text-fg-muted">起伏地形</span>
          <Switch
            checked={draft.hills === true}
            onChange={(checked) =>
              patch({ hills: checked ? true : undefined })
            }
            label="起伏地形"
          />
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-fg-muted">
              地标（最多 {PREVIS_WORLD_MAX_LANDMARKS} 个）
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={
                (draft.landmarks?.length ?? 0) >= PREVIS_WORLD_MAX_LANDMARKS
              }
              onClick={() =>
                patch({
                  landmarks: [
                    ...(draft.landmarks ?? []),
                    { kind: 'pagoda', spot: 'far_north' }
                  ]
                })
              }
            >
              添加
            </Button>
          </div>
          {(draft.landmarks?.length ?? 0) === 0 ? (
            <span className="text-[11px] text-fg-subtle">还没有地标</span>
          ) : (
            <div className="flex flex-col gap-2">
              {draft.landmarks?.map((landmark, index) => (
                <div key={`${landmark.kind}-${index}`} className="flex items-center gap-2">
                  <NativeSelect
                    value={landmark.kind}
                    onChange={(event) =>
                      patch({
                        landmarks: (draft.landmarks ?? []).map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                kind: event.target
                                  .value as PrevisWorldLandmarkKind
                              }
                            : item
                        )
                      })
                    }
                  >
                    {PREVIS_WORLD_LANDMARK_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {kind}
                      </option>
                    ))}
                  </NativeSelect>
                  <NativeSelect
                    value={landmark.spot}
                    onChange={(event) =>
                      patch({
                        landmarks: (draft.landmarks ?? []).map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                spot: event.target
                                  .value as PrevisWorldLandmarkSpot
                              }
                            : item
                        )
                      })
                    }
                  >
                    {PREVIS_WORLD_LANDMARK_SPOTS.map((spot) => (
                      <option key={spot} value={spot}>
                        {spot}
                      </option>
                    ))}
                  </NativeSelect>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      patch({
                        landmarks: (draft.landmarks ?? []).filter(
                          (_, itemIndex) => itemIndex !== index
                        )
                      })
                    }
                  >
                    删除
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </Dialog>
  )
}
