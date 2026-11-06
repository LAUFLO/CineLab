import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { SaveAssetInput } from '@shared/library-schema'
import { Icon } from '../components/Icon'
import { isGroupNode, useCanvasStore } from '../stores/canvas'
import { useLibraryStore } from '../stores/library'
import { useUIStore } from '../stores/ui'

export function MultiSelectBar() {
  const nodes = useCanvasStore((state) => state.nodes)
  const duplicateSelection = useCanvasStore((state) => state.duplicateSelection)
  const removeSelection = useCanvasStore((state) => state.removeSelection)
  const groupSelection = useCanvasStore((state) => state.groupSelection)
  const mergeSelection = useCanvasStore((state) => state.mergeSelection)
  const createStoryboard = useCanvasStore((state) => state.createStoryboard)
  const showToast = useUIStore((state) => state.showToast)
  const requestConfirm = useUIStore((state) => state.requestConfirm)
  const viewport = useCanvasStore((state) => state.viewport)

  const selected = useMemo(
    () => nodes.filter((node) => node.selected),
    [nodes]
  )
  const selectionKey = selected.map((node) => node.id).join('|')

  const [position, setPosition] = useState<{ left: number; top: number } | null>(
    null
  )
  const [groupMenuOpen, setGroupMenuOpen] = useState(false)
  const groupMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!groupMenuOpen) return
    const onPointerDown = (event: PointerEvent): void => {
      if (
        groupMenuRef.current &&
        event.target instanceof Node &&
        !groupMenuRef.current.contains(event.target)
      ) {
        setGroupMenuOpen(false)
      }
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [groupMenuOpen])

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

      // 多选包围框在节点外扩 10px，工具栏与框留 14px，再减去工具栏高度。
      setPosition({
        left: (left + right) / 2,
        top: Math.max(56, top - 66)
      })
    }

    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [selectionKey, nodes, viewport])

  if (selected.length < 2 || !position) return null

  const paths = (): SaveAssetInput[] => {
    const unique = new Map<string, SaveAssetInput>()

    for (const node of selected) {
      if (isGroupNode(node)) continue
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

  const looseCount = selected.filter(
    (node) => !isGroupNode(node) && !node.parentId
  ).length
  const groupCount = selected.filter(isGroupNode).length
  const canGroup = looseCount >= 2
  const canMerge = groupCount >= 2 || (groupCount >= 1 && looseCount >= 1)
  const canStoryboard =
    selected.length >= 2 &&
    selected.length <= 25 &&
    selected.every(
      (node) =>
        !isGroupNode(node) &&
        !node.parentId &&
        node.data.kind === 'image'
    )

  const group = (): void => {
    const id = groupSelection()
    if (id) showToast('已创建分组')
  }

  const storyboard = (): void => {
    const id = createStoryboard()
    if (id) showToast('已创建分镜组')
    else showToast('分镜组仅支持 2-25 个图片节点', 'error')
  }

  const merge = (): void => {
    const id = mergeSelection()
    if (id) showToast('已合并分组')
  }

  const remove = (): void => {
    const hasGroup = groupCount > 0
    const groupIds = selected.filter(isGroupNode).map((node) => node.id)
    const childCount = nodes.filter(
      (node) => node.parentId && groupIds.includes(node.parentId)
    ).length
    requestConfirm({
      title: hasGroup ? '删除组及组内节点' : '删除节点',
      message: hasGroup
        ? `确定删除选中的 ${groupCount} 个分组及其 ${childCount} 个子节点吗？此操作不可撤销。`
        : `确定删除选中的 ${selected.length} 个节点吗？此操作不可撤销。`,
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
      {canGroup ? (
        canStoryboard ? (
          <div className="multi-bar__menu-wrap" ref={groupMenuRef}>
            <button
              type="button"
              className={`multi-bar__btn ${groupMenuOpen ? 'is-open' : ''}`}
              onClick={() => setGroupMenuOpen((open) => !open)}
            >
              <Icon name="layers" size={14} />
              <span>打组</span>
              <Icon name="chevron-down" size={12} />
            </button>
            {groupMenuOpen ? (
              <div className="multi-bar__pop">
                <button
                  type="button"
                  className="multi-bar__pop-item"
                  onClick={() => {
                    group()
                    setGroupMenuOpen(false)
                  }}
                >
                  打组
                </button>
                <button
                  type="button"
                  className="multi-bar__pop-item"
                  onClick={() => {
                    storyboard()
                    setGroupMenuOpen(false)
                  }}
                >
                  合并分镜组
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <button type="button" className="multi-bar__btn" onClick={group}>
            <Icon name="layers" size={14} />
            <span>打组</span>
          </button>
        )
      ) : null}

      {canMerge ? (
        <button type="button" className="multi-bar__btn" onClick={merge}>
          <Icon name="layers" size={14} />
          <span>合并分组</span>
        </button>
      ) : null}

      {canGroup || canMerge ? <div className="multi-bar__divider" /> : null}

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
