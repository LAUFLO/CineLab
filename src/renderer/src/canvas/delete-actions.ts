import {
  isFilmNode,
  isGroupNode,
  isStudioNode,
  useCanvasStore,
  type CanvasNode,
  type FilmNode
} from '../stores/canvas'
import { useUIStore } from '../stores/ui'

interface DeleteTarget {
  ids: Set<string>
  nodes: CanvasNode[]
}

/** 选中项 + 分组子节点，保证嵌套剪辑室/成片也能被识别 */
function collectDeleteTarget(nodes: CanvasNode[]): DeleteTarget {
  const selected = nodes.filter((node) => node.selected)
  const ids = new Set(selected.map((node) => node.id))

  for (const group of selected.filter(isGroupNode)) {
    for (const child of nodes.filter((node) => node.parentId === group.id)) {
      ids.add(child.id)
    }
  }

  return { ids, nodes: nodes.filter((node) => ids.has(node.id)) }
}

/**
 * 统一删除入口：
 * - 剪辑室 + 成片：三选（取消 / 一起删除 / 保留成片）
 * - 成片：删除后清空剪辑室的 filmNodeId
 * - 分组：组及子节点一起删除
 */
export function requestDeleteSelection(): void {
  const state = useCanvasStore.getState()
  const target = collectDeleteTarget(state.nodes)
  if (target.ids.size === 0) return

  const studios = target.nodes.filter(isStudioNode)
  const films = target.nodes.filter(isFilmNode)

  const linkedFilms: FilmNode[] = []
  for (const studio of studios) {
    if (!studio.data.filmNodeId) continue
    const film = state.nodes.find((node) => node.id === studio.data.filmNodeId)
    if (film && isFilmNode(film)) linkedFilms.push(film)
  }

  const requestConfirm = useUIStore.getState().requestConfirm
  const showToast = useUIStore.getState().showToast

  if (linkedFilms.length > 0) {
    requestConfirm({
      title: '删除剪辑室',
      message: `确定删除 ${studios.length} 个剪辑室吗？成片会保留为普通视频节点；也可以一起删除。`,
      confirmLabel: '保留成片',
      onConfirm: () => {
        const current = useCanvasStore.getState()
        const next = collectDeleteTarget(current.nodes)

        for (const film of linkedFilms) {
          current.convertFilmToMedia(film.id, true)
          next.ids.delete(film.id)
        }

        current.removeNodesByIds([...next.ids])
        showToast(`已删除 ${next.ids.size} 个节点，成片已保留`)
      },
      secondaryLabel: '一起删除',
      secondaryDanger: true,
      onSecondary: () => {
        const current = useCanvasStore.getState()
        const next = collectDeleteTarget(current.nodes)
        for (const film of linkedFilms) next.ids.add(film.id)
        current.removeNodesByIds([...next.ids])
        showToast(`已删除 ${next.ids.size} 个节点`)
      }
    })
    return
  }

  requestConfirm({
    title: target.nodes.some(isGroupNode)
      ? '删除组及组内节点'
      : '删除节点',
    message: target.nodes.some(isGroupNode)
      ? `确定删除选中的 ${target.ids.size} 个节点吗？组内子节点会一起删除。`
      : `确定删除选中的 ${target.ids.size} 个节点吗？此操作不可撤销。`,
    confirmLabel: '删除',
    danger: true,
    onConfirm: () => {
      const current = useCanvasStore.getState()
      const next = collectDeleteTarget(current.nodes)
      const nextFilms = next.nodes.filter(isFilmNode)

      if (nextFilms.length > 0) {
        for (const studio of current.nodes.filter(isStudioNode)) {
          if (
            studio.data.filmNodeId &&
            nextFilms.some((film) => film.id === studio.data.filmNodeId)
          ) {
            current.patchStudioNode(studio.id, { filmNodeId: undefined })
          }
        }
      }

      const count = current.removeNodesByIds([...next.ids])
      showToast(`已删除 ${count} 个节点`)
    }
  })
}
