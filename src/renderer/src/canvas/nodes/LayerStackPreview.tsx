import { useEffect, useRef } from 'react'
import { drawLayerGroup, type LayerGroup } from './layer-compose'

interface LayerStackPreviewProps {
  group: LayerGroup
}

export function LayerStackPreview({ group }: LayerStackPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef<HTMLCanvasElement | null>(null)
  const cacheRef = useRef(new Map<string, Promise<HTMLImageElement>>())
  const tokenRef = useRef(0)
  const signature = group.layers
    .map(
      (layer) =>
        `${layer.id}:${layer.layerTransform?.x ?? 0}:${
          layer.layerTransform?.y ?? 0
        }:${layer.layerTransform?.width ?? 0}:${
          layer.layerTransform?.height ?? 0
        }:${layer.layerAttached === false ? 0 : 1}:${
          layer.layerVisible === false ? 0 : 1
        }`
    )
    .join('|')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (canvas.width !== group.width) canvas.width = group.width
    if (canvas.height !== group.height) canvas.height = group.height

    const offscreen = frameRef.current ?? document.createElement('canvas')
    frameRef.current = offscreen
    if (offscreen.width !== group.width) offscreen.width = group.width
    if (offscreen.height !== group.height) offscreen.height = group.height

    const token = ++tokenRef.current
    const draw = async (): Promise<void> => {
      // 先画到离屏画布，完成后再一次性替换显示画布；
      // 旧帧不会在异步加载期间被清空，拖动时不会闪成纯色。
      await drawLayerGroup(offscreen, group, {
        cache: cacheRef.current,
        shouldAbort: () => token !== tokenRef.current
      })
      if (token !== tokenRef.current) return
      const context = canvas.getContext('2d')
      if (!context) return
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.drawImage(offscreen, 0, 0)
    }
    void draw().catch(() => undefined)

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.base.id, group.groupId, group.width, group.height, signature])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none h-full w-full rounded-card object-contain"
      aria-label="图层合成预览"
    />
  )
}
