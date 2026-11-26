import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import type { StageCamera, StageShot } from '@shared/stage-schema'
import { sampleCameraTrack } from '@shared/stage-timeline'
import { buildProgramTimeline, programAt } from '@shared/stage-program'
import { resolveStageLighting } from '@shared/stage-lighting'
import { isStagePoseName } from '@shared/stage-motions'
import { applyStageFigurePose } from './stage-figure'
import {
  createStageObject,
  disposeObject3D as disposeObject
} from './stage-scene'
import { createStageGround, type StageGround } from './stage-ground'
import { useStageStore } from './stageStore'
import { assetUrl } from '../lib/asset-url'

const DEFAULT_BACKGROUND = '#1a1a1a'
const SELECTED_COLOR = '#4ade80'
const FALLBACK_ASPECT = 16 / 9

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

  const color = selected ? SELECTED_COLOR : '#f59e0b'
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 16, 12),
    new THREE.MeshStandardMaterial({ color })
  )
  group.add(marker)

  const lineGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(...camera.position),
    new THREE.Vector3(...camera.target)
  ])
  const line = new THREE.Line(
    lineGeometry,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 })
  )
  group.add(line)

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

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let downX = 0
    let downY = 0

    const onPointerDown = (event: PointerEvent): void => {
      downX = event.clientX
      downY = event.clientY
    }

    const onPointerUp = (event: PointerEvent): void => {
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

      if (shot) {
        for (const track of shot.actionTracks ?? []) {
          const group = objectsGroup.children.find(
            (child) => child.userData.stageObjectId === track.objectId
          )
          if (!(group instanceof THREE.Group)) continue
          const keys = [...track.keys].sort((a, b) => a.timeMs - b.timeMs)
          let key = keys[0]
          for (const candidate of keys) {
            if (candidate.timeMs <= shotTimeMs) key = candidate
          }
          if (key?.pose && isStagePoseName(key.pose)) {
            const figure = group.children.find(
              (child) => child.name === 'stageFigure'
            )
            if (figure instanceof THREE.Group) {
              applyStageFigurePose(
                figure,
                key.pose,
                shotTimeMs - (key.timeMs ?? 0)
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
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
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
  }, [doc])

  return <div ref={hostRef} className="absolute inset-0" />
}
