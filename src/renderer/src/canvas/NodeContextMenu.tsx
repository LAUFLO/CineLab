import { useEffect, useRef } from 'react'
import {
  isFilmNode,
  isGroupNode,
  isStudioNode,
  useCanvasStore,
  type CanvasNode
} from '../stores/canvas'
import { useFilmStudyStore } from '../stores/film-study'
import { useStudioStore } from '../stores/studio'
import { useUIStore } from '../stores/ui'
import { createStudioFromNode } from '../studio/nodes'
import {
  copySelection,
  duplicateSelectionDeep,
  pasteAt
} from './context-actions'
import { requestDeleteSelection } from './delete-actions'

const MENU_WIDTH = 224
const MENU_MAX_HEIGHT = 520

interface MenuAction {
  label: string
  hint?: string
  disabled?: boolean
  danger?: boolean
  run: () => void
}

interface MenuSection {
  title?: string
  actions: MenuAction[]
}

export function NodeContextMenu() {
  const menu = useUIStore((state) => state.nodeContextMenu)
  const close = useUIStore((state) => state.closeNodeContextMenu)
  const runCommand = useUIStore((state) => state.runNodeCommand)
  const startGroupRename = useUIStore((state) => state.startGroupRename)
  const showToast = useUIStore((state) => state.showToast)
  const openStudio = useStudioStore((state) => state.openStudio)
  const openSheet = useFilmStudyStore((state) => state.openSheet)
  const runAuto = useFilmStudyStore((state) => state.runAuto)
  const node = useCanvasStore((state) =>
    menu ? state.nodes.find((entry) => entry.id === menu.nodeId) : undefined
  )
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return

    const onPointerDown = (event: PointerEvent): void => {
      if (
        ref.current &&
        event.target instanceof Node &&
        !ref.current.contains(event.target)
      ) {
        close()
      }
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    const onResize = (): void => close()

    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', onResize)
    }
  }, [menu, close])

  if (!menu || !node) return null

  const sections = buildSections(node, {
    runCommand,
    startGroupRename,
    showToast,
    openStudio,
    openSheet,
    runAuto,
    close
  })

  const left = Math.max(
    12,
    Math.min(menu.screen.x, window.innerWidth - MENU_WIDTH - 12)
  )
  const top = Math.max(
    12,
    Math.min(menu.screen.y, window.innerHeight - MENU_MAX_HEIGHT - 12)
  )

  return (
    <div
      ref={ref}
      className="ctx-menu ctx-menu--node"
      style={{ left, top, width: MENU_WIDTH, maxHeight: MENU_MAX_HEIGHT }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {sections.map((section, index) => (
        <div key={`${section.title ?? 'section'}-${index}`}>
          {index > 0 ? <div className="ctx-menu__divider" /> : null}
          {section.title ? (
            <div className="ctx-menu__section">{section.title}</div>
          ) : null}
          {section.actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={`ctx-menu__item${action.danger ? ' is-danger' : ''}`}
              disabled={action.disabled}
              onClick={() => {
                close()
                action.run()
              }}
            >
              <span>{action.label}</span>
              {action.hint ? (
                <span className="ctx-menu__shortcut">{action.hint}</span>
              ) : null}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

interface MenuContext {
  runCommand: ReturnType<typeof useUIStore.getState>['runNodeCommand']
  startGroupRename: (id: string) => void
  showToast: (message: string, tone?: 'info' | 'error') => void
  openStudio: (nodeId: string) => void
  openSheet: (nodeId: string) => Promise<void>
  runAuto: (nodeId: string, config?: { interval?: number }) => Promise<void>
  close: () => void
}

function buildSections(
  node: CanvasNode,
  ctx: MenuContext
): MenuSection[] {
  const sections: MenuSection[] = []
  const command = (
    action: 'expand' | 'download' | 'library' | 'operation',
    opId?: string,
    itemId?: string
  ): void => {
    ctx.runCommand({ nodeId: node.id, action, opId, itemId })
  }
  const operation = (opId: string, itemId?: string): void =>
    command('operation', opId, itemId)

  const cine = node.type === 'cine' ? node : null
  const film = isFilmNode(node) ? node : null
  const group = isGroupNode(node) ? node : null
  const studio = isStudioNode(node) ? node : null
  const videoOp = node.type === 'video-op' ? node : null

  const hasOutput =
    (cine?.data.outputs?.length ?? 0) > 0 ||
    (film?.data.outputs?.length ?? 0) > 0

  const common: MenuAction[] = []
  if (cine || film) {
    common.push({
      label: film ? '预览成片' : '查看大图 / 播放',
      disabled: !hasOutput,
      run: () => command('expand')
    })
    common.push({
      label: '下载',
      disabled: !hasOutput,
      run: () => command('download')
    })
  }
  if (cine) {
    common.push({
      label: '保存到资产库',
      disabled: !hasOutput,
      run: () => command('library')
    })
  }
  sections.push({ actions: common })

  if (cine?.data.kind === 'video') {
    sections.push({
      title: '视频',
      actions: [
        {
          label: '剪辑室',
          run: () => {
            const studioId = createStudioFromNode(node.id)
            if (studioId) ctx.openStudio(studioId)
          }
        },
        {
          label: '逐帧拉片',
          run: () => operation('film-study', 'auto')
        },
        {
          label: '抽首帧',
          run: () => operation('frame-study', 'first')
        },
        {
          label: '抽尾帧',
          run: () => operation('frame-study', 'last')
        },
        {
          label: '抽当前帧',
          run: () => operation('frame-study', 'current')
        },
        {
          label: '深度动作捕捉',
          run: () => operation('motion-capture')
        },
        {
          label: '片段截取',
          run: () => operation('clip-trim')
        },
        {
          label: '分离音视频',
          run: () => operation('split-av')
        }
      ]
    })
  }

  if (cine?.data.kind === 'image') {
    sections.push({
      title: '图像',
      actions: [
        { label: '九宫格', run: () => operation('grid-generate', 'multi') },
        { label: '角色三视图', run: () => operation('character-sheet') },
        { label: '抠图', run: () => operation('cutout') },
        { label: '扩图', run: () => operation('outpaint') },
        { label: '打光', run: () => operation('relight') },
        { label: '多角度', run: () => operation('multi-angle') }
      ]
    })
  }

  if (cine?.data.kind === 'text') {
    sections.push({
      title: '文本',
      actions: [
        {
          label: '复制文本内容',
          disabled: !cine.data.text?.trim(),
          run: () => {
            void navigator.clipboard
              .writeText(cine.data.text ?? '')
              .then(() => ctx.showToast('已复制文本'))
              .catch(() => ctx.showToast('复制失败', 'error'))
          }
        },
        {
          label: '作为提示词使用',
          disabled: !cine.data.text?.trim(),
          run: () => {
            if (cine.data.text) {
              useUIStore.getState().applyPrompt(cine.data.text)
            }
          }
        }
      ]
    })
  }

  if (cine?.data.kind === 'study') {
    sections.push({
      title: '拉片',
      actions: [
        {
          label: '查看分镜表',
          disabled: !cine.data.studyId,
          run: () => void ctx.openSheet(node.id)
        },
        {
          label: '重新拉片',
          disabled: !cine.data.sourcePath,
          run: () => void ctx.runAuto(node.id)
        }
      ]
    })
  }

  if (studio) {
    sections.push({
      title: '剪辑室',
      actions: [
        {
          label: '进入剪辑室',
          run: () => ctx.openStudio(node.id)
        }
      ]
    })
  }

  if (videoOp) {
    sections.push({
      title: '视频操作',
      actions: [
        {
          label: videoOp.data.expanded ? '收起参数' : '展开参数',
          run: () =>
            useCanvasStore
              .getState()
              .patchVideoOpNode(node.id, { expanded: !videoOp.data.expanded })
        }
      ]
    })
  }

  if (group) {
    const isStoryboard = group.data.mode === 'storyboard'
    sections.push({
      title: '分组',
      actions: [
        {
          label: '重命名',
          run: () => ctx.startGroupRename(group.id)
        },
        {
          label: '横排',
          run: () => useCanvasStore.getState().arrangeGroup(group.id, 'row')
        },
        {
          label: '竖排',
          run: () =>
            useCanvasStore.getState().arrangeGroup(group.id, 'column')
        },
        {
          label: '网格排列',
          run: () => useCanvasStore.getState().arrangeGroup(group.id, 'grid')
        },
        {
          label: isStoryboard ? '转为普通组' : '转为分镜组',
          run: () =>
            useCanvasStore
              .getState()
              .setGroupMode(group.id, isStoryboard ? 'normal' : 'storyboard')
        },
        {
          label: '解组',
          run: () => useCanvasStore.getState().ungroup(group.id)
        }
      ]
    })
  }

  sections.push({
    actions: [
      {
        label: '创建副本',
        run: () => void duplicateSelectionDeep()
      },
      {
        label: '复制',
        hint: 'Ctrl+C',
        run: () => copySelection()
      },
      {
        label: '粘贴',
        hint: 'Ctrl+V',
        run: () => void pasteAt()
      },
      {
        label: '删除',
        hint: 'Delete',
        danger: true,
        run: () => requestDeleteSelection()
      }
    ]
  })

  return sections.filter((section) => section.actions.length > 0)
}
