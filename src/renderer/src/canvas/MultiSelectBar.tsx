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
import { Button, Popover } from '../components/ui'

const BTN_CLASS = 'h-8 gap-1.5 rounded-card px-2.5 text-[13px] !font-normal'

export function MultiSelectBar() {
  const nodes = useCanvasStore((state) => state.nodes)
  const groupSelection = useCanvasStore((state) => state.groupSelection)
  const mergeSelection = useCanvasStore((state) => state.mergeSelection)
  const createStoryboard = useCanvasStore((state) => state.createStoryboard)
  const showToast = useUIStore((state) => state.showToast)
  const openStudio = useStudioStore((state) => state.openStudio)
  const studioOpen = useStudioStore((state) => state.open)
  const viewport = useCanvasStore((state) => state.viewport)

  const selected = useMemo(() => nodes.filter((node) => node.selected), [nodes])
  const selectionKey = selected.map((node) => node.id).join('|')

  const [position, setPosition] = useState<{
    left: number
    top: number
  } | null>(null)
  const [groupMenuOpen, setGroupMenuOpen] = useState(false)
  const groupTriggerRef = useRef<HTMLButtonElement>(null)

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
        !isGroupNode(node) && !node.parentId && node.data.kind === 'image'
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
      className="fixed z-[90] flex h-[42px] -translate-x-1/2 items-center gap-0.5 whitespace-nowrap rounded-card border border-border bg-surface px-1.5 shadow-float animate-[menu-in_120ms_ease-out] nodrag nopan"
      style={{ left: position.left, top: position.top }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {canGroup ? (
        canStoryboard ? (
          <div>
            <Button
              ref={groupTriggerRef}
              type="button"
              variant="ghost"
              size="none"
              className={BTN_CLASS}
              onClick={() => setGroupMenuOpen((open) => !open)}
            >
              <Icon name="layers" size={14} />
              <span>打组</span>
              <Icon name="chevron-down" size={12} />
            </Button>
            {groupMenuOpen ? (
              <Popover
                open={groupMenuOpen}
                onClose={() => setGroupMenuOpen(false)}
                anchorRef={groupTriggerRef}
                align="start"
                width={160}
                className="!p-1.5"
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="none"
                  className="!flex h-8 w-full !justify-start !rounded-md px-2.5 text-[13px] !font-normal"
                  onClick={() => {
                    group()
                    setGroupMenuOpen(false)
                  }}
                >
                  打组
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="none"
                  className="!flex h-8 w-full !justify-start !rounded-md px-2.5 text-[13px] !font-normal"
                  onClick={() => {
                    storyboard()
                    setGroupMenuOpen(false)
                  }}
                >
                  合并分镜组
                </Button>
              </Popover>
            ) : null}
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="none"
            className={BTN_CLASS}
            onClick={group}
          >
            <Icon name="layers" size={14} />
            <span>打组</span>
          </Button>
        )
      ) : null}

      {canMerge ? (
        <Button
          type="button"
          variant="ghost"
          size="none"
          className={BTN_CLASS}
          onClick={merge}
        >
          <Icon name="layers" size={14} />
          <span>合并分组</span>
        </Button>
      ) : null}

      {canGroup || canMerge ? (
        <div className="mx-1 h-[18px] w-px bg-divider" />
      ) : null}

      {canStudio ? (
        <Button
          type="button"
          variant="ghost"
          size="none"
          className={BTN_CLASS}
          onClick={makeStudio}
        >
          <Icon name="film" size={14} />
          <span>剪辑室</span>
        </Button>
      ) : null}

      <Button
        type="button"
        variant="ghost"
        size="none"
        className={BTN_CLASS}
        onClick={() => void saveToLibrary()}
      >
        <Icon name="folder" size={14} />
        <span>保存到资产</span>
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="none"
        className={BTN_CLASS}
        onClick={duplicate}
      >
        <Icon name="plus" size={14} />
        <span>创建副本</span>
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="none"
        className={BTN_CLASS}
        onClick={() => void exportAssets()}
      >
        <Icon name="download" size={14} />
        <span>导出选中</span>
      </Button>

      <div className="mx-1 h-[18px] w-px bg-divider" />

      <Button
        type="button"
        variant="ghost"
        size="none"
        className={BTN_CLASS}
        onClick={remove}
      >
        <Icon name="close" size={14} />
        <span>删除</span>
      </Button>
    </div>
  )
}
