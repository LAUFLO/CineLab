import * as THREE from 'three'
import type {
  DirectorStageDoc,
  StageCamera,
  StageShot
} from '@shared/stage-schema'
import { sampleCameraTrack } from '@shared/stage-timeline'
import { buildProgramTimeline, programAt } from '@shared/stage-program'
import { resolveStageLighting } from '@shared/stage-lighting'
import { applyStageFigurePose } from './stage-figure'
import { isStagePoseName } from '@shared/stage-motions'
import {
  createStageObject,
  disposeObject3D,
  waitForStageModels
} from './stage-scene'
import { createStageGround, type StageGround } from './stage-ground'
import { assetUrl } from '../lib/asset-url'

interface StageRenderInput {
  doc: DirectorStageDoc
  shotId: string
  width: number
  height: number
}

interface StageProgramInput {
  doc: DirectorStageDoc
  width: number
  height: number
  fps: number
}

interface ProgramOverlay {
  shotNumber?: number
  totalShots?: number
  timecode?: string
  caption?: string
}

interface ProgramFrame {
  frame: string
  clean: string
}

declare global {
  interface Window {
    __setStagePreview?: (input: StageRenderInput) => Promise<boolean>
    __renderStageFrame?: (timeMs: number) => string
    __setStageProgram?: (input: StageProgramInput) => Promise<boolean>
    __renderProgramFrame?: (
      globalTimeMs: number,
      overlay?: ProgramOverlay
    ) => ProgramFrame
    __renderShotFrame?: (shotId: string, timeMs: number) => string
    __renderOverview?: (width: number, height: number) => string
  }
}

let scene: THREE.Scene | null = null
let renderer: THREE.WebGLRenderer | null = null
let camera: THREE.PerspectiveCamera | null = null
let objectsGroup: THREE.Group | null = null
let doc: DirectorStageDoc | null = null
let shot: StageShot | null = null
let ground: StageGround | null = null
let programTimeline: ReturnType<typeof buildProgramTimeline> | null = null
let fps = 24
let overlayCanvas: HTMLCanvasElement | null = null
let panoramaMesh: THREE.Mesh | null = null

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
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    document.body.appendChild(renderer.domElement)
  }
  renderer.setSize(input.width, input.height, false)

  if (!scene) {
    scene = new THREE.Scene()
    const lighting = resolveStageLighting(doc)
    renderer.toneMappingExposure = lighting.exposure

    const ambient = new THREE.AmbientLight(
      lighting.ambient.color,
      lighting.ambient.intensity
    )
    scene.add(ambient)

    const hemi = new THREE.HemisphereLight(
      lighting.hemi.sky,
      lighting.hemi.ground,
      lighting.hemi.intensity
    )
    scene.add(hemi)

    const directional = new THREE.DirectionalLight(
      lighting.sun.color,
      lighting.sun.intensity
    )
    directional.position.set(...lighting.sun.position)
    directional.castShadow = true
    directional.shadow.mapSize.set(1024, 1024)
    directional.shadow.camera.left = -40
    directional.shadow.camera.right = 40
    directional.shadow.camera.top = 40
    directional.shadow.camera.bottom = -40
    directional.shadow.camera.near = 0.5
    directional.shadow.camera.far = 120
    scene.add(directional)

    if (lighting.fill) {
      const fill = new THREE.DirectionalLight(
        lighting.fill.color,
        lighting.fill.intensity
      )
      fill.position.set(...lighting.fill.position)
      scene.add(fill)
    }

    ground = createStageGround(lighting.background)
    scene.add(ground.mesh)

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
  const lighting = resolveStageLighting(doc)
  renderer.toneMappingExposure = lighting.exposure
  const isPanorama = doc.background.kind === 'panorama' && Boolean(doc.background.value.trim())
  const background =
    doc.background.kind === 'color' && doc.background.value
      ? doc.background.value
      : lighting.background
  scene.background = isPanorama ? null : new THREE.Color(background)
  ground?.setBackground(background)

  if (panoramaMesh) {
    scene.remove(panoramaMesh)
    panoramaMesh.geometry.dispose()
    const mat = panoramaMesh.material
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
    else mat.dispose()
    panoramaMesh = null
  }
  if (isPanorama) {
    const geometry = new THREE.SphereGeometry(500, 64, 40)
    const material = new THREE.MeshBasicMaterial({ side: THREE.BackSide })
    panoramaMesh = new THREE.Mesh(geometry, material)
    new THREE.TextureLoader().load(
      assetUrl(doc.background.value, 'project'),
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace
        texture.minFilter = THREE.LinearFilter
        texture.generateMipmaps = false
        material.map = texture
        material.needsUpdate = true
      },
      undefined,
      () => undefined
    )
    scene.add(panoramaMesh)
  }
  scene.fog = lighting.fog
    ? new THREE.Fog(lighting.fog.color, lighting.fog.near, lighting.fog.far)
    : null

  disposeCurrent()
  for (const object of doc.objects) {
    objectsGroup.add(createStageObject(object))
  }
  objectsGroup.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true
      child.receiveShadow = true
    }
  })
}

function applyActionPose(target: StageShot, timeMs: number): void {
  if (!objectsGroup) return
  for (const track of target.actionTracks ?? []) {
    const group = objectsGroup.children.find(
      (child) => child.userData.stageObjectId === track.objectId
    )
    if (!(group instanceof THREE.Group)) continue

    const keys = [...track.keys].sort((a, b) => a.timeMs - b.timeMs)
    let key = keys[0]
    for (const candidate of keys) {
      if (candidate.timeMs <= timeMs) key = candidate
    }
    if (!key) continue

    if (key.pose && isStagePoseName(key.pose)) {
      const figure = group.children.find(
        (child) => child.name === 'stageFigure'
      )
      if (figure instanceof THREE.Group) {
        applyStageFigurePose(
          figure,
          key.pose,
          timeMs - (key.timeMs ?? 0)
        )
      }
    }
    if (key.position) group.position.fromArray(key.position)
    if (key.rotation) group.rotation.fromArray(key.rotation)
  }
}

window.__setStagePreview = async (input: StageRenderInput): Promise<boolean> => {
  buildScene(input)
  await waitForStageModels()
  return true
}

function renderShotFrame(
  source: StageCamera,
  target: StageShot,
  timeMs: number
): void {
  if (!renderer || !scene || !camera) {
    throw new Error('stage renderer not ready')
  }
  applyActionPose(target, timeMs)
  const sample = sampleCameraTrack(source, target, timeMs)
  camera.position.fromArray(sample.position)
  camera.fov = sample.fov
  camera.lookAt(new THREE.Vector3(...sample.target))
  camera.updateProjectionMatrix()
  ground?.setCameraPosition(camera.position)
  renderer.render(scene, camera)
}

function renderBlack(): string {
  if (!renderer) throw new Error('stage renderer not ready')
  renderer.setClearColor(0x000000, 1)
  renderer.clear()
  return renderer.domElement.toDataURL('image/jpeg', 0.92)
}

function renderOverlay(overlay: ProgramOverlay): string {
  if (!renderer) throw new Error('stage renderer not ready')
  const width = renderer.domElement.width
  const height = renderer.domElement.height
  if (!overlayCanvas) overlayCanvas = document.createElement('canvas')
  overlayCanvas.width = width
  overlayCanvas.height = height
  const context = overlayCanvas.getContext('2d')
  if (!context) throw new Error('overlay canvas missing')
  context.drawImage(renderer.domElement, 0, 0, width, height)

  const unit = Math.min(width, height) / 720
  context.shadowColor = 'rgba(0,0,0,0.85)'
  context.shadowBlur = 4 * unit
  context.fillStyle = '#fff'
  context.textBaseline = 'top'
  context.font = `600 ${Math.round(22 * unit)}px system-ui, "Microsoft YaHei", sans-serif`
  context.textAlign = 'left'
  context.fillText(
    overlay.shotNumber
      ? `第${overlay.shotNumber}镜${overlay.totalShots ? ` / ${overlay.totalShots}` : ''}`
      : '',
    24 * unit,
    20 * unit
  )
  context.textAlign = 'right'
  context.fillText(overlay.timecode ?? '', width - 24 * unit, 20 * unit)

  if (overlay.caption) {
    context.textAlign = 'center'
    context.textBaseline = 'bottom'
    context.font = `500 ${Math.round(30 * unit)}px system-ui, "Microsoft YaHei", sans-serif`
    context.fillText(overlay.caption, width / 2, height - 36 * unit)
  }
  context.shadowBlur = 0
  return overlayCanvas.toDataURL('image/jpeg', 0.92)
}

window.__renderStageFrame = (timeMs: number): string => {
  if (!doc || !shot || !renderer || !scene || !camera) {
    throw new Error('stage renderer not ready')
  }
  const source = doc.cameras.find((item) => item.id === shot?.cameraId)
  if (!source) throw new Error('camera missing')

  renderShotFrame(source, shot, timeMs)
  return renderer.domElement.toDataURL('image/jpeg', 0.92)
}

window.__setStageProgram = async (
  input: StageProgramInput
): Promise<boolean> => {
  buildScene({
    doc: input.doc,
    shotId: '',
    width: input.width,
    height: input.height
  })
  await waitForStageModels()
  doc = input.doc
  shot = null
  programTimeline = buildProgramTimeline(input.doc)
  fps = input.fps === 30 ? 30 : 24
  void fps
  return true
}

window.__renderProgramFrame = (
  globalTimeMs: number,
  overlay?: ProgramOverlay
): ProgramFrame => {
  if (!doc || !renderer || !programTimeline) {
    throw new Error('stage program not ready')
  }
  const segment = programAt(programTimeline, globalTimeMs)
  if (!segment) {
    const black = renderBlack()
    return { frame: black, clean: black }
  }

  const target = doc.shots.find((item) => item.id === segment.shotId)
  const source = target
    ? doc.cameras.find((camera) => camera.id === target.cameraId)
    : undefined
  if (!target || !source) throw new Error('camera missing')

  renderShotFrame(source, target, globalTimeMs - segment.startMs)
  const clean = renderer.domElement.toDataURL('image/jpeg', 0.92)
  return {
    frame: overlay ? renderOverlay(overlay) : clean,
    clean
  }
}

window.__renderShotFrame = (shotId: string, timeMs: number): string => {
  if (!doc || !renderer) throw new Error('stage program not ready')
  const target = doc.shots.find((item) => item.id === shotId)
  const source = target
    ? doc.cameras.find((camera) => camera.id === target.cameraId)
    : undefined
  if (!target || !source) throw new Error('camera missing')

  renderShotFrame(source, target, timeMs)
  return renderer.domElement.toDataURL('image/jpeg', 0.92)
}

window.__renderOverview = (width: number, height: number): string => {
  if (!renderer || !scene || !camera || !objectsGroup) {
    throw new Error('stage program not ready')
  }
  renderer.setSize(width, height, false)
  camera.aspect = width / height
  camera.fov = 35

  const box = new THREE.Box3().setFromObject(objectsGroup)
  if (box.isEmpty()) {
    camera.position.set(8, 8, 8)
    camera.lookAt(new THREE.Vector3(0, 1, 0))
  } else {
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const radius = Math.max(4, size.length() / 2)
    const distance = radius * 2.2
    camera.position.set(
      center.x + distance * 0.55,
      center.y + distance * 0.45,
      center.z + distance * 0.55
    )
    camera.lookAt(center)
  }
  camera.updateProjectionMatrix()
  ground?.setCameraPosition(camera.position)
  renderer.render(scene, camera)
  return renderer.domElement.toDataURL('image/jpeg', 0.92)
}
