import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as THREE from 'three'
import { Icon } from '../../components/Icon'
import { Button } from '../../components/ui'

interface PanoramaViewerProps {
  open: boolean
  src: string
  onClose: () => void
  onUseInStage?: () => void
}

const SPHERE_RADIUS = 500

export function PanoramaViewer({ open, src, onClose, onUseInStage }: PanoramaViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    const host = hostRef.current
    if (!host) return

    setLoading(true)
    setError(null)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 2000)
    const geometry = new THREE.SphereGeometry(SPHERE_RADIUS, 64, 40)
    const material = new THREE.MeshBasicMaterial({ side: THREE.BackSide })
    const mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    host.appendChild(renderer.domElement)
    renderer.domElement.className =
      'block h-full w-full cursor-grab active:cursor-grabbing'

    const textureLoader = new THREE.TextureLoader()
    let texture: THREE.Texture | null = null

    textureLoader.load(
      src,
      (loaded) => {
        loaded.colorSpace = THREE.SRGBColorSpace
        loaded.minFilter = THREE.LinearFilter
        loaded.generateMipmaps = false
        texture = loaded
        material.map = loaded
        material.needsUpdate = true
        setLoading(false)
      },
      undefined,
      () => {
        setLoading(false)
        setError('全景图加载失败，请确认素材文件仍然存在')
      }
    )

    let lon = 0
    let lat = 0
    let fov = 75
    let dragging = false
    let lastX = 0
    let lastY = 0
    let disposed = false

    const updateCamera = (): void => {
      const phi = THREE.MathUtils.degToRad(90 - lat)
      const theta = THREE.MathUtils.degToRad(lon)
      camera.position.x = SPHERE_RADIUS * Math.sin(phi) * Math.cos(theta)
      camera.position.y = SPHERE_RADIUS * Math.cos(phi)
      camera.position.z = SPHERE_RADIUS * Math.sin(phi) * Math.sin(theta)
      camera.lookAt(0, 0, 0)
      camera.fov = fov
      camera.updateProjectionMatrix()
    }

    const resize = (): void => {
      const width = host.clientWidth
      const height = host.clientHeight
      if (width === 0 || height === 0) return
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }

    const onPointerDown = (event: PointerEvent): void => {
      dragging = true
      lastX = event.clientX
      lastY = event.clientY
      renderer.domElement.setPointerCapture(event.pointerId)
    }

    const onPointerMove = (event: PointerEvent): void => {
      if (!dragging) return
      const deltaX = event.clientX - lastX
      const deltaY = event.clientY - lastY
      lastX = event.clientX
      lastY = event.clientY
      lon -= deltaX * 0.16
      lat = THREE.MathUtils.clamp(lat + deltaY * 0.16, -85, 85)
      updateCamera()
    }

    const onPointerUp = (event: PointerEvent): void => {
      dragging = false
      if (renderer.domElement.hasPointerCapture(event.pointerId)) {
        renderer.domElement.releasePointerCapture(event.pointerId)
      }
    }

    const onWheel = (event: WheelEvent): void => {
      event.preventDefault()
      fov = THREE.MathUtils.clamp(fov + event.deltaY * 0.05, 28, 100)
      updateCamera()
    }

    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('pointerup', onPointerUp)
    renderer.domElement.addEventListener('pointercancel', onPointerUp)
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false })

    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()
    updateCamera()

    renderer.setAnimationLoop(() => {
      if (!disposed) renderer.render(scene, camera)
    })

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      disposed = true
      document.removeEventListener('keydown', onKeyDown)
      observer.disconnect()
      renderer.setAnimationLoop(null)
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointermove', onPointerMove)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      renderer.domElement.removeEventListener('pointercancel', onPointerUp)
      renderer.domElement.removeEventListener('wheel', onWheel)
      texture?.dispose()
      geometry.dispose()
      material.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [open, src, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[260] overflow-hidden bg-media-bg">
      <div ref={hostRef} className="absolute inset-0" />

      <div className="pointer-events-none absolute top-[18px] right-5 left-5 z-[2] flex items-center justify-between">
        <div className="text-[13px] tracking-[0.04em] text-white/80">
          720 度全景预览
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          {onUseInStage ? (
            <Button
              type="button"
              variant="secondary"
              size="none"
              className="!h-[34px] !rounded-md !border !border-white/24 !bg-black/55 !px-3.5 !text-xs !font-normal !text-white hover:!bg-black/70 hover:!text-white"
              onClick={onUseInStage}
            >
              在导演台中使用
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="none"
            className="h-[34px] w-[34px] !rounded-md border border-white/20 !bg-black/45 !text-white hover:!bg-black/70 hover:!text-white"
            title="退出全景"
            onClick={onClose}
          >
            <Icon name="close" size={16} />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="absolute top-1/2 left-1/2 z-[2] -translate-x-1/2 -translate-y-1/2 rounded-card bg-black/60 px-3.5 py-2 text-xs text-white/75">
          正在加载全景图…
        </div>
      ) : null}
      {error ? (
        <div className="absolute top-1/2 left-1/2 z-[2] -translate-x-1/2 -translate-y-1/2 rounded-card bg-black/60 px-3.5 py-2 text-xs text-danger">
          {error}
        </div>
      ) : null}

      <div className="pointer-events-none absolute bottom-5 left-1/2 z-[2] -translate-x-1/2 rounded-pill bg-black/45 px-3 py-1.5 text-[11px] text-white/55">
        拖拽旋转视角 · 滚轮缩放 · ESC 退出
      </div>
    </div>,
    document.body
  )
}
