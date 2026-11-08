import { useEffect } from 'react'
import {
  isStudioNode,
  useCanvasStore
} from '../stores/canvas'
import { upstreamSignature } from '../studio/references'

/**
 * 画布层监听上游输出变化：
 * 即使剪辑室没有打开，只要引用的节点产生了新 output，就把成片标记为 stale。
 */
export function UpstreamWatcher() {
  const nodes = useCanvasStore((state) => state.nodes)

  useEffect(() => {
    const state = useCanvasStore.getState()

    for (const studio of state.nodes.filter(isStudioNode)) {
      const references = studio.data.references
      if (!references || Object.keys(references).length === 0) continue
      if (studio.data.filmStatus !== 'ready') continue
      if (!studio.data.upstreamAck) continue

      const signature = upstreamSignature(references, state.nodes)
      if (signature !== studio.data.upstreamAck) {
        state.setStudioFilmStatus(studio.id, 'stale')
      }
    }
  }, [nodes])

  return null
}
