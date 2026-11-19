import * as THREE from 'three'
import {
  sampleStageMotion,
  type StageBone,
  type StagePoseName
} from '@shared/stage-motions'

const DEG = Math.PI / 180

interface FigureRig {
  bones: Record<StageBone, THREE.Object3D>
  hipsBase: THREE.Vector3
}

const rigs = new WeakMap<THREE.Group, FigureRig>()

function joint(
  name: string,
  parent: THREE.Object3D,
  x: number,
  y: number,
  z = 0
): THREE.Object3D {
  const node = new THREE.Object3D()
  node.name = name
  node.position.set(x, y, z)
  parent.add(node)
  return node
}

function limb(
  parent: THREE.Object3D,
  radius: number,
  length: number,
  color: string,
  y: number
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(radius, length, 4, 10),
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.85,
      metalness: 0.05
    })
  )
  mesh.position.y = y
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

export function createStageFigure(
  color: string,
  pose: StagePoseName = 'stand'
): THREE.Group {
  const group = new THREE.Group()
  group.name = 'stageFigure'

  const hips = joint('hips', group, 0, 0.9, 0)
  const spine = joint('spine', hips, 0, 0.08, 0)
  const chest = joint('chest', spine, 0, 0.15, 0)
  const neck = joint('neck', chest, 0, 0.18, 0)
  const head = joint('head', neck, 0, 0.16, 0)

  const leftUpperArm = joint('leftUpperArm', chest, 0.2, 0.1, 0)
  const leftForeArm = joint('leftForeArm', leftUpperArm, 0, -0.28, 0)
  const rightUpperArm = joint('rightUpperArm', chest, -0.2, 0.1, 0)
  const rightForeArm = joint('rightForeArm', rightUpperArm, 0, -0.28, 0)

  const leftThigh = joint('leftThigh', hips, 0.1, -0.05, 0)
  const leftShin = joint('leftShin', leftThigh, 0, -0.38, 0)
  const rightThigh = joint('rightThigh', hips, -0.1, -0.05, 0)
  const rightShin = joint('rightShin', rightThigh, 0, -0.38, 0)

  limb(chest, 0.16, 0.38, color, 0.12)
  const headMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 14, 10),
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.85,
      metalness: 0.05
    })
  )
  headMesh.position.y = 0.1
  headMesh.castShadow = true
  headMesh.receiveShadow = true
  head.add(headMesh)

  limb(leftUpperArm, 0.055, 0.22, color, -0.14)
  limb(leftForeArm, 0.05, 0.2, color, -0.12)
  limb(rightUpperArm, 0.055, 0.22, color, -0.14)
  limb(rightForeArm, 0.05, 0.2, color, -0.12)
  limb(leftThigh, 0.075, 0.26, color, -0.16)
  limb(leftShin, 0.065, 0.24, color, -0.15)
  limb(rightThigh, 0.075, 0.26, color, -0.16)
  limb(rightShin, 0.065, 0.24, color, -0.15)

  const bones: Record<StageBone, THREE.Object3D> = {
    hips,
    spine,
    chest,
    neck,
    head,
    leftUpperArm,
    leftForeArm,
    rightUpperArm,
    rightForeArm,
    leftThigh,
    leftShin,
    rightThigh,
    rightShin
  }
  rigs.set(group, { bones, hipsBase: hips.position.clone() })
  applyStageFigurePose(group, pose, 0)
  return group
}

export function applyStageFigurePose(
  group: THREE.Group,
  pose: StagePoseName,
  timeMs: number
): void {
  const rig = rigs.get(group)
  if (!rig) return
  const frame = sampleStageMotion(pose, timeMs)
  for (const [bone, rotation] of Object.entries(frame.rotations)) {
    const node = rig.bones[bone as StageBone]
    if (!node || !rotation) continue
    node.rotation.set(
      rotation[0] * DEG,
      rotation[1] * DEG,
      rotation[2] * DEG
    )
  }
  const offset = frame.hipsOffset ?? [0, 0, 0]
  rig.bones.hips.position.set(
    rig.hipsBase.x + offset[0],
    rig.hipsBase.y + offset[1],
    rig.hipsBase.z + offset[2]
  )
}
