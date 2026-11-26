import type { SceneAnalyzeResult } from './scene-analyze'
import type { SceneFacing, SceneSizeClass } from './scene-draft'
import {
  FALLBACK_OBJECT_PRESET,
  builtinObjectPresets,
  findObjectPreset
} from './scene-object-presets'
import type { StageCamera, StageObject, StageVec3 } from './stage-schema'

const SIZE_SCALE: Record<SceneSizeClass, number> = {
  small: 0.75,
  medium: 1,
  large: 1.35
}

/** 约定模型默认朝 -Z（面向相机），绕 Y 轴切换朝向。 */
const FACING_YAW: Record<SceneFacing, number> = {
  toward_camera: 0,
  away: Math.PI,
  left: Math.PI / 2,
  right: -Math.PI / 2
}

export interface StageDraftBuild {
  objects: StageObject[]
  camera: StageCamera
  warnings: string[]
}

/** 把解析草稿映射成可编辑的白模对象与机位（纯函数，便于单测）。 */
export function buildStageFromDraft(
  result: SceneAnalyzeResult,
  stamp = Date.now()
): StageDraftBuild {
  const presets = builtinObjectPresets()
  const width = 20
  const depth = 20
  const globalScale = result.calibration.scale
  const warnings: string[] = []

  const objects: StageObject[] = result.draft.objects.map((item, index) => {
    const preset =
      findObjectPreset(presets, item.label) ?? FALLBACK_OBJECT_PRESET
    const sizeScale = SIZE_SCALE[item.sizeClass] * globalScale
    const base: StageVec3 =
      preset.shape === 'human' || preset.shape === 'crowd'
        ? [1, preset.h / 2, 1]
        : [preset.w, preset.h, preset.d]
    const x = (item.relativeX - 0.5) * width * 0.8 * globalScale
    const z =
      item.depthLayer === 'near'
        ? -depth * 0.3 * globalScale
        : item.depthLayer === 'far'
          ? depth * 0.3 * globalScale
          : 0
    return {
      id: `object_${stamp}_${index}`,
      type: preset.shape,
      name: item.label,
      transform: {
        position: [x, 0, z],
        rotation: [0, item.facing ? FACING_YAW[item.facing] : 0, 0],
        scale: [
          base[0] * sizeScale,
          base[1] * sizeScale,
          base[2] * sizeScale
        ]
      },
      color: preset.color
    }
  })

  const room = result.draft.room
  const roomObjects: StageObject[] = []
  if (room) {
    const w = room.widthM * globalScale
    const d = room.depthM * globalScale
    const h = room.heightM * globalScale
    const t = 0.12 * globalScale
    const walls: Array<{
      name: string
      position: StageVec3
      scale: StageVec3
    }> = [
      { name: `${room.type} · 后墙`, position: [0, 0, d / 2], scale: [w, h, t] },
      { name: `${room.type} · 前墙`, position: [0, 0, -d / 2], scale: [w, h, t] },
      { name: `${room.type} · 左墙`, position: [-w / 2, 0, 0], scale: [t, h, d] },
      { name: `${room.type} · 右墙`, position: [w / 2, 0, 0], scale: [t, h, d] },
      { name: `${room.type} · 天花板`, position: [0, h, 0], scale: [w, t, d] }
    ]
    walls.forEach((wall, index) => {
      roomObjects.push({
        id: `object_${stamp}_room_${index}`,
        type: 'box',
        name: wall.name,
        transform: {
          position: wall.position,
          rotation: [0, 0, 0],
          scale: wall.scale
        },
        // 前墙默认隐藏，避免遮挡机位；用户可在 Inspector 打开
        ...(index === 1 ? { visible: false } : {}),
        color: '#d1d5db'
      })
    })
  }

  const distance = depth * 0.55
  const pitchRad = (result.calibration.camera.pitchDeg * Math.PI) / 180
  const targetY =
    result.calibration.camera.heightM + Math.tan(pitchRad) * distance
  const camera: StageCamera = {
    id: `camera_${stamp}`,
    name: '场景图机位',
    position: [0, result.calibration.camera.heightM, -distance],
    target: [0, targetY, 0],
    fov: result.calibration.camera.fovDeg
  }

  if (result.confidence === 'low') {
    warnings.push('场景解析置信度较低，建议在导演台手动微调对象位置与机位')
  }

  return { objects: [...objects, ...roomObjects], camera, warnings }
}
