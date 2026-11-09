import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import type { StageCamera } from '@shared/stage-schema'
import { sampleCameraTrack } from '@shared/stage-timeline'
import {
  createStageObject,
  disposeObject3D as disposeObject
} from './stage-scene'
import { useStageStore } from './stageStore'

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
  const controlsRef = useRef<OrbitControls | null>(null)
  const transformRef = useRef<TransformControls | null>(null)
  const transformHelperRef = useRef<THREE.Object3D | null>(null)
  const objectsGroupRef = useRef<THREE.Group | null>(null)
  const cameraGroupRef = useRef<THREE.Group | null>(null)
  const selectionRef = useRef<THREE.BoxHelper | null>(null)
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
    scene.background = new THREE.Color(DEFAULT_BACKGROUND)
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
    renderer.domElement.className = 'stage-viewport__canvas'
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

    const ambient = new THREE.AmbientLight(0xffffff, 1.4)
    scene.add(ambient)
    const directional = new THREE.DirectionalLight(0xffffff, 1.8)
    directional.position.set(6, 10, 4)
    scene.add(directional)

    const grid = new THREE.GridHelper(40, 40, 0x555555, 0x2a2a2a)
    scene.add(grid)
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshStandardMaterial({
        color: 0x18181b,
        roughness: 1,
        metalness: 0
      })
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -0.01
    scene.add(floor)

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
      const shot =
        state.playing && state.selectedShotId
          ? state.doc?.shots.find((item) => item.id === state.selectedShotId)
          : undefined
      const shotSource =
        shot && state.doc
          ? state.doc.cameras.find((camera) => camera.id === shot.cameraId)
          : undefined

      if (shot && shotSource && shotCameraRef.current) {
        const shotCamera = shotCameraRef.current
        const sample = sampleCameraTrack(
          shotSource,
          shot,
          state.playbackMs
        )
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
      if (camera) renderer.render(scene, camera)
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
      disposeObject(objectsGroup)
      disposeObject(cameraGroup)
      grid.geometry.dispose()
      const gridMaterial = grid.material
      if (Array.isArray(gridMaterial)) {
        gridMaterial.forEach((material) => material.dispose())
      } else {
        gridMaterial.dispose()
      }
      floor.geometry.dispose()
      ;(floor.material as THREE.Material).dispose()
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

    scene.background = new THREE.Color(
      doc.background.kind === 'color' && doc.background.value
        ? doc.background.value
        : DEFAULT_BACKGROUND
    )

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

  return <div ref={hostRef} className="stage-viewport" />
}
