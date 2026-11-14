import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as THREE from 'three'
import { Icon } from '../../components/Icon'
import { Button } from '../../components/ui'

interface PanoramaViewerProps {
  open: boolean
  src: string
  onClose: () => void
}

const SPHERE_RADIUS = 500

export function PanoramaViewer({ open, src, onClose }: PanoramaViewerProps) {
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
    renderer.domElement.className = 'panorama-viewer__canvas'

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
    <div className="panorama-viewer">
      <div ref={hostRef} className="panorama-viewer__host" />

      <div className="panorama-viewer__head">
        <div className="panorama-viewer__title">720 度全景预览</div>
        <Button
          type="button"
          className="panorama-viewer__close"
          title="退出全景"
          onClick={onClose}
          unstyled
        >
          <Icon name="close" size={16} />
        </Button>
      </div>

      {loading ? (
        <div className="panorama-viewer__status">正在加载全景图…</div>
      ) : null}
      {error ? (
        <div className="panorama-viewer__status is-error">{error}</div>
      ) : null}

      <div className="panorama-viewer__hint">
        拖拽旋转视角 · 滚轮缩放 · ESC 退出
      </div>
    </div>,
    document.body
  )
}
