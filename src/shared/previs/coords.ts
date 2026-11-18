import {
  previsStageToWorld,
  previsWorldToStage,
  type PrevisWorldStageAnchor,
  type PrevisWorldRef
} from './world-gen'

/** Previs 世界坐标（x 东、y 北、h 高）→ Three.js（Y-up）。 */
export function previsToThree(
  x: number,
  y: number,
  h: number
): [number, number, number] {
  return [x, h, -y]
}

/** Three.js（Y-up）→ Previs 世界坐标。 */
export function threeToPrevis(
  x: number,
  y: number,
  z: number
): [number, number, number] {
  return [x, -z, y]
}

export function stageToWorld(
  anchor: PrevisWorldStageAnchor,
  x: number,
  y: number
): { x: number; y: number } {
  return previsStageToWorld(anchor, x, y)
}

export function worldToStage(
  anchor: PrevisWorldStageAnchor,
  x: number,
  y: number
): { x: number; y: number } {
  return previsWorldToStage(anchor, x, y)
}

export type { PrevisWorldRef }
