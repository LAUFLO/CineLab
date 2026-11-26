import type {
  DirectorStageDoc,
  StageLightingOverride
} from './stage-schema'


export type StageTimeOfDay = 'day' | 'dusk' | 'night'

export interface StageLighting {
  background: string
  ambient: { color: string; intensity: number }
  hemi: { sky: string; ground: string; intensity: number }
  sun: {
    color: string
    intensity: number
    position: [number, number, number]
  }
  fill?: {
    color: string
    intensity: number
    position: [number, number, number]
  }
  fog?: { color: string; near: number; far: number }
  exposure: number
  weather?: 'rain' | 'snow'
}

export interface StageLightingPreset {
  id: string
  name: string
  lighting: StageLightingOverride
  timeOfDay?: StageTimeOfDay
  weather?: 'rain' | 'snow'
  note: string
}

const TIME_LOOK: Record<StageTimeOfDay, StageLighting> = {
  day: {
    background: '#f5f7fa',
    ambient: { color: '#ffffff', intensity: 0.75 },
    hemi: { sky: '#ffffff', ground: '#9aa4b2', intensity: 0.55 },
    sun: { color: '#fff4e0', intensity: 2.1, position: [6, 10, 4] },
    exposure: 1.1
  },
  dusk: {
    background: '#f3c9a4',
    ambient: { color: '#ffd6b0', intensity: 0.7 },
    hemi: { sky: '#ffb37a', ground: '#4b3a30', intensity: 0.5 },
    sun: { color: '#ff9a5a', intensity: 2, position: [-6, 4, 3] },
    exposure: 1.15
  },
  night: {
    background: '#151b2b',
    ambient: { color: '#7f93c9', intensity: 0.55 },
    hemi: { sky: '#2a3550', ground: '#0b0e16', intensity: 0.45 },
    sun: { color: '#a9bdf0', intensity: 0.9, position: [-4, 8, -3] },
    exposure: 1.3
  }
}

function cloneLighting(value: StageLighting): StageLighting {
  return {
    ...value,
    ambient: { ...value.ambient },
    hemi: { ...value.hemi },
    sun: { ...value.sun, position: [...value.sun.position] },
    ...(value.fill
      ? { fill: { ...value.fill, position: [...value.fill.position] } }
      : {}),
    ...(value.fog ? { fog: { ...value.fog } } : {})
  }
}

function mergeLighting(
  base: StageLighting,
  override: StageLightingOverride | undefined
): StageLighting {
  if (!override) return base
  return {
    ...base,
    ...(override.weather ? { weather: override.weather } : base.weather ? { weather: base.weather } : {}),
    ...(override.background ? { background: override.background } : {}),
    ...(override.exposure !== undefined ? { exposure: override.exposure } : {}),
    ambient: { ...base.ambient, ...(override.ambient ?? {}) },
    hemi: { ...base.hemi, ...(override.hemi ?? {}) },
    sun: {
      ...base.sun,
      ...(override.sun ?? {}),
      position: override.sun?.position
        ? ([...override.sun.position] as [number, number, number])
        : base.sun.position
    },
    ...(override.fill
      ? {
          fill: {
            color: override.fill.color ?? base.fill?.color ?? '#ffffff',
            intensity:
              override.fill.intensity ?? base.fill?.intensity ?? 0.4,
            position: override.fill.position
              ? ([...override.fill.position] as [number, number, number])
              : (base.fill?.position ?? [3, 3, 3])
          }
        }
      : base.fill
        ? { fill: base.fill }
        : {}),
    ...(override.fog
      ? {
          fog: {
            color: override.fog.color ?? base.fog?.color ?? '#b7cddd',
            near: override.fog.near ?? base.fog?.near ?? 20,
            far: override.fog.far ?? base.fog?.far ?? 120
          }
        }
      : base.fog
        ? { fog: base.fog }
        : {})
  }
}

export function resolveStageLighting(
  doc: Pick<DirectorStageDoc, 'lighting'> | null | undefined
): StageLighting {
  return mergeLighting(cloneLighting(TIME_LOOK.day), doc?.lighting)
}

export const STAGE_LIGHTING_PRESETS: StageLightingPreset[] = [
  {
    id: 'day',
    name: '日戏',
    timeOfDay: 'day',
    lighting: {},
    note: '上午中性白光，环境补光'
  },
  {
    id: 'noon',
    name: '正午',
    timeOfDay: 'day',
    lighting: { sun: { intensity: 2.8 }, exposure: 1.2 },
    note: '正午硬光，高对比'
  },
  {
    id: 'dusk',
    name: '黄昏',
    timeOfDay: 'dusk',
    lighting: {},
    note: '18:10 夕阳暖光'
  },
  {
    id: 'night',
    name: '夜戏',
    timeOfDay: 'night',
    lighting: {},
    note: '冷蓝月光，暗而看得清'
  },
  {
    id: 'overcast',
    name: '阴天',
    timeOfDay: 'day',
    lighting: {
      ambient: { intensity: 0.95 },
      hemi: { intensity: 0.75 },
      sun: { intensity: 0.8 }
    },
    note: '柔光、低对比、灰调'
  },
  {
    id: 'rain',
    name: '雨天',
    timeOfDay: 'day',
    weather: 'rain',
    lighting: {
      exposure: 1.15,
      ambient: { color: '#b9c9e0' },
      hemi: { sky: '#9fb4d0' }
    },
    note: '雨线粒子、冷调、低照度'
  },
  {
    id: 'snow',
    name: '雪天',
    timeOfDay: 'day',
    weather: 'snow',
    lighting: {
      exposure: 1.2,
      ambient: { color: '#e8f0ff' },
      hemi: { sky: '#e6efff' }
    },
    note: '雪花粒子、冷白、低饱和'
  },
  {
    id: 'interior-warm',
    name: '室内暖光',
    timeOfDay: 'day',
    lighting: {
      ambient: { color: '#ffd9b0', intensity: 1 },
      sun: { intensity: 0.4 },
      fill: { color: '#ff9a5a', intensity: 0.6, position: [3, 3, -2] },
      exposure: 1.15
    },
    note: '钨丝灯色温，暖黄'
  },
  {
    id: 'interior-cool',
    name: '室内冷光',
    timeOfDay: 'day',
    lighting: {
      ambient: { color: '#cfe4ff', intensity: 0.95 },
      sun: { intensity: 0.3 },
      fill: { color: '#7fb0ff', intensity: 0.55, position: [-3, 3, -2] },
      exposure: 1.1
    },
    note: '日光灯色温，青白'
  },
  {
    id: 'neon',
    name: '霓虹夜景',
    timeOfDay: 'night',
    lighting: {
      ambient: { color: '#5a6cff', intensity: 0.7 },
      fill: { color: '#ff4fa3', intensity: 0.85, position: [3, 2, -2] },
      exposure: 1.4
    },
    note: '洋红/青双色，高饱和'
  }
]

export function applyLightingPreset(
  doc: Pick<DirectorStageDoc, 'lighting'>,
  presetId: string
): Pick<DirectorStageDoc, 'lighting'> {
  const preset = STAGE_LIGHTING_PRESETS.find((item) => item.id === presetId)
  if (!preset) return { lighting: doc.lighting }
  const base = cloneLighting(TIME_LOOK[preset.timeOfDay ?? 'day'])
  return {
    lighting: mergeLighting(base, {
      ...preset.lighting,
      ...(preset.weather ? { weather: preset.weather } : {})
    })
  }
}
