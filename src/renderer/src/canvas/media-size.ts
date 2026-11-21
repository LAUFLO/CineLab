import { NODE_META, TITLE_HEIGHT } from '@shared/canvas-schema'
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
 * 按素材宽高比调整节点高度，宽度保持不变。
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

  const width = nodeSize(node).width || NODE_META[node.data.kind].width
  const proposed =
    Math.round((width * size.height) / size.width) + TITLE_HEIGHT
  const height = Math.max(160, Math.min(proposed, 960))

  if (Math.abs(nodeSize(node).height - height) > 1) {
    store.resizeNode(nodeId, height)
    if (node.parentId) store.syncGroupBounds(node.parentId)
  }

  return height
}
