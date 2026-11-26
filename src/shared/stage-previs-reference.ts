import type { DirectorStageDoc } from './stage-schema'

/** 白模预演回画布后，正式生成时用于锁定构图的结构参考提示词。 */
export const STAGE_PREVIS_REFERENCE_PROMPT =
  '保持人物位置、镜头运动方向、起始构图不变；参考这张图的角色与场景风格。'

function facingFromYaw(yaw: number): string {
  const normalized = Math.atan2(Math.sin(yaw), Math.cos(yaw))
  if (Math.abs(normalized) < Math.PI / 4) return 'toward_camera'
  if (Math.abs(normalized) > (3 * Math.PI) / 4) return 'away'
  return normalized > 0 ? 'left' : 'right'
}

/** 导出预演时一并落盘的结构化约束，随视频节点保留，供后续生成消费。 */
export function buildStageStructureJson(doc: DirectorStageDoc): string {
  const shotOrder = new Map<string, number>()
  ;(doc.program?.entries ?? []).forEach((entry, index) => {
    if (!shotOrder.has(entry.shotId)) shotOrder.set(entry.shotId, index + 1)
  })

  return JSON.stringify(
    {
      version: 1,
      background: doc.background,
      cameras: doc.cameras.map((camera) => ({
        id: camera.id,
        name: camera.name,
        position: camera.position,
        target: camera.target,
        fov: camera.fov
      })),
      objects: doc.objects.map((object) => ({
        id: object.id,
        name: object.name,
        type: object.type,
        parentId: object.parentId ?? null,
        position: object.transform.position,
        rotation: object.transform.rotation,
        scale: object.transform.scale,
        facing: facingFromYaw(object.transform.rotation[1]),
        visible: object.visible !== false
      })),
      shots: doc.shots.map((shot) => ({
        id: shot.id,
        order: shotOrder.get(shot.id) ?? null,
        durationMs: shot.durationMs,
        cameraId: shot.cameraId,
        caption: shot.caption ?? null,
        source: shot.source ?? null,
        intent: shot.intent ?? null,
        cameraTrack: (shot.cameraTrack ?? []).map((key) => ({
          timeMs: key.timeMs,
          position: key.position,
          target: key.target,
          fov: key.fov
        })),
        actionTracks: (shot.actionTracks ?? []).map((track) => ({
          objectId: track.objectId,
          keys: track.keys
        }))
      }))
    },
    null,
    2
  )
}
