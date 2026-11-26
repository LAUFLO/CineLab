import type { DirectorStageDoc, StageVec3 } from './stage-schema'

/** 注入每轮系统提示的精简场景快照上限（约 2–3k token）。 */
export const STAGE_SNAPSHOT_MAX_CHARS = 4000

interface SnapshotObject {
  id: string
  name: string
  type: string
  position: StageVec3
  rotation: StageVec3
  scale: StageVec3
}

/** 生成精简快照：详细数据仍由 stage_get 按需读取。 */
export function buildStageSnapshot(
  doc: DirectorStageDoc | null | undefined,
  maxChars = STAGE_SNAPSHOT_MAX_CHARS
): string {
  if (!doc) return ''

  const data: {
    background: string
    objects: SnapshotObject[]
    cameras: Array<{ id: string; name: string }>
    shots: Array<{ id: string; name: string | null; keyframes: number }>
    truncated: boolean
  } = {
    background: doc.background.kind,
    objects: doc.objects.slice(0, 100).map((object) => ({
      id: object.id,
      name: object.name,
      type: object.type,
      position: object.transform.position,
      rotation: object.transform.rotation,
      scale: object.transform.scale
    })),
    cameras: doc.cameras.slice(0, 24).map((camera) => ({
      id: camera.id,
      name: camera.name
    })),
    shots: doc.shots.slice(0, 100).map((shot) => ({
      id: shot.id,
      name: shot.name ?? null,
      keyframes: shot.cameraTrack?.length ?? 0
    })),
    truncated:
      doc.objects.length > 100 ||
      doc.cameras.length > 24 ||
      doc.shots.length > 100
  }

  let text = JSON.stringify(data)
  if (text.length > maxChars) {
    let limit = 24
    while (limit > 0) {
      data.objects = data.objects.slice(0, limit)
      data.shots = data.shots.slice(0, limit)
      const candidate = JSON.stringify(data)
      if (candidate.length <= maxChars) {
        text = candidate
        break
      }
      limit = Math.floor(limit / 2)
    }
    data.truncated = true
    text = JSON.stringify(data)
    if (text.length > maxChars) {
      text = JSON.stringify({
        background: data.background,
        truncated: true
      }).slice(0, maxChars)
    }
  }
  return text
}
