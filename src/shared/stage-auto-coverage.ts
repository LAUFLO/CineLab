import type {
  DirectorStageDoc,
  StageAspect,
  StageCamera,
  StageShot,
  StageShotIntentKey
} from './stage-schema'
import { solveStageShotIntent } from './stage-shot-intent'

export type AutoCoverageMode = 'auto' | 'single' | 'dialogue' | 'group'

export interface AutoCoverageOptions {
  subjectIds: string[]
  mode?: AutoCoverageMode
  /** 0.6 快 / 1 标准 / 1.6 舒缓 */
  pace?: number
  maxShots?: number
  /** 覆盖已有 source='auto' 的镜头；默认 true */
  replace?: boolean
}

export interface AutoCoveragePlan {
  cameras: StageCamera[]
  shots: StageShot[]
  notes: string[]
}

const BASE_SECONDS = 4
const MIN_SECONDS = 2
const MAX_SECONDS = 8
const MAX_GROUP = 8
const MAX_SHOTS = 12

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
}

function aspectOf(doc: DirectorStageDoc): StageAspect {
  return doc.shots[0]?.aspect ?? '16:9'
}

function key(
  subjectIds: string[],
  framing: StageShotIntentKey['framing'],
  relation: StageShotIntentKey['relation'],
  distance: StageShotIntentKey['distance'],
  height: StageShotIntentKey['height'],
  aim: StageShotIntentKey['aim'],
  extra: Partial<StageShotIntentKey> = {}
): StageShotIntentKey {
  return {
    timeMs: 0,
    subjectIds,
    framing,
    relation,
    distance,
    height,
    aim,
    ...extra
  }
}

function specsFor(
  subjectIds: string[],
  mode: AutoCoverageMode
): Array<{ name: string; key: StageShotIntentKey }> {
  if (mode === 'single' || (mode === 'auto' && subjectIds.length === 1)) {
    const [a] = subjectIds
    return [
      {
        name: '全景',
        key: key([a!], 'single', 'front', 'far', 'eye', 'body')
      },
      {
        name: '中景',
        key: key([a!], 'single', 'front_side', 'medium', 'eye', 'body', {
          side: 'left'
        })
      },
      {
        name: '近景',
        key: key([a!], 'single', 'front_side', 'close', 'eye', 'face', {
          side: 'right'
        })
      }
    ]
  }

  if (mode === 'dialogue' || (mode === 'auto' && subjectIds.length === 2)) {
    const [a, b] = subjectIds
    return [
      {
        name: '双人全景',
        key: key([a!, b!], 'two_shot', 'front', 'far', 'eye', 'body')
      },
      {
        name: '过肩A',
        key: key([a!], 'single', 'over_shoulder', 'medium', 'eye', 'face', {
          towardId: b!,
          side: 'left'
        })
      },
      {
        name: '过肩B',
        key: key([b!], 'single', 'over_shoulder', 'medium', 'eye', 'face', {
          towardId: a!,
          side: 'right'
        })
      }
    ]
  }

  const group = subjectIds.slice(0, MAX_GROUP)
  return [
    {
      name: '群体全景',
      key: key(group, 'group', 'front', 'far', 'eye', 'body')
    },
    ...group.map((subjectId, index) => ({
      name: `近景${index + 1}`,
      key: key(
        [subjectId],
        'single' as const,
        'front_side' as const,
        'close' as const,
        'eye' as const,
        'face' as const,
        { side: index % 2 === 0 ? ('left' as const) : ('right' as const) }
      )
    }))
  ]
}

export function buildAutoCoverage(
  doc: DirectorStageDoc,
  options: AutoCoverageOptions
): AutoCoveragePlan {
  const notes: string[] = []
  const subjectIds = [
    ...new Set(
      options.subjectIds.filter((id) =>
        doc.objects.some((object) => object.id === id)
      )
    )
  ].slice(0, MAX_GROUP)

  if (subjectIds.length === 0) {
    return { cameras: [], shots: [], notes: ['没有找到可用的主体。'] }
  }

  const mode = options.mode ?? 'auto'
  const pace = clamp(
    Number.isFinite(options.pace) ? (options.pace as number) : 1,
    0.6,
    1.6
  )
  const maxShots = clamp(
    Math.round(options.maxShots ?? MAX_SHOTS),
    1,
    MAX_SHOTS
  )
  const durationMs = Math.round(
    clamp(BASE_SECONDS * pace, MIN_SECONDS, MAX_SECONDS) * 1000
  )
  const specs = specsFor(subjectIds, mode).slice(0, maxShots)
  const cameras: StageCamera[] = []
  const shots: StageShot[] = []
  let working: DirectorStageDoc = doc

  for (const spec of specs) {
    const camera: StageCamera = {
      id: createId('camera'),
      name: `自动分镜 · ${spec.name}`,
      position: [0, 2, 6],
      target: [0, 1, 0],
      fov: 50,
      source: 'auto'
    }
    cameras.push(camera)
    working = { ...working, cameras: [...working.cameras, camera] }

    const shot: StageShot = {
      id: createId('shot'),
      name: `自动分镜 · ${spec.name}`,
      cameraId: camera.id,
      durationMs,
      aspect: aspectOf(doc),
      intent: { version: 1, keys: [spec.key] },
      source: 'auto'
    }
    const solved = solveStageShotIntent(working, shot)
    notes.push(...solved.notes)
    shots.push({ ...shot, cameraTrack: solved.track })
  }

  notes.push(
    `生成 ${shots.length} 个自动分镜镜头（${mode === 'auto' ? '按主体数量' : mode}）。`
  )
  return { cameras, shots, notes: [...new Set(notes)] }
}
