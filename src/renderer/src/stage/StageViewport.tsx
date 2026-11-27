import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import type { StageCamera, StageShot, StageVec3 } from '@shared/stage-schema'
import {
  easingProgress,
  sampleCameraTrack
} from '@shared/stage-timeline'
import { buildProgramTimeline, programAt } from '@shared/stage-program'
import { resolveStageLighting } from '@shared/stage-lighting'
import { createStageWeather, type StageWeather } from './stage-weather'
import { isStagePoseName } from '@shared/stage-motions'
import { applyStageFigurePose } from './stage-figure'
import {
  createStageObject,
  disposeObject3D as disposeObject
} from './stage-scene'
import { createStageGround, type StageGround } from './stage-ground'
import { useStageStore } from './stageStore'
import {
  pathColor,
  positionAtT,
  simplifyPathPoints,
  smoothPathPoints
} from '@shared/stage-paths'
import { registerStagePathProjector } from './stage-path-bridge'
import { assetUrl } from '../lib/asset-url'

const DEFAULT_BACKGROUND = '#242428'
const SELECTED_COLOR = '#4ade80'
const FALLBACK_ASPECT = 16 / 9

function mixVec(a: StageVec3, b: StageVec3, t: number): StageVec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function findUserData(
  object: THREE.Object3D,
  key: 'stageObjectId' | 'stageCameraId'
): string | null {
  let current: THREE.Object3D | null = object
  while (current) {
    const value = current.userData[key]
    if (typeof value === 'string') return value
    current = current.parent
  }
  return null
}

function createCameraMarker(
  camera: StageCamera,
  selected: boolean
): THREE.Group {
  const group = new THREE.Group()
  group.userData.stageCameraId = camera.id
  group.position.fromArray(camera.position)

  const target = new THREE.Vector3(...camera.target)
  const position = new THREE.Vector3(...camera.position)
  const distance = Math.max(target.distanceTo(position), 0.001)

  const color = selected ? SELECTED_COLOR : '#f59e0b'
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.5,
    metalness: 0.12,
    emissive: color,
    emissiveIntensity: selected ? 0.3 : 0.1
  })

  // 简化的机身 + 镜头 + 取景器；普通 Object3D 的 +Z 朝向 lookAt 目标
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.24), material)
  group.add(body)
  const lens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.12, 0.18, 12),
    material
  )
  lens.rotation.x = Math.PI / 2
  lens.position.z = 0.2
  group.add(lens)
  const viewfinder = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.06, 0.12),
    material
  )
  viewfinder.position.set(0.06, 0.13, 0)
  group.add(viewfinder)
  group.lookAt(target)

  // 视锥线框：远端矩形按 FOV 展开，直观表达朝向与视野
  const fov = THREE.MathUtils.clamp(camera.fov, 10, 120)
  const aspect =
    camera.aspect === '9:16' ? 9 / 16 : camera.aspect === '1:1' ? 1 : 16 / 9
  const far = Math.max(0.6, Math.min(distance, 2.4))
  const halfHeight = Math.tan(THREE.MathUtils.degToRad(fov / 2)) * far
  const halfWidth = halfHeight * aspect
  const corners = [
    new THREE.Vector3(-halfWidth, -halfHeight, far),
    new THREE.Vector3(halfWidth, -halfHeight, far),
    new THREE.Vector3(halfWidth, halfHeight, far),
    new THREE.Vector3(-halfWidth, halfHeight, far)
  ]
  const points: number[] = []
  for (const corner of corners) {
    points.push(0, 0, 0, corner.x, corner.y, corner.z)
  }
  for (let index = 0; index < corners.length; index += 1) {
    const next = corners[(index + 1) % corners.length]!
    points.push(
      corners[index]!.x,
      corners[index]!.y,
      corners[index]!.z,
      next.x,
      next.y,
      next.z
    )
  }
  const frustumGeometry = new THREE.BufferGeometry()
  frustumGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(points, 3)
  )
  group.add(
    new THREE.LineSegments(
      frustumGeometry,
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: selected ? 0.75 : 0.35
      })
    )
  )

  // 中心视线用局部坐标，修正旧版世界坐标叠加造成的偏移
  const sight = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, distance)
    ]),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 })
  )
  group.add(sight)

  return group
}

export function StageViewport() {
  const hostRef = useRef<HTMLDivElement>(null)
  const doc = useStageStore((state) => state.doc)
  const viewMode = useStageStore((state) => state.viewMode)
  const transformMode = useStageStore((state) => state.transformMode)
  const playing = useStageStore((state) => state.playing)
  const selectedObjectId = useStageStore((state) => state.selectedObjectId)
  const selectedCameraId = useStageStore((state) => state.selectedCameraId)
  const selectedShotId = useStageStore((state) => state.selectedShotId)
  const selectedPathId = useStageStore((state) => state.selectedPathId)

  const sceneRef = useRef<THREE.Scene | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const directorCameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const shotCameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const activeCameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const ambientRef = useRef<THREE.AmbientLight | null>(null)
  const hemiRef = useRef<THREE.HemisphereLight | null>(null)
  const sunRef = useRef<THREE.DirectionalLight | null>(null)
  const fillRef = useRef<THREE.DirectionalLight | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const transformRef = useRef<TransformControls | null>(null)
  const transformHelperRef = useRef<THREE.Object3D | null>(null)
  const objectsGroupRef = useRef<THREE.Group | null>(null)
  const groundRef = useRef<StageGround | null>(null)
  const cameraGroupRef = useRef<THREE.Group | null>(null)
  const selectionRef = useRef<THREE.BoxHelper | null>(null)
  const panoramaRef = useRef<THREE.Mesh | null>(null)
  const weatherRef = useRef<StageWeather | null>(null)
  const pathsGroupRef = useRef<THREE.Group | null>(null)
  const pathControlGroupRef = useRef<THREE.Group | null>(null)
  const pathMaterialsRef = useRef<LineMaterial[]>([])
  const pathDragRef = useRef<{
    pathId: string
    pointIndex: number
    planeY: number
    mode: 'plane' | 'height'
    startY: number
    startClientY: number
    worldPerPixel: number
    object: THREE.Object3D
    last: THREE.Vector3 | null
  } | null>(null)
  const aspectRef = useRef(FALLBACK_ASPECT)
  const viewModeRef = useRef(viewMode)
  const selectedCameraRef = useRef<string | null>(selectedCameraId)

  viewModeRef.current = viewMode
  selectedCameraRef.current = selectedCameraId

  const updateSize = (): void => {
    const host = hostRef.current
    const renderer = rendererRef.current
    const director = directorCameraRef.current
    const shot = shotCameraRef.current
    if (!host || !renderer || !director) return

    const width = host.clientWidth
    const height = host.clientHeight
    if (width === 0 || height === 0) return

    const aspect = width / height
    aspectRef.current = aspect
    renderer.setSize(width, height, false)
    for (const material of pathMaterialsRef.current) {
      material.resolution.set(width, height)
    }
    director.aspect = aspect
    director.updateProjectionMatrix()
    if (shot) {
      shot.aspect = aspect
      shot.updateProjectionMatrix()
    }
  }

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const scene = new THREE.Scene()
    const lighting = resolveStageLighting(
      useStageStore.getState().doc ?? { lighting: undefined }
    )
    scene.background = new THREE.Color(lighting.background)
    sceneRef.current = scene

    const director = new THREE.PerspectiveCamera(50, FALLBACK_ASPECT, 0.1, 300)
    director.position.set(7, 6, 11)
    directorCameraRef.current = director
    activeCameraRef.current = director

    const shot = new THREE.PerspectiveCamera(50, FALLBACK_ASPECT, 0.1, 300)
    shotCameraRef.current = shot

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.domElement.className = 'block h-full w-full'
    host.appendChild(renderer.domElement)
    rendererRef.current = renderer

    const controls = new OrbitControls(director, renderer.domElement)
    controls.target.set(0, 1, 0)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 1.5
    controls.maxDistance = 80
    controls.maxPolarAngle = Math.PI / 2 - 0.03
    controlsRef.current = controls

    const transform = new TransformControls(director, renderer.domElement)
    transform.setMode('translate')
    transform.setSize(0.75)
    const transformHelper = transform.getHelper()
    transformHelper.visible = false
    scene.add(transformHelper)
    transformRef.current = transform
    transformHelperRef.current = transformHelper

    const onTransformDragging = (event: unknown): void => {
      const dragging = Boolean((event as { value?: boolean }).value)
      controls.enabled = !dragging
      if (dragging) return

      const object = transform.object
      const objectId = object?.userData.stageObjectId
      if (!object || typeof objectId !== 'string') return
      useStageStore.getState().applyCommands([
        {
          type: 'transformObject',
          objectId,
          transform: {
            position: [
              object.position.x,
              object.position.y,
              object.position.z
            ],
            rotation: [
              object.rotation.x,
              object.rotation.y,
              object.rotation.z
            ],
            scale: [object.scale.x, object.scale.y, object.scale.z]
          }
        }
      ])
    }
    transform.addEventListener('dragging-changed', onTransformDragging)

    const onTransformChange = (): void => {
      selectionRef.current?.update()
    }
    transform.addEventListener('objectChange', onTransformChange)

    const ambient = new THREE.AmbientLight(
      lighting.ambient.color,
      lighting.ambient.intensity
    )
    scene.add(ambient)
    ambientRef.current = ambient
    const hemi = new THREE.HemisphereLight(
      lighting.hemi.sky,
      lighting.hemi.ground,
      lighting.hemi.intensity
    )
    scene.add(hemi)
    hemiRef.current = hemi
    const directional = new THREE.DirectionalLight(
      lighting.sun.color,
      lighting.sun.intensity
    )
    directional.position.set(...lighting.sun.position)
    scene.add(directional)
    sunRef.current = directional
    const fill = new THREE.DirectionalLight(
      lighting.fill?.color ?? '#ffffff',
      lighting.fill?.intensity ?? 0
    )
    if (lighting.fill) fill.position.set(...lighting.fill.position)
    scene.add(fill)
    fillRef.current = fill
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = lighting.exposure

    const ground = createStageGround(lighting.background)
    scene.add(ground.mesh)
    groundRef.current = ground

    const objectsGroup = new THREE.Group()
    const cameraGroup = new THREE.Group()
    scene.add(objectsGroup, cameraGroup)
    objectsGroupRef.current = objectsGroup
    cameraGroupRef.current = cameraGroup

    const pathsGroup = new THREE.Group()
    pathsGroup.name = 'stage-paths'
    scene.add(pathsGroup)
    pathsGroupRef.current = pathsGroup

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let downX = 0
    let downY = 0

    registerStagePathProjector((clientX, clientY, planeY) => {
      const camera = activeCameraRef.current
      if (!camera) return null
      const rect = renderer.domElement.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return null
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      if (Math.abs(raycaster.ray.direction.y) < 0.12) return null
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY)
      const hit = new THREE.Vector3()
      if (!raycaster.ray.intersectPlane(plane, hit)) return null
      return [hit.x, hit.y, hit.z]
    })

    const pathPointAt = (
      event: PointerEvent
    ): { object: THREE.Object3D; pathId: string; pointIndex: number } | null => {
      const controlsGroup = pathControlGroupRef.current
      if (!controlsGroup || viewModeRef.current !== 'director') return null
      const rect = renderer.domElement.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return null
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, activeCameraRef.current ?? director)
      const hits = raycaster.intersectObjects(controlsGroup.children, false)
      for (const hit of hits) {
        const pathId = hit.object.userData.stagePathId
        const pointIndex = hit.object.userData.stagePathPointIndex
        if (typeof pathId === 'string' && typeof pointIndex === 'number') {
          return { object: hit.object, pathId, pointIndex }
        }
      }
      return null
    }

    const onPointerDown = (event: PointerEvent): void => {
      downX = event.clientX
      downY = event.clientY
      if (event.button !== 0) return
      const control = pathPointAt(event)
      if (control) {
        const camera = activeCameraRef.current ?? director
        const distance = camera.position.distanceTo(control.object.position)
        const worldPerPixel =
          (2 *
            distance *
            Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) /
          Math.max(1, renderer.domElement.clientHeight)
        pathDragRef.current = {
          pathId: control.pathId,
          pointIndex: control.pointIndex,
          planeY: control.object.position.y,
          mode: event.altKey ? 'height' : 'plane',
          startY: control.object.position.y,
          startClientY: event.clientY,
          worldPerPixel,
          object: control.object,
          last: null
        }
        useStageStore.getState().selectPath(control.pathId)
        controls.enabled = false
      }
    }

    const onPointerMove = (event: PointerEvent): void => {
      const drag = pathDragRef.current
      if (!drag) return
      if (drag.mode === 'height') {
        const y =
          drag.startY -
          (event.clientY - drag.startClientY) * drag.worldPerPixel
        drag.object.position.y = y
        drag.last = new THREE.Vector3(
          drag.object.position.x,
          y,
          drag.object.position.z
        )
        return
      }
      pointer.x =
        ((event.clientX - renderer.domElement.getBoundingClientRect().left) /
          renderer.domElement.getBoundingClientRect().width) *
          2 -
        1
      pointer.y =
        -((event.clientY - renderer.domElement.getBoundingClientRect().top) /
          renderer.domElement.getBoundingClientRect().height) *
          2 +
        1
      raycaster.setFromCamera(pointer, activeCameraRef.current ?? director)
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -drag.planeY)
      const hit = new THREE.Vector3()
      if (!raycaster.ray.intersectPlane(plane, hit)) return
      drag.object.position.copy(hit)
      drag.last = hit.clone()
    }

    const onPointerUp = (event: PointerEvent): void => {
      const drag = pathDragRef.current
      if (drag) {
        pathDragRef.current = null
        controls.enabled = true
        const state = useStageStore.getState()
        const shot = state.doc?.shots.find(
          (item) => item.id === state.selectedShotId
        )
        const path = shot?.paths?.find((item) => item.id === drag.pathId)
        if (drag.last && state.selectedShotId && path) {
          useStageStore.getState().updatePathPoint(
            state.selectedShotId,
            drag.pathId,
            drag.pointIndex,
            [
              drag.last.x,
              drag.last.y - (path.height ?? 0),
              drag.last.z
            ]
          )
        }
        return
      }
      if (Math.abs(event.clientX - downX) > 5) return
      if (Math.abs(event.clientY - downY) > 5) return
      if (viewModeRef.current === 'camera') return
      if (
        (transformRef.current as unknown as { dragging?: boolean } | null)
          ?.dragging
      ) {
        return
      }

      const rect = renderer.domElement.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, director)

      const targets = [objectsGroup, cameraGroup]
      const hits = raycaster.intersectObjects(targets, true)
      for (const hit of hits) {
        const cameraId = findUserData(hit.object, 'stageCameraId')
        if (cameraId) {
          useStageStore.getState().selectCamera(cameraId)
          return
        }
        const objectId = findUserData(hit.object, 'stageObjectId')
        if (objectId) {
          useStageStore.getState().selectObject(objectId)
          return
        }
      }
      useStageStore.getState().selectObject(null)
    }

    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('pointerup', onPointerUp)

    const observer = new ResizeObserver(updateSize)
    observer.observe(host)
    updateSize()

    renderer.setAnimationLoop(() => {
      const state = useStageStore.getState()
      let shot: StageShot | undefined
      let shotTimeMs = state.playbackMs

      if (state.playing) {
        if (state.playbackScope === 'program' && state.doc) {
          const timeline = buildProgramTimeline(state.doc)
          const segment = programAt(timeline, state.programMs)
          if (segment) {
            shot = state.doc.shots.find((item) => item.id === segment.shotId)
            shotTimeMs = Math.max(0, state.programMs - segment.startMs)
          }
        } else if (state.selectedShotId) {
          shot = state.doc?.shots.find(
            (item) => item.id === state.selectedShotId
          )
          shotTimeMs = state.playbackMs
        }
      }

      if (shot && state.doc) {
        const objectsGroup = objectsGroupRef.current
        for (const object of state.doc.objects) {
          const group = objectsGroup?.children.find(
            (child) => child.userData.stageObjectId === object.id
          )
          if (group instanceof THREE.Group) {
            group.position.fromArray(object.transform.position)
            group.rotation.fromArray(object.transform.rotation)
          }
        }

        for (const track of shot.actionTracks ?? []) {
          const group = objectsGroup?.children.find(
            (child) => child.userData.stageObjectId === track.objectId
          )
          if (!(group instanceof THREE.Group)) continue
          const keys = [...track.keys].sort((a, b) => a.timeMs - b.timeMs)
          if (keys.length === 0) continue

          let from = keys[0]
          let to = keys[0]
          if (shotTimeMs >= keys[keys.length - 1].timeMs) {
            from = keys[keys.length - 1]
            to = from
          } else if (shotTimeMs > keys[0].timeMs) {
            for (let index = 0; index < keys.length - 1; index += 1) {
              if (
                shotTimeMs >= keys[index].timeMs &&
                shotTimeMs <= keys[index + 1].timeMs
              ) {
                from = keys[index]
                to = keys[index + 1]
                break
              }
            }
          }

          const span = to.timeMs - from.timeMs
          const progress =
            span <= 0
              ? 1
              : easingProgress(
                  (shotTimeMs - from.timeMs) / span,
                  from.easing
                )
          if (from.position && to.position) {
            group.position.fromArray(mixVec(from.position, to.position, progress))
          } else if (from.position) {
            group.position.fromArray(from.position)
          }
          if (from.rotation && to.rotation) {
            group.rotation.fromArray(mixVec(from.rotation, to.rotation, progress))
          } else if (from.rotation) {
            group.rotation.fromArray(from.rotation)
          }

          const poseKey = from.pose ? from : to.pose ? to : null
          if (poseKey?.pose && isStagePoseName(poseKey.pose)) {
            const figure = group.children.find(
              (child) => child.name === 'stageFigure'
            )
            if (figure instanceof THREE.Group) {
              applyStageFigurePose(
                figure,
                poseKey.pose,
                shotTimeMs - poseKey.timeMs
              )
            }
          }
        }
      }

      const shotSource =
        shot && state.doc
          ? state.doc.cameras.find((camera) => camera.id === shot.cameraId)
          : undefined

      if (shot && shotSource && shotCameraRef.current) {
        const shotCamera = shotCameraRef.current
        const sample = sampleCameraTrack(shotSource, shot, shotTimeMs)
        shotCamera.position.fromArray(sample.position)
        shotCamera.fov = sample.fov
        shotCamera.aspect = aspectRef.current
        shotCamera.lookAt(new THREE.Vector3(...sample.target))
        shotCamera.updateProjectionMatrix()
        activeCameraRef.current = shotCamera
        if (cameraGroupRef.current) cameraGroupRef.current.visible = false
        if (selectionRef.current) selectionRef.current.visible = false
        if (transformHelperRef.current) transformHelperRef.current.visible = false
      } else {
        controls.update()
      }

      const camera = activeCameraRef.current
      if (camera) {
        groundRef.current?.setCameraPosition(camera.position)
        weatherRef.current?.update(performance.now(), camera.position)
        renderer.render(scene, camera)
      }
    })

    useStageStore.getState().registerCapture(() => {
      const camera = activeCameraRef.current
      if (!camera) return null
      renderer.render(scene, camera)
      return renderer.domElement.toDataURL('image/png')
    })

    useStageStore.getState().registerViewCapture(() => {
      const state = useStageStore.getState()
      if (state.viewMode === 'camera' && shotCameraRef.current) {
        const shotCamera = shotCameraRef.current
        const direction = new THREE.Vector3()
        shotCamera.getWorldDirection(direction)
        const target = shotCamera.position
          .clone()
          .add(direction.multiplyScalar(6))
        return {
          position: [
            shotCamera.position.x,
            shotCamera.position.y,
            shotCamera.position.z
          ],
          target: [target.x, target.y, target.z],
          fov: shotCamera.fov
        }
      }

      const director = directorCameraRef.current
      const controls = controlsRef.current
      if (!director || !controls) return null
      return {
        position: [director.position.x, director.position.y, director.position.z],
        target: [controls.target.x, controls.target.y, controls.target.z],
        fov: director.fov
      }
    })

    return () => {
      useStageStore.getState().registerCapture(null)
      useStageStore.getState().registerViewCapture(null)
      observer.disconnect()
      renderer.setAnimationLoop(null)
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointermove', onPointerMove)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      registerStagePathProjector(null)
      transform.removeEventListener('dragging-changed', onTransformDragging)
      transform.removeEventListener('objectChange', onTransformChange)
      transform.detach()
      transform.dispose()
      scene.remove(transformHelper)
      controls.dispose()
      groundRef.current?.dispose()
      groundRef.current = null
      disposeObject(objectsGroup)
      disposeObject(cameraGroup)
      renderer.dispose()
      renderer.domElement.remove()
      sceneRef.current = null
      rendererRef.current = null
      directorCameraRef.current = null
      shotCameraRef.current = null
      activeCameraRef.current = null
      controlsRef.current = null
      transformRef.current = null
      transformHelperRef.current = null
      objectsGroupRef.current = null
      cameraGroupRef.current = null
      selectionRef.current = null
      if (pathsGroupRef.current) {
        disposePathObject(pathsGroupRef.current)
        scene.remove(pathsGroupRef.current)
      }
      pathsGroupRef.current = null
      pathControlGroupRef.current = null
      pathMaterialsRef.current = []
    }
  }, [])

  // 场景对象与机位重建
  useEffect(() => {
    const scene = sceneRef.current
    const objectsGroup = objectsGroupRef.current
    const cameraGroup = cameraGroupRef.current
    if (!scene || !objectsGroup || !cameraGroup || !doc) return

    const lighting = resolveStageLighting(doc)
    const isPanorama = doc.background.kind === 'panorama' && Boolean(doc.background.value.trim())
    const background =
      doc.background.kind === 'color' && doc.background.value
        ? doc.background.value
        : lighting.background
    scene.background = isPanorama ? null : new THREE.Color(background)
    groundRef.current?.setBackground(background)

    if (panoramaRef.current) {
      scene.remove(panoramaRef.current)
      const old = panoramaRef.current
      old.geometry.dispose()
      const mat = old.material as THREE.MeshBasicMaterial
      if (mat.map) mat.map.dispose()
      mat.dispose()
      panoramaRef.current = null
    }
    if (isPanorama) {
      const geometry = new THREE.SphereGeometry(500, 64, 40)
      const material = new THREE.MeshBasicMaterial({ side: THREE.BackSide })
      const mesh = new THREE.Mesh(geometry, material)
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
      scene.add(mesh)
      panoramaRef.current = mesh
    }

    disposeObject(objectsGroup)
    objectsGroup.clear()
    disposeObject(cameraGroup)
    cameraGroup.clear()

    for (const object of doc.objects) {
      objectsGroup.add(createStageObject(object))
    }

    for (const camera of doc.cameras) {
      cameraGroup.add(
        createCameraMarker(
          camera,
          camera.id === (selectedCameraRef.current ?? doc.activeCameraId)
        )
      )
    }

    updateSelectionHelper()
    syncTransformControls()
    syncShotCamera()
  }, [doc])

  const updateSelectionHelper = (): void => {
    const scene = sceneRef.current
    const objectsGroup = objectsGroupRef.current
    if (!scene || !objectsGroup) return

    if (selectionRef.current) {
      scene.remove(selectionRef.current)
      selectionRef.current.geometry.dispose()
      ;(selectionRef.current.material as THREE.Material).dispose()
      selectionRef.current = null
    }

    const selectedId = useStageStore.getState().selectedObjectId
    if (!selectedId) return
    const target = objectsGroup.children.find(
      (child) => child.userData.stageObjectId === selectedId
    )
    if (!target) return

    const helper = new THREE.BoxHelper(target, SELECTED_COLOR)
    helper.visible = viewModeRef.current === 'director'
    scene.add(helper)
    selectionRef.current = helper
  }

  const syncTransformControls = (): void => {
    const transform = transformRef.current
    const helper = transformHelperRef.current
    const objectsGroup = objectsGroupRef.current
    if (!transform || !helper || !objectsGroup) return

    const state = useStageStore.getState()
    if (state.viewMode !== 'director' || !state.selectedObjectId) {
      transform.detach()
      helper.visible = false
      return
    }

    const target = objectsGroup.children.find(
      (child) => child.userData.stageObjectId === state.selectedObjectId
    )
    if (!target) {
      transform.detach()
      helper.visible = false
      return
    }

    transform.attach(target)
    transform.setMode(state.transformMode)
    helper.visible = true
  }

  const syncShotCamera = (): void => {
    const shot = shotCameraRef.current
    const currentDoc = useStageStore.getState().doc
    if (!shot || !currentDoc) return

    const cameraId =
      selectedCameraRef.current ??
      currentDoc.activeCameraId ??
      currentDoc.cameras[0]?.id
    const source = currentDoc.cameras.find((camera) => camera.id === cameraId)
    if (!source) return

    shot.position.fromArray(source.position)
    shot.fov = source.fov
    shot.aspect = aspectRef.current
    shot.lookAt(new THREE.Vector3(...source.target))
    shot.updateProjectionMatrix()
  }

  // 选中对象高亮与变换控件
  useEffect(() => {
    updateSelectionHelper()
    syncTransformControls()
  }, [selectedObjectId])

  // 变换模式
  useEffect(() => {
    transformRef.current?.setMode(transformMode)
  }, [transformMode])

  // 播放开始时隐藏编辑辅助；停止后恢复当前视角
  useEffect(() => {
    const director = directorCameraRef.current
    const shot = shotCameraRef.current
    const controls = controlsRef.current
    if (!director || !shot || !controls) return

    if (playing) {
      controls.enabled = false
      transformRef.current?.detach()
      if (transformHelperRef.current) transformHelperRef.current.visible = false
      if (cameraGroupRef.current) cameraGroupRef.current.visible = false
      if (selectionRef.current) selectionRef.current.visible = false
      return
    }

    const state = useStageStore.getState()
    const hasCamera = Boolean(
      state.doc?.cameras.some(
        (camera) => camera.id === (state.selectedCameraId ?? state.doc?.activeCameraId)
      )
    )
    const cameraMode = state.viewMode === 'camera' && hasCamera
    activeCameraRef.current = cameraMode ? shot : director
    controls.enabled = !cameraMode
    if (cameraGroupRef.current) cameraGroupRef.current.visible = !cameraMode
    syncTransformControls()
    syncShotCamera()
  }, [playing])

  // 机位标记选中色与当前相机
  useEffect(() => {
    const scene = sceneRef.current
    const cameraGroup = cameraGroupRef.current
    if (!scene || !cameraGroup || !doc) return

    disposeObject(cameraGroup)
    cameraGroup.clear()
    for (const camera of doc.cameras) {
      cameraGroup.add(
        createCameraMarker(
          camera,
          camera.id === (selectedCameraId ?? doc.activeCameraId)
        )
      )
    }
    syncShotCamera()
  }, [selectedCameraId, doc])

  // 视角切换
  useEffect(() => {
    const director = directorCameraRef.current
    const shot = shotCameraRef.current
    const controls = controlsRef.current
    const cameraGroup = cameraGroupRef.current
    if (!director || !shot || !controls) return

    const hasCamera = Boolean(
      doc?.cameras.some(
        (camera) =>
          camera.id === (selectedCameraId ?? doc.activeCameraId)
      )
    )
    const cameraMode = viewMode === 'camera' && hasCamera

    activeCameraRef.current = cameraMode ? shot : director
    controls.enabled = !cameraMode
    if (!cameraMode) {
      director.aspect = aspectRef.current
      director.updateProjectionMatrix()
    }
    if (cameraGroup) cameraGroup.visible = !cameraMode
    if (selectionRef.current) {
      selectionRef.current.visible = !cameraMode
    }
    syncTransformControls()
    syncShotCamera()
  }, [viewMode, selectedCameraId, doc])

  useEffect(() => {
    if (!doc) return
    const lighting = resolveStageLighting(doc)
    if (ambientRef.current) {
      ambientRef.current.color.set(lighting.ambient.color)
      ambientRef.current.intensity = lighting.ambient.intensity
    }
    if (hemiRef.current) {
      hemiRef.current.color.set(lighting.hemi.sky)
      hemiRef.current.groundColor.set(lighting.hemi.ground)
      hemiRef.current.intensity = lighting.hemi.intensity
    }
    if (sunRef.current) {
      sunRef.current.color.set(lighting.sun.color)
      sunRef.current.intensity = lighting.sun.intensity
      sunRef.current.position.set(...lighting.sun.position)
    }
    if (fillRef.current) {
      if (lighting.fill) {
        fillRef.current.color.set(lighting.fill.color)
        fillRef.current.intensity = lighting.fill.intensity
        fillRef.current.position.set(...lighting.fill.position)
      } else {
        fillRef.current.intensity = 0
      }
    }
    if (rendererRef.current) {
      rendererRef.current.toneMappingExposure = lighting.exposure
    }
    if (sceneRef.current && !panoramaRef.current) {
      sceneRef.current.background = new THREE.Color(lighting.background)
    }
    if (sceneRef.current) {
      if (weatherRef.current) {
        sceneRef.current.remove(weatherRef.current.object)
        weatherRef.current.dispose()
        weatherRef.current = null
      }
      if (lighting.weather) {
        const weather = createStageWeather(lighting.weather)
        weatherRef.current = weather
        sceneRef.current.add(weather.object)
      }
    }
  }, [doc])

  const disposePathObject = (object: THREE.Object3D): void => {
    object.traverse((child) => {
      const mesh = child as THREE.Mesh
      mesh.geometry?.dispose()
      const material = mesh.material
      if (Array.isArray(material)) {
        for (const item of material) item.dispose()
      } else {
        material?.dispose()
      }
    })
  }

  const syncPaths = (): void => {
    const group = pathsGroupRef.current
    if (!group) return
    for (const child of [...group.children]) {
      group.remove(child)
      disposePathObject(child)
    }
    pathMaterialsRef.current = []
    pathControlGroupRef.current = null

    const state = useStageStore.getState()
    const shot = state.doc?.shots.find(
      (item) => item.id === state.selectedShotId
    )
    const paths = shot?.paths ?? []
    const selectedId = state.selectedPathId

    const controlsGroup = new THREE.Group()
    controlsGroup.name = 'stage-path-controls'
    group.add(controlsGroup)
    pathControlGroupRef.current = controlsGroup

    for (const path of paths) {
      if (path.visible === false) continue
      const points = smoothPathPoints(path)
      if (points.length < 2) continue

      const geometry = new LineGeometry()
      geometry.setPositions(points.flat())
      const material = new LineMaterial({
        color: new THREE.Color(path.color ?? pathColor(path.kind)),
        linewidth: 3,
        transparent: true,
        opacity: selectedId === path.id ? 1 : 0.55,
        depthTest: false,
        depthWrite: false
      })
      material.resolution.set(
        hostRef.current?.clientWidth ?? 1,
        hostRef.current?.clientHeight ?? 1
      )
      const line = new Line2(geometry, material)
      line.computeLineDistances()
      line.frustumCulled = false
      line.renderOrder = 10
      line.userData.stagePathId = path.id
      group.add(line)
      pathMaterialsRef.current.push(material)

      if (selectedId === path.id) {
        const height = path.height ?? 0
        for (const point of simplifyPathPoints(points, 16)) {
          let nearest = 0
          let best = Infinity
          path.points.forEach((candidate, index) => {
            const distance = Math.hypot(
              candidate.position[0] - point[0],
              candidate.position[1] + height - point[1],
              candidate.position[2] - point[2]
            )
            if (distance < best) {
              best = distance
              nearest = index
            }
          })
          const sphere = new THREE.Mesh(
            new THREE.SphereGeometry(0.07, 10, 8),
            new THREE.MeshBasicMaterial({
              color: material.color,
              depthTest: false,
              depthWrite: false,
              transparent: true,
              opacity: 0.95
            })
          )
          sphere.position.fromArray(point)
          sphere.renderOrder = 11
          sphere.userData.stagePathId = path.id
          sphere.userData.stagePathPointIndex = nearest
          controlsGroup.add(sphere)
        }

        const timeKeys = path.timeKeys?.length
          ? path.timeKeys
          : [
              { at: 0 },
              { at: 1 }
            ]
        for (const key of timeKeys) {
          const node = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.06),
            new THREE.MeshBasicMaterial({
              color: '#fbbf24',
              depthTest: false,
              depthWrite: false,
              transparent: true,
              opacity: 0.95
            })
          )
          node.position.fromArray(positionAtT(points, key.at))
          node.renderOrder = 12
          node.userData.stagePathId = path.id
          controlsGroup.add(node)
        }
      }
    }

    group.visible = !state.playing && state.viewMode === 'director'
  }

  useEffect(() => {
    syncPaths()
  }, [doc, selectedShotId, selectedPathId, viewMode, playing])

  return <div ref={hostRef} className="absolute inset-0" />
}
