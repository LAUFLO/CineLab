import type { CameraKeyframe, StageCamera } from './stage-schema'

export type CameraMovePreset =
  | 'dolly-in'
  | 'dolly-out'
  | 'orbit'
  | 'follow'
  | 'crane'

export const CAMERA_MOVE_PRESETS: Array<{
  id: CameraMovePreset
  label: string
}> = [
  { id: 'dolly-in', label: '推近' },
  { id: 'dolly-out', label: '拉远' },
  { id: 'orbit', label: '环绕' },
  { id: 'follow', label: '跟拍' },
  { id: 'crane', label: '升降' }
]

/**
 * 按当前机位与镜头时长生成一个 2-3 帧的运镜轨迹。
 * 纯几何计算，不依赖 three.js，可在 shared 层复用。
 */
export function buildCameraMoveTrack(
  preset: CameraMovePreset,
  camera: StageCamera,
  durationMs: number
): CameraKeyframe[] {
  const pos = camera.position
  const target = camera.target
  const mid = Math.round(durationMs / 2)
  const frame = (
    timeMs: number,
    position: [number, number, number],
    aim: [number, number, number] = target
  ): CameraKeyframe => ({
    timeMs,
    position,
    target: [...aim] as [number, number, number],
    fov: camera.fov,
    easing: 'easeInOut'
  })

  switch (preset) {
    case 'dolly-in':
      return [
        frame(0, [pos[0], pos[1], pos[2] + 3]),
        frame(durationMs, [pos[0], pos[1], pos[2]])
      ]
    case 'dolly-out':
      return [
        frame(0, [pos[0], pos[1], pos[2]]),
        frame(durationMs, [pos[0], pos[1], pos[2] + 3])
      ]
    case 'orbit': {
      const radius = Math.max(1, Math.hypot(pos[0] - target[0], pos[2] - target[2]))
      const angle = (t: number) => t * Math.PI * 0.75
      const at = (t: number): [number, number, number] => [
        target[0] + Math.sin(angle(t)) * radius,
        pos[1],
        target[2] + Math.cos(angle(t)) * radius
      ]
      return [frame(0, at(0)), frame(mid, at(0.5)), frame(durationMs, at(1))]
    }
    case 'follow':
      return [
        frame(0, [target[0] - 2, pos[1], pos[2]]),
        frame(mid, [target[0], pos[1], pos[2]]),
        frame(durationMs, [target[0] + 2, pos[1], pos[2]])
      ]
    case 'crane':
      return [
        frame(0, [pos[0], Math.max(0.5, pos[1] - 2), pos[2]]),
        frame(durationMs, [pos[0], pos[1] + 2, pos[2]])
      ]
    default:
      return [frame(0, pos), frame(durationMs, pos)]
  }
}

export function describeCameraMove(preset: CameraMovePreset): string {
  return CAMERA_MOVE_PRESETS.find((item) => item.id === preset)?.label ?? preset
}
