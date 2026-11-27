import type { StageVec3 } from '@shared/stage-schema'

export type StagePathProjector = (
  clientX: number,
  clientY: number,
  planeY: number
) => StageVec3 | null

let projector: StagePathProjector | null = null

export function registerStagePathProjector(
  handler: StagePathProjector | null
): void {
  projector = handler
}

export function projectStagePathPoint(
  clientX: number,
  clientY: number,
  planeY: number
): StageVec3 | null {
  return projector?.(clientX, clientY, planeY) ?? null
}
