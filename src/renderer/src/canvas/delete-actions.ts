import {
  isGroupNode,
  isStudioNode,
  useCanvasStore,
  type CanvasNode
} from '../stores/canvas'
import { useUIStore } from '../stores/ui'

interface DeleteTarget {
  ids: Set<string>
  nodes: CanvasNode[]
}

/** 选中项 + 分组子节点，保证嵌套节点也能被识别 */
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
 * - 剪辑室有成片：二选（取消 / 一起删除 / 保留成片为视频节点）
 * - 分组：组及子节点一起删除
 */
export function requestDeleteSelection(): void {
  const state = useCanvasStore.getState()
  const target = collectDeleteTarget(state.nodes)
  if (target.ids.size === 0) return

  const studios = target.nodes.filter(isStudioNode)
  const withOutputs = studios.filter(
    (studio) => (studio.data.outputs?.length ?? 0) > 0
  )

  const requestConfirm = useUIStore.getState().requestConfirm
  const showToast = useUIStore.getState().showToast

  if (withOutputs.length > 0) {
    requestConfirm({
      title: '删除剪辑室',
      message: `确定删除 ${studios.length} 个剪辑室吗？成片会保留为普通视频节点；也可以一起删除。`,
      confirmLabel: '保留成片',
      onConfirm: () => {
        const current = useCanvasStore.getState()
        const next = collectDeleteTarget(current.nodes)

        for (const studio of withOutputs) {
          current.detachStudioOutput(studio.id)
        }

        current.removeNodesByIds([...next.ids])
        showToast(`已删除 ${next.ids.size} 个节点，成片已保留`)
      },
      secondaryLabel: '一起删除',
      secondaryDanger: true,
      onSecondary: () => {
        const current = useCanvasStore.getState()
        const next = collectDeleteTarget(current.nodes)
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
      const count = current.removeNodesByIds([...next.ids])
      showToast(`已删除 ${count} 个节点`)
    }
  })
}
