import * as THREE from 'three'
import type { StageObject } from '@shared/stage-schema'

const OBJECT_COLOR = '#9ca3af'

export function createHuman(color: string): THREE.Group {
  const group = new THREE.Group()
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.85,
    metalness: 0.05
  })

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.3, 1.05, 6, 12),
    material
  )
  body.position.y = 0.85
  group.add(body)

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 12), material)
  head.position.y = 1.78
  group.add(head)

  return group
}

export function createStageObject(object: StageObject): THREE.Object3D {
  const group = new THREE.Group()
  group.userData.stageObjectId = object.id
  group.position.fromArray(object.transform.position)
  group.rotation.fromArray(object.transform.rotation)
  group.scale.fromArray(object.transform.scale)
  group.visible = object.visible !== false

  const color = object.color ?? OBJECT_COLOR
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.8,
    metalness: 0.08
  })

  if (object.type === 'human') {
    group.add(createHuman(color))
    return group
  }

  if (object.type === 'crowd' || object.type === 'gltf') {
    const count = object.type === 'crowd' ? Math.max(1, object.count ?? 3) : 1
    for (let index = 0; index < count; index += 1) {
      const person = createHuman(color)
      if (object.type === 'gltf') {
        person.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.material = new THREE.MeshStandardMaterial({
              color,
              wireframe: true
            })
          }
        })
      }
      person.position.x = (index % 5) * 0.9
      person.position.z = Math.floor(index / 5) * 0.9
      group.add(person)
    }
    return group
  }

  let geometry: THREE.BufferGeometry
  if (object.type === 'sphere') {
    geometry = new THREE.SphereGeometry(0.5, 24, 16)
    geometry.translate(0, 0.5, 0)
  } else if (object.type === 'plane') {
    geometry = new THREE.PlaneGeometry(2, 2)
    geometry.rotateX(-Math.PI / 2)
    material.side = THREE.DoubleSide
  } else {
    geometry = new THREE.BoxGeometry(1, 1, 1)
    geometry.translate(0, 0.5, 0)
  }

  group.add(new THREE.Mesh(geometry, material))
  return group
}

export function disposeObject3D(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
      child.geometry.dispose()
      if (Array.isArray(child.material)) {
        child.material.forEach((material) => material.dispose())
      } else {
        child.material.dispose()
      }
    }
  })
}
