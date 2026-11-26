import * as THREE from 'three'

export type StageWeatherKind = 'rain' | 'snow'

export interface StageWeather {
  object: THREE.Object3D
  /** 用确定性时间驱动，视口用真实时钟、导出用帧时间 */
  update: (timeMs: number, center: THREE.Vector3) => void
  dispose: () => void
}

const AREA = 22
const HEIGHT = 14
const RAIN_COUNT = 520
const SNOW_COUNT = 280

function wrap(value: number, max: number): number {
  return ((value % max) + max) % max
}

/** 创建跟随相机的局部天气粒子（雨线 / 雪点），几何与材质可释放。 */
export function createStageWeather(kind: StageWeatherKind): StageWeather {
  const group = new THREE.Group()
  const count = kind === 'rain' ? RAIN_COUNT : SNOW_COUNT
  const seeds = new Float32Array(count * 3)
  for (let index = 0; index < count; index += 1) {
    seeds[index * 3] = Math.random() * AREA - AREA / 2
    seeds[index * 3 + 1] = Math.random() * HEIGHT
    seeds[index * 3 + 2] = Math.random() * AREA - AREA / 2
  }

  if (kind === 'rain') {
    const positions = new Float32Array(count * 6)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const material = new THREE.LineBasicMaterial({
      color: '#a9c8ea',
      transparent: true,
      opacity: 0.55
    })
    group.add(new THREE.LineSegments(geometry, material))
    return {
      object: group,
      update: (timeMs, center) => {
        group.position.set(center.x, 0, center.z)
        const seconds = timeMs / 1000
        for (let index = 0; index < count; index += 1) {
          const sx = seeds[index * 3]!
          const sy = seeds[index * 3 + 1]!
          const sz = seeds[index * 3 + 2]!
          const y = wrap(sy - seconds * 10, HEIGHT)
          const x = sx + Math.sin(seconds * 1.5 + index) * 0.25
          const offset = index * 6
          positions[offset] = x
          positions[offset + 1] = y
          positions[offset + 2] = sz
          positions[offset + 3] = x + 0.06
          positions[offset + 4] = y - 0.5
          positions[offset + 5] = sz
        }
        geometry.attributes.position!.needsUpdate = true
      },
      dispose: () => {
        geometry.dispose()
        material.dispose()
      }
    }
  }

  const positions = new Float32Array(count * 3)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const material = new THREE.PointsMaterial({
    color: '#ffffff',
    size: 0.13,
    transparent: true,
    opacity: 0.85,
    sizeAttenuation: true,
    depthWrite: false
  })
  group.add(new THREE.Points(geometry, material))
  return {
    object: group,
    update: (timeMs, center) => {
      group.position.set(center.x, 0, center.z)
      const seconds = timeMs / 1000
      for (let index = 0; index < count; index += 1) {
        const sx = seeds[index * 3]!
        const sy = seeds[index * 3 + 1]!
        const sz = seeds[index * 3 + 2]!
        positions[index * 3] = sx + Math.sin(seconds * 0.8 + index) * 0.6
        positions[index * 3 + 1] = wrap(sy - seconds * 1.6, HEIGHT)
        positions[index * 3 + 2] = sz + Math.cos(seconds * 0.6 + index) * 0.4
      }
      geometry.attributes.position!.needsUpdate = true
    },
    dispose: () => {
      geometry.dispose()
      material.dispose()
    }
  }
}
