import {
  mediaFrameNodeSize,
  mediaFramePixels
} from '@shared/canvas-schema'
import { nodeSize, useCanvasStore } from '../stores/canvas'

export interface MediaSize {
  width?: number
  height?: number
}

export async function probeMediaSize(path: string): Promise<MediaSize | null> {
  try {
    const info = await window.api.media.probe(path)
    if (!info.width || !info.height) return null
    return { width: info.width, height: info.height }
  } catch {
    return null
  }
}

/**
 * 把媒体节点调整为标准/紧凑内容框，保持素材画幅。
 * 返回最终节点高度（含标题栏），无法调整时返回 null。
 */
export function fitNodeToMedia(
  nodeId: string,
  size: MediaSize | null
): number | null {
  if (!size?.width || !size?.height) return null

  const store = useCanvasStore.getState()
  const node = store.nodes.find((entry) => entry.id === nodeId)
  if (!node || node.type !== 'cine') return null
  if (node.data.kind !== 'image' && node.data.kind !== 'video') return null

  const frame = node.data.mediaFrame ?? 'standard'
  const next = mediaFrameNodeSize(
    size.width,
    size.height,
    mediaFramePixels(frame),
    node.data.kind as 'image' | 'video'
  )

  if (
    Math.abs(nodeSize(node).width - next.width) > 1 ||
    Math.abs(nodeSize(node).height - next.height) > 1
  ) {
    store.resizeNode(nodeId, next.height, next.width)
    if (node.parentId) store.syncGroupBounds(node.parentId)
  }

  return next.height
}
