import * as THREE from 'three'
import type { DirectorStageDoc, StageShot } from '@shared/stage-schema'
import { sampleCameraTrack } from '@shared/stage-timeline'
import { createStageObject, disposeObject3D } from './stage-scene'

interface StageRenderInput {
  doc: DirectorStageDoc
  shotId: string
  width: number
  height: number
}

declare global {
  interface Window {
    __setStage?: (input: StageRenderInput) => boolean
    __renderFrame?: (timeMs: number) => string
  }
}

let scene: THREE.Scene | null = null
let renderer: THREE.WebGLRenderer | null = null
let camera: THREE.PerspectiveCamera | null = null
let objectsGroup: THREE.Group | null = null
let doc: DirectorStageDoc | null = null
let shot: StageShot | null = null

function disposeCurrent(): void {
  if (!objectsGroup) return
  disposeObject3D(objectsGroup)
  objectsGroup.clear()
}

function buildScene(input: StageRenderInput): void {
  doc = input.doc
  shot = input.doc.shots.find((item) => item.id === input.shotId) ?? null

  if (!renderer) {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true
    })
    renderer.setPixelRatio(1)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    document.body.appendChild(renderer.domElement)
  }
  renderer.setSize(input.width, input.height, false)

  if (!scene) {
    scene = new THREE.Scene()
    const ambient = new THREE.AmbientLight(0xffffff, 1.4)
    scene.add(ambient)
    const directional = new THREE.DirectionalLight(0xffffff, 1.8)
    directional.position.set(6, 10, 4)
    scene.add(directional)

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({
        color: 0x18181b,
        roughness: 1,
        metalness: 0
      })
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -0.01
    scene.add(floor)

    objectsGroup = new THREE.Group()
    scene.add(objectsGroup)
  }

  if (!camera) {
    camera = new THREE.PerspectiveCamera(
      50,
      input.width / input.height,
      0.1,
      300
    )
  }
  camera.aspect = input.width / input.height

  if (!scene || !objectsGroup) return
  scene.background = new THREE.Color(
    doc.background.kind === 'color' && doc.background.value
      ? doc.background.value
      : '#1a1a1a'
  )

  disposeCurrent()
  for (const object of doc.objects) {
    objectsGroup.add(createStageObject(object))
  }
}

window.__setStage = (input: StageRenderInput): boolean => {
  buildScene(input)
  return true
}

window.__renderFrame = (timeMs: number): string => {
  if (!doc || !shot || !renderer || !scene || !camera) {
    throw new Error('stage renderer not ready')
  }
  const source = doc.cameras.find((item) => item.id === shot?.cameraId)
  if (!source) throw new Error('camera missing')

  const sample = sampleCameraTrack(source, shot, timeMs)
  camera.position.fromArray(sample.position)
  camera.fov = sample.fov
  camera.lookAt(new THREE.Vector3(...sample.target))
  camera.updateProjectionMatrix()
  renderer.render(scene, camera)
  return renderer.domElement.toDataURL('image/jpeg', 0.92)
}
