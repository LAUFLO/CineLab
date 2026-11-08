import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { SaveAssetInput } from '@shared/library-schema'
import { Icon } from '../components/Icon'
import { isGroupNode, useCanvasStore } from '../stores/canvas'
import { useStudioStore } from '../stores/studio'
import { useLibraryStore } from '../stores/library'
import { useUIStore } from '../stores/ui'
import { duplicateSelectionDeep } from './context-actions'
import { requestDeleteSelection } from './delete-actions'
import { createStudioFromNodes } from '../studio/nodes'

export function MultiSelectBar() {
  const nodes = useCanvasStore((state) => state.nodes)
  const groupSelection = useCanvasStore((state) => state.groupSelection)
  const mergeSelection = useCanvasStore((state) => state.mergeSelection)
  const createStoryboard = useCanvasStore((state) => state.createStoryboard)
  const showToast = useUIStore((state) => state.showToast)
  const openStudio = useStudioStore((state) => state.openStudio)
  const studioOpen = useStudioStore((state) => state.open)
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

  if (studioOpen || selected.length < 2 || !position) return null

  const paths = (): SaveAssetInput[] => {
    const unique = new Map<string, SaveAssetInput>()

    for (const node of selected) {
      if (isGroupNode(node)) continue
      if (node.type !== 'cine' && node.type !== 'film') continue
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
    void duplicateSelectionDeep()
      .then((count) => {
        if (count > 0) showToast(`已创建 ${count} 个副本`)
        else showToast('选中的节点不支持创建副本', 'error')
      })
      .catch((error: unknown) => {
        showToast(
          error instanceof Error ? error.message : String(error),
          'error'
        )
      })
  }

  const makeStudio = (): void => {
    const studioId = createStudioFromNodes(selected.map((node) => node.id))
    if (!studioId) {
      showToast('选中的节点没有可送入剪辑室的素材', 'error')
      return
    }
    openStudio(studioId)
    showToast('已创建剪辑室并送入素材')
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

  const canStudio = selected.some((node) => {
    if (isGroupNode(node)) {
      return nodes.some(
        (child) =>
          child.parentId === node.id &&
          (child.type === 'cine' || child.type === 'film')
      )
    }
    return node.type === 'cine' || node.type === 'film'
  })

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
    requestDeleteSelection()
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

      {canStudio ? (
        <button type="button" className="multi-bar__btn" onClick={makeStudio}>
          <Icon name="film" size={14} />
          <span>剪辑室</span>
        </button>
      ) : null}

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
