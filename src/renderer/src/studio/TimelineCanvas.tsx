import { useEffect, useRef, useState } from 'react'
import type { TimelineDoc } from '@shared/timeline-schema'
import { assetUrl } from '../lib/asset-url'
import { createPools, MEDIA_READY_EVENT, renderTimeline } from './renderer'

export interface TimelineCanvasProps {
  doc: TimelineDoc
  timeMs: number
  playing?: boolean
  /** 绘制分辨率比例，默认 1；节点预览传 0.25~0.5 */
  renderScale?: number
  className?: string
}

/**
 * 无 store 依赖的时间线渲染组件。
 * 通过把 canvas 尺寸设为 doc.video × renderScale 实现低分辨率绘制，
 * renderTimeline 内部会按 canvas 尺寸等比缩放所有内容（含文字）。
 */
export function TimelineCanvas({
  doc,
  timeMs,
  playing = false,
  renderScale = 1,
  className
}: TimelineCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const poolsRef = useRef(createPools())
  const [proxyVersion, setProxyVersion] = useState(0)
  const [mediaVersion, setMediaVersion] = useState(0)

  useEffect(() => {
    const onReady = (): void => setMediaVersion((value) => value + 1)
    window.addEventListener(MEDIA_READY_EVENT, onReady)
    return () => window.removeEventListener(MEDIA_READY_EVENT, onReady)
  }, [])

  const proxySignature = doc.clips
    .filter((clip) => clip.kind === 'video' && clip.media)
    .map((clip) => `${clip.id}:${clip.media!.scope}:${clip.media!.path}`)
    .join('|')

  // 后台生成 540p 代理后切换视频源
  useEffect(() => {
    let cancelled = false
    const pools = poolsRef.current
    for (const clip of doc.clips) {
      if (clip.kind !== 'video' || !clip.media) continue
      if (pools.proxies.has(clip.id)) continue
      void window.api.media
        .proxy(clip.media.path)
        .then((proxy) => {
          if (cancelled || !proxy) return
          pools.proxies.set(clip.id, assetUrl(proxy, 'project'))
          pools.failed.delete(clip.id)
          pools.videos.delete(clip.id)
          setProxyVersion((value) => value + 1)
        })
        .catch(() => undefined)
    }
    return () => {
      cancelled = true
    }
    // 只按素材集合触发，片段位置变化不重复请求
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proxySignature])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const width = Math.max(1, Math.round(doc.video.width * renderScale))
    const height = Math.max(1, Math.round(doc.video.height * renderScale))
    if (canvas.width !== width) canvas.width = width
    if (canvas.height !== height) canvas.height = height

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    renderTimeline({
      ctx,
      doc,
      timeMs,
      pools: poolsRef.current,
      playing
    })
  }, [doc, timeMs, playing, renderScale, proxyVersion, mediaVersion])

  // 卸载时释放解码器
  useEffect(() => {
    const pools = poolsRef.current
    return () => {
      for (const video of pools.videos.values()) {
        video.pause()
        video.removeAttribute('src')
        video.load()
      }
      pools.videos.clear()
      pools.proxies.clear()
      pools.failed.clear()
    }
  }, [])

  return <canvas ref={canvasRef} className={className} />
}
