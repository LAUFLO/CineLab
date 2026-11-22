import {
  isGroupNode,
  isStudioNode,
  useCanvasStore,
  type CanvasNode
} from '../stores/canvas'
import { useFilmStudyStore } from '../stores/film-study'
import { useLibraryStore } from '../stores/library'
import { useStudioStore } from '../stores/studio'
import { useUIStore } from '../stores/ui'
import { createStudioFromNode } from '../studio/nodes'
import {
  copySelection,
  duplicateSelectionDeep,
  pasteAt
} from './context-actions'
import { requestDeleteSelection } from './delete-actions'
import { Button, Menu } from '../components/ui'
import { useShortcutLabel } from '../shortcuts/useShortcut'

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
  const copyLabel = useShortcutLabel('canvas.copy')
  const pasteLabel = useShortcutLabel('canvas.paste')
  const deleteLabel = useShortcutLabel('canvas.delete')
  if (!menu || !node) return null

  const sections = buildSections(node, {
    runCommand,
    startGroupRename,
    showToast,
    openStudio,
    openSheet,
    runAuto,
    close,
    shortcuts: {
      copy: copyLabel,
      paste: pasteLabel,
      delete: deleteLabel
    }
  })

  return (
    <Menu
      open
      onClose={close}
      x={menu.screen.x}
      y={menu.screen.y}
      width={224}
      className="!p-1.5 max-h-[520px] overflow-y-auto [animation:menu-in_120ms_ease-out]"
      onContextMenu={(event) => event.preventDefault()}
    >
      {sections.map((section, index) => (
        <div key={`${section.title ?? 'section'}-${index}`}>
          {index > 0 ? <div className="mx-2 my-[5px] h-px bg-divider" /> : null}
          {section.title ? (
            <div className="px-2.5 pt-1.5 pb-[3px] text-[10.5px] text-fg-subtle">
              {section.title}
            </div>
          ) : null}
          {section.actions.map((action) => (
            <Button
              key={action.label}
              type="button"
              variant="ghost"
              size="none"
              className={`!flex h-8 w-full items-center !justify-between gap-3 rounded-md px-3 text-[12.5px] !font-normal disabled:!text-fg-subtle disabled:!opacity-100 ${
                action.danger
                  ? '!text-danger hover:!bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] hover:!text-danger'
                  : '!text-fg'
              }`}
              disabled={action.disabled}
              onClick={() => {
                close()
                action.run()
              }}
            >
              <span>{action.label}</span>
              {action.hint ? (
                <span className="text-xs text-fg-subtle">{action.hint}</span>
              ) : null}
            </Button>
          ))}
        </div>
      ))}
    </Menu>
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
  shortcuts: { copy: string; paste: string; delete: string }
}

async function saveNodeToLibrary(
  node: CanvasNode,
  folder: string
): Promise<void> {
  if (node.type !== 'cine') return
  const output =
    node.data.outputs?.find(
      (item) => item.id === node.data.selectedOutputId
    ) ?? node.data.outputs?.[0]
  if (!output) return
  try {
    await window.api.library.saveAssets(
      [
        {
          path: output.path,
          scope: output.scope ?? 'project',
          name: node.data.title
        }
      ],
      folder
    )
    await useLibraryStore.getState().refresh()
    useUIStore.getState().showToast(`已加入资产库 · ${folder}`)
  } catch (error) {
    useUIStore
      .getState()
      .showToast(
        error instanceof Error ? error.message : '加入资产库失败',
        'error'
      )
  }
}

function buildSections(node: CanvasNode, ctx: MenuContext): MenuSection[] {
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
  const group = isGroupNode(node) ? node : null
  const studio = isStudioNode(node) ? node : null
  const videoOp = node.type === 'video-op' ? node : null

  const hasOutput =
    (cine?.data.outputs?.length ?? 0) > 0 ||
    (studio?.data.outputs?.length ?? 0) > 0

  const common: MenuAction[] = []
  if (cine) {
    common.push({
      label: '查看大图 / 播放',
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
        },
        {
          label: '人声提取',
          run: () => operation('split-av', 'vocal')
        },
        {
          label: '背景音提取',
          run: () => operation('split-av', 'background')
        }
      ]
    })
  }

  if (cine?.data.kind === 'image') {
    sections.push({
      title: '图像',
      actions: [
        ...(cine.data.studyRef?.kind === 'cast'
          ? [
              {
                label: '加入资产库（角色）',
                run: () => void saveNodeToLibrary(node, '角色')
              }
            ]
          : []),
        ...(cine.data.studyRef?.kind === 'scene'
          ? [
              {
                label: '加入资产库（场景）',
                run: () => void saveNodeToLibrary(node, '场景')
              }
            ]
          : []),
        { label: '九宫格', run: () => operation('grid-generate', 'multi') },
        { label: '角色四视图', run: () => operation('character-sheet') },
        { label: '抠图', run: () => operation('cutout') },
        { label: '扩图', run: () => operation('outpaint') },
        { label: '打光', run: () => operation('relight') },
        { label: '多角度', run: () => operation('multi-angle') }
      ]
    })
  }

  if (cine?.data.kind === 'audio') {
    sections.push({
      title: '音频',
      actions: [
        {
          label: '人声提取',
          run: () => operation('split-av', 'vocal')
        },
        {
          label: '背景音提取',
          run: () => operation('split-av', 'background')
        },
        {
          label: '加入资产库（音频）',
          run: () => void saveNodeToLibrary(node, '音频')
        }
      ]
    })
  }

  if (cine?.data.kind === 'text') {
    sections.push({
      title: '文本',
      actions: [
        ...(cine.data.studyRef?.kind === 'shot-text'
          ? [
              {
                label: '复刻这一镜',
                run: () =>
                  void useFilmStudyStore.getState().remakeShot(node.id)
              },
              {
                label: '只重跑这一镜',
                run: () =>
                  void useFilmStudyStore.getState().rerunShot(node.id)
              }
            ]
          : []),
        ...(cine.data.studyRef?.kind === 'style'
          ? [
              {
                label: '保存为提示词模板',
                disabled: !cine.data.text?.trim(),
                run: () => {
                  void useLibraryStore.getState().saveTemplate({
                    kind: 'text',
                    name: '风格档案',
                    prompt: cine.data.text ?? ''
                  })
                }
              }
            ]
          : []),
        {
          label: '编辑文本',
          run: () => {
            useUIStore.getState().openTextEditor(node.id)
          }
        },
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
        },
        {
          label: '整片复刻',
          disabled: !cine.data.studyId,
          run: () => void useFilmStudyStore.getState().remakeAll(node.id)
        }
      ]
    })
  }

  if (studio) {
    const outputs = studio.data.outputs ?? []
    const output =
      outputs.find((item) => item.id === studio.data.selectedOutputId) ??
      outputs[0]

    sections.push({
      title: '剪辑室',
      actions: [
        {
          label: '进入剪辑室',
          run: () => ctx.openStudio(node.id)
        },
        {
          label: '另存成片',
          disabled: !output,
          run: () => {
            if (!output) return
            void window.api.export
              .asset(output.path, studio.data.title)
              .then((result) => {
                if (result.ok) {
                  ctx.showToast(`已导出：${result.path ?? ''}`)
                } else if (!result.canceled) {
                  ctx.showToast(result.error ?? '导出失败', 'error')
                }
              })
          }
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
          run: () => useCanvasStore.getState().arrangeGroup(group.id, 'column')
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
        hint: ctx.shortcuts.copy,
        run: () => copySelection()
      },
      {
        label: '粘贴',
        hint: ctx.shortcuts.paste,
        run: () => void pasteAt()
      },
      {
        label: '删除',
        hint: ctx.shortcuts.delete,
        danger: true,
        run: () => requestDeleteSelection()
      }
    ]
  })

  return sections.filter((section) => section.actions.length > 0)
}
