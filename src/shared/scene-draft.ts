import type { StageShotFraming } from './stage-schema'

export type SceneSetKind = 'indoor' | 'outdoor'
export type SceneSizeClass = 'small' | 'medium' | 'large'
export type SceneDepthLayer = 'near' | 'mid' | 'far'
export type SceneFacing = 'toward_camera' | 'away' | 'left' | 'right'
export type SceneHeightHint = 'floor' | 'eye' | 'high'
export type ScenePitchHint = 'up' | 'level' | 'down'

export interface SceneDraftObject {
  label: string
  sizeClass: SceneSizeClass
  /** 0 = 画面最左，1 = 画面最右 */
  relativeX: number
  depthLayer: SceneDepthLayer
  facing?: SceneFacing
}

export interface SceneDraftRoom {
  type: string
  widthM: number
  depthM: number
  heightM: number
}

export interface SceneDraftCamera {
  heightHint?: SceneHeightHint
  pitchHint?: ScenePitchHint
  fovHintDeg?: number
  horizonY?: number
}

export interface SceneDraft {
  set: { kind: SceneSetKind; description: string }
  room: SceneDraftRoom | null
  objects: SceneDraftObject[]
  camera: SceneDraftCamera
}

export const SCENE_MAX_OBJECTS = 32

const SIZE_CLASSES: SceneSizeClass[] = ['small', 'medium', 'large']
const DEPTH_LAYERS: SceneDepthLayer[] = ['near', 'mid', 'far']
const FACINGS: SceneFacing[] = ['toward_camera', 'away', 'left', 'right']
const HEIGHT_HINTS: SceneHeightHint[] = ['floor', 'eye', 'high']
const PITCH_HINTS: ScenePitchHint[] = ['up', 'level', 'down']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function pick<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T
): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

export function parseSceneDraft(raw: unknown): SceneDraft {
  if (!isRecord(raw)) throw new Error('场景草稿必须是对象')
  const set = isRecord(raw.set) ? raw.set : {}
  const kind = set.kind === 'indoor' ? 'indoor' : 'outdoor'
  const description =
    typeof set.description === 'string' ? set.description.slice(0, 300) : ''

  const roomRaw = isRecord(raw.room) ? raw.room : null
  const room = roomRaw
    ? {
        type:
          typeof roomRaw.type === 'string'
            ? roomRaw.type.slice(0, 60)
            : 'room',
        widthM: clamp(finite(roomRaw.widthM) ?? 5, 1, 40),
        depthM: clamp(finite(roomRaw.depthM) ?? 4, 1, 40),
        heightM: clamp(finite(roomRaw.heightM) ?? 2.8, 2, 8)
      }
    : null

  const objectsRaw = Array.isArray(raw.objects) ? raw.objects : []
  const objects: SceneDraftObject[] = []
  for (const item of objectsRaw) {
    if (objects.length >= SCENE_MAX_OBJECTS) break
    if (!isRecord(item)) continue
    const label =
      typeof item.label === 'string' ? item.label.trim().slice(0, 80) : ''
    if (!label) continue
    objects.push({
      label,
      sizeClass: pick(item.sizeClass, SIZE_CLASSES, 'medium'),
      relativeX: clamp(finite(item.relativeX) ?? 0.5, 0, 1),
      depthLayer: pick(item.depthLayer, DEPTH_LAYERS, 'mid'),
      ...(FACINGS.includes(item.facing as SceneFacing)
        ? { facing: item.facing as SceneFacing }
        : {})
    })
  }

  const cameraRaw = isRecord(raw.camera) ? raw.camera : {}
  const camera: SceneDraftCamera = {
    heightHint: pick(cameraRaw.heightHint, HEIGHT_HINTS, 'eye'),
    pitchHint: pick(cameraRaw.pitchHint, PITCH_HINTS, 'level'),
    ...(finite(cameraRaw.fovHintDeg) !== null
      ? { fovHintDeg: clamp(finite(cameraRaw.fovHintDeg)!, 20, 90) }
      : {}),
    ...(finite(cameraRaw.horizonY) !== null
      ? { horizonY: clamp(finite(cameraRaw.horizonY)!, 0, 1) }
      : {})
  }

  return {
    set: { kind, description },
    room,
    objects,
    camera
  }
}
