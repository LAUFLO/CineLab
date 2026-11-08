import { useLayoutEffect, useState } from 'react'
import {
  GROUP_RATIOS,
  GROUP_RATIO_LABEL,
  type GroupRatio
} from '@shared/canvas-schema'
import { Icon } from '../components/Icon'
import {
  isGroupNode,
  selectedNodeOutput,
  useCanvasStore
} from '../stores/canvas'
import { useStudioStore } from '../stores/studio'
import { useUIStore } from '../stores/ui'
import { createStudioFromNodes } from '../studio/nodes'

type MenuKind = 'ratio' | 'grid' | null

const GRID_OPTIONS: [number, number][] = [
  [1, 1],
  [2, 1],
  [3, 1],
  [2, 2],
  [3, 2],
  [4, 3],
  [3, 3],
  [4, 4]
]

export function StoryboardToolbar() {
  const nodes = useCanvasStore((state) => state.nodes)
  const viewport = useCanvasStore((state) => state.viewport)
  const setStoryboardRatio = useCanvasStore((state) => state.setStoryboardRatio)
  const setStoryboardGrid = useCanvasStore((state) => state.setStoryboardGrid)
  const toggleStoryboardIndex = useCanvasStore(
    (state) => state.toggleStoryboardIndex
  )
  const clearGroupChildren = useCanvasStore((state) => state.clearGroupChildren)
  const setGroupMode = useCanvasStore((state) => state.setGroupMode)
  const ungroup = useCanvasStore((state) => state.ungroup)
  const addPendingNodes = useCanvasStore((state) => state.addPendingNodes)
  const applyOutput = useCanvasStore((state) => state.applyOutput)
  const patchNodeData = useCanvasStore((state) => state.patchNodeData)
  const requestConfirm = useUIStore((state) => state.requestConfirm)
  const showToast = useUIStore((state) => state.showToast)
  const openStudio = useStudioStore((state) => state.openStudio)

  const selected = nodes.filter((node) => node.selected)
  const group =
    selected.length === 1 &&
    isGroupNode(selected[0]) &&
    selected[0].data.mode === 'storyboard'
      ? selected[0]
      : undefined

  const [position, setPosition] = useState<{ left: number; top: number } | null>(
    null
  )
  const [menu, setMenu] = useState<MenuKind>(null)
  const [stitching, setStitching] = useState(false)
  const groupId = group?.id

  useLayoutEffect(() => {
    if (!groupId) {
      setPosition(null)
      return
    }

    const element = document.querySelector<HTMLElement>(
      `.react-flow__node[data-id="${groupId}"]`
    )
    if (!element) {
      setPosition(null)
      return
    }

    const rect = element.getBoundingClientRect()
    const halfWidth = 320
    setPosition({
      left: Math.max(
        halfWidth,
        Math.min(rect.left + rect.width / 2, window.innerWidth - halfWidth)
      ),
      top: Math.max(56, rect.top - 56)
    })
  }, [groupId, nodes, viewport])

  if (!group || !position) return null

  const cols = group.data.gridCols ?? 2
  const rows = group.data.gridRows ?? 1
  const ratio = group.data.ratio ?? '16:9'

  const stitch = async (): Promise<void> => {
    const all = useCanvasStore.getState().nodes
    const children = all.filter((node) => node.parentId === group.id)
    const paths: string[] = []

    for (const child of children) {
      if (isGroupNode(child)) continue
      const current = selectedNodeOutput(child)
      if (current?.path) paths.push(current.path)
    }

    if (paths.length === 0) {
      showToast('组内节点还没有图片输出', 'error')
      return
    }

    setStitching(true)

    const groupHeight = Number(group.style?.height ?? 400)
    const pendingId = addPendingNodes(
      'image',
      {
        x: group.position.x,
        y: group.position.y + groupHeight + 80
      },
      1,
      '分镜拼接'
    )[0]

    try {
      const result = await window.api.media.stitch({
        paths,
        cols,
        rows,
        ratio,
        outputWidth: 2048
      })

      applyOutput(pendingId, result.asset, 'storyboard-stitch')
      showToast('拼接完成，已写入新节点')
    } catch (error) {
      patchNodeData(pendingId, {
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      })
      showToast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setStitching(false)
    }
  }

  const clearChildren = (): void => {
    const count = useCanvasStore
      .getState()
      .nodes.filter((node) => node.parentId === group.id).length
    if (count === 0) {
      showToast('组内没有节点')
      return
    }

    requestConfirm({
      title: '清空分镜组',
      message: `确定删除组内全部 ${count} 个节点吗？此操作不可撤销。`,
      confirmLabel: '清空',
      danger: true,
      onConfirm: () => {
        const removed = clearGroupChildren(group.id)
        if (removed > 0) showToast(`已清空 ${removed} 个节点`)
      }
    })
  }

  const makeStudio = (): void => {
    const studioId = createStudioFromNodes(
      [group.id],
      `${group.data.title} · 剪辑室`
    )
    if (!studioId) {
      showToast('组内没有可送入剪辑室的素材', 'error')
      return
    }
    openStudio(studioId)
    showToast('已创建剪辑室并送入分镜素材')
  }

  return (
    <div
      className="group-toolbar storyboard-toolbar nodrag nopan"
      style={{ left: position.left, top: position.top }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="group-toolbar__menu-wrap">
        <button
          type="button"
          className={`group-toolbar__btn ${menu === 'ratio' ? 'is-open' : ''}`}
          onClick={() => setMenu(menu === 'ratio' ? null : 'ratio')}
        >
          <Icon name="frame" size={14} />
          <span>{GROUP_RATIO_LABEL[ratio]}</span>
          <Icon name="chevron-down" size={12} />
        </button>
        {menu === 'ratio' ? (
          <div className="group-toolbar__pop">
            {GROUP_RATIOS.map((value) => (
              <button
                key={value}
                type="button"
                className={`group-toolbar__pop-item ${
                  ratio === value ? 'is-active' : ''
                }`}
                onClick={() => {
                  setStoryboardRatio(group.id, value as GroupRatio)
                  setMenu(null)
                }}
              >
                {GROUP_RATIO_LABEL[value]}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="group-toolbar__menu-wrap">
        <button
          type="button"
          className={`group-toolbar__btn ${menu === 'grid' ? 'is-open' : ''}`}
          onClick={() => setMenu(menu === 'grid' ? null : 'grid')}
        >
          <Icon name="grid" size={14} />
          <span>
            宫格 {cols}×{rows}
          </span>
          <Icon name="chevron-down" size={12} />
        </button>
        {menu === 'grid' ? (
          <div className="group-toolbar__pop">
            {GRID_OPTIONS.map(([nextCols, nextRows]) => (
              <button
                key={`${nextCols}x${nextRows}`}
                type="button"
                className={`group-toolbar__pop-item ${
                  cols === nextCols && rows === nextRows ? 'is-active' : ''
                }`}
                onClick={() => {
                  setStoryboardGrid(group.id, nextCols, nextRows)
                  setMenu(null)
                }}
              >
                {nextCols}×{nextRows}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <button
        type="button"
        className="group-toolbar__btn"
        title="按分镜比例与当前宫格（含间距）拼接，默认 2K 分辨率"
        disabled={stitching}
        onClick={() => void stitch()}
      >
        <Icon name="layers" size={14} />
        <span>{stitching ? '拼接中…' : '拼接(2K)'}</span>
      </button>

      <button
        type="button"
        className="group-toolbar__btn"
        title="把分镜组内素材送入剪辑室"
        onClick={makeStudio}
      >
        <Icon name="film" size={14} />
        <span>剪辑室</span>
      </button>

      <button
        type="button"
        className={`group-toolbar__btn ${
          group.data.showIndex === false ? '' : 'is-open'
        }`}
        title="显示或隐藏序号"
        onClick={() => toggleStoryboardIndex(group.id)}
      >
        <Icon name="text" size={14} />
        <span>序号</span>
      </button>

      <button
        type="button"
        className="group-toolbar__btn"
        onClick={clearChildren}
      >
        <Icon name="trash" size={14} />
        <span>清空</span>
      </button>

      <div className="group-toolbar__divider" />

      <button
        type="button"
        className="group-toolbar__btn"
        onClick={() => setGroupMode(group.id, 'normal')}
      >
        <Icon name="grid" size={14} />
        <span>转普通组</span>
      </button>

      <button
        type="button"
        className="group-toolbar__btn group-toolbar__btn--danger"
        onClick={() => ungroup(group.id)}
      >
        <Icon name="minimize" size={14} />
        <span>解组</span>
      </button>
    </div>
  )
}
