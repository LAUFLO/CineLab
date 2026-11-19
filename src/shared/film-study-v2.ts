import type { AssetScope } from './asset-schema'

/**
 * 逐帧拉片 v2 数据模型。
 *
 * 与 v1 的区别：
 * - 镜头是核心单元（shots），段落（segments）不再承担分镜职责
 * - 场次（scenes）由 VLM 分场得到，按镜号范围表示
 * - 角色（cast）、场景（scenes）、风格（style）、音频（audio）独立聚合
 * - 复刻映射（mapping）记录原片角色/场景到用户资产的替换关系
 *
 * v2 不兼容 v1，旧 study 不读取、不迁移。
 */
export const FILM_STUDY_V2_SCHEMA = 2

export interface FilmStudyFrame {
  index: number
  time: number
  /** 相对项目根的图片路径 */
  file: string
  note?: string
}

export interface FilmStudyShot {
  /** 从 1 开始，连续递增 */
  index: number
  startTime: number
  endTime: number
  duration: number
  sceneId?: string
  /** 相对项目根 */
  firstFrame: string
  midFrame?: string
  /** 相对项目根 */
  lastFrame: string
  /** 可选动态切片，相对项目根 */
  clip?: string
  shotSize?: string
  cameraAngle?: string
  cameraMove?: string
  lighting?: string
  visualDescription?: string
  actionSummary?: string
  emotion?: string
  dialogue?: Array<{ speaker?: string; text: string; startTime?: number }>
  sfx?: Array<{ time: number; type: string; event?: string }>
  production?: {
    label: string
    confidence: number
    evidence: string[]
    material?: 'real' | 'ai' | 'rendered' | 'unknown'
  }
  castIds?: string[]
  imagePrompt?: string
  videoPrompt?: string
  status?: 'pending' | 'generated' | 'edited'
}

export interface FilmStudyScene {
  /** S1, S2 … */
  id: string
  name: string
  location?: string
  daypart?: string
  lighting?: string
  palette?: string
  /** [起始镜号, 结束镜号]，闭区间 */
  shots: [number, number]
  basePath?: string
}

export interface FilmStudyCast {
  id: string
  name: string
  role?: string
  importance: 'lead' | 'supporting' | 'extra'
  appearance?: string
  /** 抽帧裁脸，相对项目根 */
  facePath?: string
  /** 抽帧造型，相对项目根 */
  lookPaths?: string[]
  /** 原片人声切片，相对项目根 */
  voicePath?: string
  shotIndexes: number[]
  /** 可选的生成设定图，相对项目根 */
  generatedRefPath?: string
}

export interface FilmStudyStyle {
  look?: string
  palette?: string
  composition?: string
  camera?: string
  pacing?: string
  prompt?: string
}

export interface FilmStudyAudio {
  bgmPath?: string
  bgm?: { bpm?: number; key?: string; source?: string }
  voicePaths?: Record<string, string>
  sfx?: Array<{ time: number; type: string; event?: string }>
}

export interface FilmStudyMappingTarget {
  kind: 'original' | 'node' | 'asset'
  path?: string
  nodeId?: string
  /** 替换后的显示名，用于提示词替换 */
  name?: string
}

export interface FilmStudyMapping {
  cast: Record<string, FilmStudyMappingTarget>
  scenes: Record<string, FilmStudyMappingTarget>
}

export interface FilmStudyV2 {
  schemaVersion: 2
  id: string
  sourceNodeId: string
  sourcePath: string
  sourceScope?: AssetScope
  sourceName: string
  duration: number
  fps: number
  frameInterval: number
  frames: FilmStudyFrame[]
  shots: FilmStudyShot[]
  scenes: FilmStudyScene[]
  cast: FilmStudyCast[]
  style?: FilmStudyStyle
  audio?: FilmStudyAudio
  mapping?: FilmStudyMapping
  createdAt: string
  updatedAt: string
}

export interface FilmStudyV2Input {
  id: string
  sourceNodeId: string
  sourcePath: string
  sourceScope?: AssetScope
  sourceName: string
  duration: number
  fps: number
  frameInterval: number
  frames?: FilmStudyFrame[]
  shots?: FilmStudyShot[]
  scenes?: FilmStudyScene[]
  cast?: FilmStudyCast[]
  style?: FilmStudyStyle
  audio?: FilmStudyAudio
  mapping?: FilmStudyMapping
  createdAt?: string
  updatedAt?: string
}

function fail(path: string, message: string): never {
  throw new Error(`拉片数据 v2 校验失败：${path} ${message}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function checkFramePath(value: unknown, path: string): string {
  if (!isNonEmptyString(value)) fail(path, '必须是非空路径')
  return value
}

function checkShot(
  value: unknown,
  index: number,
  duration: number
): FilmStudyShot {
  const path = `shots[${index}]`
  if (!isRecord(value)) fail(path, '必须是对象')

  const shotIndex = value.index
  if (!Number.isInteger(shotIndex) || (shotIndex as number) < 1) {
    fail(`${path}.index`, '必须是从 1 开始的整数')
  }
  if (shotIndex !== index + 1) {
    fail(`${path}.index`, `应为 ${index + 1}，实际为 ${String(shotIndex)}`)
  }

  if (!isFiniteNumber(value.startTime)) fail(`${path}.startTime`, '必须是数字')
  if (!isFiniteNumber(value.endTime)) fail(`${path}.endTime`, '必须是数字')
  if (value.startTime < 0) fail(`${path}.startTime`, '不能小于 0')
  if (value.endTime <= value.startTime) {
    fail(`${path}.endTime`, '必须大于 startTime')
  }
  if (value.endTime > duration + 0.001) {
    fail(`${path}.endTime`, `不能超过片长 ${duration}`)
  }

  if (isFiniteNumber(value.duration)) {
    const expected = value.endTime - value.startTime
    if (Math.abs(value.duration - expected) > 0.01) {
      fail(`${path}.duration`, `应等于 ${expected.toFixed(3)}`)
    }
  }

  checkFramePath(value.firstFrame, `${path}.firstFrame`)
  checkFramePath(value.lastFrame, `${path}.lastFrame`)
  if (value.midFrame !== undefined) {
    checkFramePath(value.midFrame, `${path}.midFrame`)
  }

  return value as unknown as FilmStudyShot
}

function checkScene(
  value: unknown,
  index: number,
  shotCount: number
): FilmStudyScene {
  const path = `scenes[${index}]`
  if (!isRecord(value)) fail(path, '必须是对象')
  if (!isNonEmptyString(value.id)) fail(`${path}.id`, '必须是非空字符串')

  const range = value.shots
  if (!Array.isArray(range) || range.length !== 2) {
    fail(`${path}.shots`, '必须是 [起始镜号, 结束镜号]')
  }
  const [start, end] = range
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    fail(`${path}.shots`, '镜号必须是整数')
  }
  if (start < 1 || start > shotCount) {
    fail(`${path}.shots[0]`, `必须在 1–${shotCount}`)
  }
  if (end < start || end > shotCount) {
    fail(`${path}.shots[1]`, `必须在 ${start}–${shotCount}`)
  }

  return value as unknown as FilmStudyScene
}

function checkCast(
  value: unknown,
  index: number,
  shotCount: number
): FilmStudyCast {
  const path = `cast[${index}]`
  if (!isRecord(value)) fail(path, '必须是对象')
  if (!isNonEmptyString(value.id)) fail(`${path}.id`, '必须是非空字符串')
  if (!Array.isArray(value.shotIndexes)) {
    fail(`${path}.shotIndexes`, '必须是数组')
  }
  for (const [i, shotIndex] of value.shotIndexes.entries()) {
    if (!Number.isInteger(shotIndex) || shotIndex < 1 || shotIndex > shotCount) {
      fail(`${path}.shotIndexes[${i}]`, `必须在 1–${shotCount}`)
    }
  }
  return value as unknown as FilmStudyCast
}

/** 结构判断，不抛错；用于读取旧数据时快速分流。 */
export function isFilmStudyV2(value: unknown): value is FilmStudyV2 {
  return (
    isRecord(value) &&
    value.schemaVersion === FILM_STUDY_V2_SCHEMA &&
    Array.isArray(value.shots)
  )
}

/**
 * 校验并返回 v2 数据。
 * 只校验结构和时间范围，不校验业务完整性（角色是否合并、提示词是否为空由 lint 负责）。
 */
export function parseFilmStudyV2(value: unknown): FilmStudyV2 {
  if (!isRecord(value)) throw new Error('拉片数据 v2 校验失败：根节点必须是对象')
  if (value.schemaVersion !== FILM_STUDY_V2_SCHEMA) {
    throw new Error(
      `拉片数据 v2 校验失败：schemaVersion 必须是 ${FILM_STUDY_V2_SCHEMA}`
    )
  }
  if (!isNonEmptyString(value.id)) fail('id', '必须是非空字符串')
  if (!isNonEmptyString(value.sourcePath)) {
    fail('sourcePath', '必须是非空字符串')
  }
  if (!isNonEmptyString(value.sourceName)) {
    fail('sourceName', '必须是非空字符串')
  }
  if (!isFiniteNumber(value.duration) || value.duration <= 0) {
    fail('duration', '必须是正数')
  }
  if (!isFiniteNumber(value.fps) || value.fps <= 0) fail('fps', '必须是正数')
  if (!isFiniteNumber(value.frameInterval) || value.frameInterval <= 0) {
    fail('frameInterval', '必须是正数')
  }
  if (!Array.isArray(value.frames)) fail('frames', '必须是数组')
  if (!Array.isArray(value.shots) || value.shots.length === 0) {
    fail('shots', '至少有一个镜头')
  }
  if (!Array.isArray(value.scenes)) fail('scenes', '必须是数组')
  if (!Array.isArray(value.cast)) fail('cast', '必须是数组')

  const shots = value.shots.map((shot, index) =>
    checkShot(shot, index, value.duration as number)
  )
  const shotCount = shots.length

  const scenes = value.scenes.map((scene, index) =>
    checkScene(scene, index, shotCount)
  )
  const ordered = [...scenes].sort((a, b) => a.shots[0] - b.shots[0])
  for (let i = 1; i < ordered.length; i += 1) {
    if (ordered[i].shots[0] <= ordered[i - 1].shots[1]) {
      fail(
        `scenes[${i}]`,
        `与前一场重叠（${ordered[i - 1].shots[0]}–${ordered[i - 1].shots[1]} 与 ${ordered[i].shots[0]}–${ordered[i].shots[1]}）`
      )
    }
  }

  value.cast.forEach((item, index) => checkCast(item, index, shotCount))

  return value as unknown as FilmStudyV2
}

export function emptyFilmStudyV2(input: FilmStudyV2Input): FilmStudyV2 {
  const now = new Date().toISOString()
  return {
    schemaVersion: FILM_STUDY_V2_SCHEMA,
    id: input.id,
    sourceNodeId: input.sourceNodeId,
    sourcePath: input.sourcePath,
    ...(input.sourceScope ? { sourceScope: input.sourceScope } : {}),
    sourceName: input.sourceName,
    duration: input.duration,
    fps: input.fps,
    frameInterval: input.frameInterval,
    frames: input.frames ?? [],
    shots: input.shots ?? [],
    scenes: input.scenes ?? [],
    cast: input.cast ?? [],
    ...(input.style ? { style: input.style } : {}),
    ...(input.audio ? { audio: input.audio } : {}),
    ...(input.mapping ? { mapping: input.mapping } : {}),
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now
  }
}

/**
 * 把 VLM 分场结果修成有序、无重叠、无缺口的范围。
 * 对齐 rea-toon 的 _fix_scenes：
 * - 第一个场景从 1 开始
 * - 中间缺口并入前一场
 * - 最后一个场景延伸到片尾
 * - 非法范围丢弃
 * - 为空时返回一个覆盖全片的场景
 * 重新编号 S1…Sn。
 */
export function sortScenes(
  scenes: FilmStudyScene[],
  shotCount: number
): FilmStudyScene[] {
  if (shotCount < 1) return []

  const valid = scenes
    .filter((scene) => {
      const range = scene.shots
      return (
        Array.isArray(range) &&
        range.length === 2 &&
        Number.isInteger(range[0]) &&
        Number.isInteger(range[1]) &&
        range[0] >= 1 &&
        range[1] <= shotCount &&
        range[0] <= range[1]
      )
    })
    .sort((a, b) => a.shots[0] - b.shots[0])

  if (valid.length === 0) {
    return [
      {
        id: 'S1',
        name: '全片',
        shots: [1, shotCount]
      }
    ]
  }

  const out: FilmStudyScene[] = []
  let next = 1

  for (const scene of valid) {
    let start = Math.max(scene.shots[0], next)
    let end = Math.min(scene.shots[1], shotCount)
    if (end < start) continue

    if (start > next && out.length > 0) {
      out[out.length - 1].shots[1] = start - 1
    } else if (start > next) {
      start = 1
    }

    out.push({ ...scene, shots: [start, end] })
    next = end + 1
    if (next > shotCount) break
  }

  if (out.length === 0) {
    return [
      {
        id: 'S1',
        name: '全片',
        shots: [1, shotCount]
      }
    ]
  }

  out[out.length - 1].shots[1] = shotCount
  return out.map((scene, index) => ({ ...scene, id: `S${index + 1}` }))
}
