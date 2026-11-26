import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { StageObject } from '@shared/stage-schema'
import { assetUrl } from '../lib/asset-url'
import {
  isStagePoseName,
  type StagePoseName
} from '@shared/stage-motions'
import { createStageFigure } from './stage-figure'

const OBJECT_COLOR = '#9ca3af'

export function createHuman(
  color: string,
  pose: StagePoseName = 'stand'
): THREE.Group {
  return createStageFigure(color, pose)
}

const pendingModelLoads = new Set<Promise<void>>()

/** 等待已发起的 glTF 加载结束；导出渲染用它保证第一帧就有模型。 */
export async function waitForStageModels(timeoutMs = 10000): Promise<void> {
  if (pendingModelLoads.size === 0) return
  await Promise.race([
    Promise.allSettled([...pendingModelLoads]),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))
  ])
}

function addModelFallback(group: THREE.Group, color: string): void {
  const person = createStageFigure(color, 'stand')
  person.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.material = new THREE.MeshStandardMaterial({
        color,
        wireframe: true
      })
    }
  })
  group.add(person)
}

function loadStageModel(
  object: StageObject,
  group: THREE.Group,
  color: string
): void {
  const assetPath = object.assetPath
  if (!assetPath) {
    addModelFallback(group, color)
    return
  }
  const task = new Promise<void>((resolve) => {
    new GLTFLoader().load(
      assetUrl(assetPath, 'project'),
      (gltf) => {
        const model = gltf.scene
        const bounds = new THREE.Box3().setFromObject(model)
        const size = new THREE.Vector3()
        bounds.getSize(size)
        if (size.y > 0.001) {
          model.scale.setScalar(2 / size.y)
          bounds.setFromObject(model)
          model.position.y -= bounds.min.y
        }
        model.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true
            child.receiveShadow = true
          }
        })
        group.add(model)
        resolve()
      },
      undefined,
      () => {
        console.warn('[stage] glTF 加载失败，回退占位人形：', assetPath)
        addModelFallback(group, color)
        resolve()
      }
    )
  })
  pendingModelLoads.add(task)
  void task.finally(() => pendingModelLoads.delete(task))
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

  const pose =
    object.pose && isStagePoseName(object.pose) ? object.pose : 'stand'

  if (object.type === 'human') {
    group.add(createStageFigure(color, pose))
    return group
  }

  if (object.type === 'gltf') {
    loadStageModel(object, group, color)
    return group
  }

  if (object.type === 'crowd') {
    const count = Math.max(1, object.count ?? 3)
    for (let index = 0; index < count; index += 1) {
      const person = createStageFigure(color, 'stand')
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
