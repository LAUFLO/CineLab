import * as THREE from 'three'
import type { PrevisWorldRef } from '@shared/previs/world-gen'
import { buildWorld3dContent } from './world-content'

export interface StageWorldRender {
  group: THREE.Group
  dispose: () => void
  animate: (seconds: number, viewer: THREE.Vector3) => void
}

/**
 * 把一个 Previs 世界构建成独立的 Three.js Group，作为导演台的背景。
 * 世界内部的坐标转换由 world-content 负责（x/h/-y）。
 */
export function createStageWorldRender(
  ref: PrevisWorldRef
): StageWorldRender {
  const content = buildWorld3dContent({ world: ref })
  const group = new THREE.Group()
  group.name = 'stage-world'

  for (const child of [...content.scene.children]) {
    if ((child as THREE.Light).isLight) continue
    group.add(child)
  }

  return {
    group,
    dispose: () => {
      content.dispose()
      group.clear()
    },
    animate: (seconds, viewer) => content.animate(seconds, viewer)
  }
}
