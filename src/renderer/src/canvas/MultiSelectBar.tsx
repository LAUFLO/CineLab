import { useLayoutEffect, useMemo, useState } from 'react'
import type { SaveAssetInput } from '@shared/library-schema'
import { Icon } from '../components/Icon'
import { useCanvasStore } from '../stores/canvas'
import { useLibraryStore } from '../stores/library'
import { useUIStore } from '../stores/ui'

export function MultiSelectBar() {
  const nodes = useCanvasStore((state) => state.nodes)
  const duplicateSelection = useCanvasStore((state) => state.duplicateSelection)
  const removeSelection = useCanvasStore((state) => state.removeSelection)
  const showToast = useUIStore((state) => state.showToast)
  const requestConfirm = useUIStore((state) => state.requestConfirm)

  const selected = useMemo(
    () => nodes.filter((node) => node.selected),
    [nodes]
  )
  const selectionKey = selected.map((node) => node.id).join('|')

  const [position, setPosition] = useState<{ left: number; top: number } | null>(
    null
  )

  useLayoutEffect(() => {
    if (selected.length < 2) {
      setPosition(null)
      return
    }

    const update = (): void => {
      const elements = selected
        .map((node) =>
          document.querySelector<HTMLElement>(`[data-id="${node.id}"]`)
        )
        .filter((element): element is HTMLElement => Boolean(element))

      if (elements.length === 0) return

      const rects = elements.map((element) => element.getBoundingClientRect())
      const left = Math.min(...rects.map((rect) => rect.left))
      const right = Math.max(...rects.map((rect) => rect.right))
      const top = Math.min(...rects.map((rect) => rect.top))

      setPosition({
        left: (left + right) / 2,
        top: Math.max(52, top - 56)
      })
    }

    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [selectionKey, nodes])

  if (selected.length < 2 || !position) return null

  const paths = (): SaveAssetInput[] => {
    const unique = new Map<string, SaveAssetInput>()

    for (const node of selected) {
      const outputs = node.data.outputs ?? []
      const current =
        outputs.find((item) => item.id === node.data.selectedOutputId) ??
        outputs[0]
      if (!current?.path) continue

      const key = `${current.scope ?? 'project'}:${current.path}`
      if (!unique.has(key)) {
        unique.set(key, {
          path: current.path,
          scope: current.scope,
          name: node.data.title
        })
      }
    }

    return [...unique.values()]
  }

  const saveToLibrary = (): void => {
    const list = paths()
    if (list.length === 0) {
      showToast('选中节点没有可保存的素材', 'error')
      return
    }

    useLibraryStore.getState().openPicker(
      list.map((item) => ({
        sourcePath: item.path,
        scope: item.scope ?? 'project',
        name: item.name ?? '素材'
      }))
    )
  }

  const duplicate = (): void => {
    const count = duplicateSelection()
    if (count > 0) showToast(`已创建 ${count} 个副本`)
  }

  const exportAssets = async (): Promise<void> => {
    const list = paths()
    if (list.length === 0) {
      showToast('选中节点没有可导出的素材', 'error')
      return
    }

    const result = await window.api.export.assets(list, 'CineLab-选中素材')
    if (result.ok) {
      showToast(`已导出：${result.path ?? ''}`)
    } else if (!result.canceled) {
      showToast(result.error ?? '导出失败', 'error')
    }
  }

  const remove = (): void => {
    requestConfirm({
      title: '删除节点',
      message: `确定删除选中的 ${selected.length} 个节点吗？此操作不可撤销。`,
      confirmLabel: '删除',
      danger: true,
      onConfirm: () => {
        const count = removeSelection()
        if (count > 0) showToast(`已删除 ${count} 个节点`)
      }
    })
  }

  return (
    <div
      className="multi-bar nodrag nopan"
      style={{ left: position.left, top: position.top }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="multi-bar__btn"
        onClick={() => void saveToLibrary()}
      >
        <Icon name="folder" size={14} />
        <span>保存到资产</span>
      </button>

      <button type="button" className="multi-bar__btn" onClick={duplicate}>
        <Icon name="plus" size={14} />
        <span>创建副本</span>
      </button>

      <button
        type="button"
        className="multi-bar__btn"
        onClick={() => void exportAssets()}
      >
        <Icon name="download" size={14} />
        <span>导出选中</span>
      </button>

      <div className="multi-bar__divider" />

      <button type="button" className="multi-bar__btn" onClick={remove}>
        <Icon name="close" size={14} />
        <span>删除</span>
      </button>
    </div>
  )
}
