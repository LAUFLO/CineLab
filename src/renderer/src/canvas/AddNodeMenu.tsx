import { useEffect, useState } from 'react'
import { NODE_KINDS, NODE_META, type NodeKind } from '@shared/canvas-schema'
import { Icon, type IconName } from '../components/Icon'
import { isGroupNode, useCanvasStore } from '../stores/canvas'
import { useUIStore } from '../stores/ui'
import { useStudioStore } from '../stores/studio'
import { createStudioAt } from '../studio/nodes'
import { uploadMaterialsAt } from './context-actions'
import { Input, Button, Menu } from '../components/ui'

const ICONS: Record<NodeKind, IconName> = {
  text: 'text',
  image: 'image',
  video: 'video',
  audio: 'audio',
  study: 'film'
}

export function AddNodeMenu() {
  const menu = useUIStore((state) => state.menu)
  const closeMenu = useUIStore((state) => state.closeMenu)
  const addNode = useCanvasStore((state) => state.addNode)
  const addStageNode = useCanvasStore((state) => state.addStageNode)
  const onConnect = useCanvasStore((state) => state.onConnect)
  const nodes = useCanvasStore((state) => state.nodes)

  const [query, setQuery] = useState('')
  const [creatingStage, setCreatingStage] = useState(false)

  useEffect(() => {
    setQuery('')
  }, [menu])

  if (!menu) return null

  const sourceNode = menu.source
    ? nodes.find((node) => node.id === menu.source?.nodeId)
    : undefined
  const sourceIsGroup = sourceNode ? isGroupNode(sourceNode) : false
  const sourceChildren =
    sourceIsGroup && sourceNode
      ? nodes.filter((node) => node.parentId === sourceNode.id).length
      : 0

  const kinds = NODE_KINDS.filter((kind) =>
    NODE_META[kind].label.includes(query)
  )
  const stageMatches = !query.trim() || '导演台'.includes(query.trim())

  const addStage = async (): Promise<void> => {
    if (creatingStage || menu.source) return
    setCreatingStage(true)
    const count = useCanvasStore
      .getState()
      .nodes.filter((node) => node.type === 'stage').length
    try {
      const doc = await window.api.stage.create(`导演台 ${count + 1}`)
      addStageNode(doc, menu.flow)
      closeMenu()
    } catch (error) {
      useUIStore
        .getState()
        .showToast(
          error instanceof Error ? error.message : '创建导演台失败',
          'error'
        )
    } finally {
      setCreatingStage(false)
    }
  }

  const pick = (kind: NodeKind): void => {
    const id = addNode(kind, menu.flow)

    if (menu.source) {
      if (menu.source.handle === 'source') {
        onConnect({ source: menu.source.nodeId, target: id })
      } else {
        onConnect({ source: id, target: menu.source.nodeId })
      }
    }

    closeMenu()
  }

  const above = menu.placement === 'above'
  const anchorX = above ? menu.screen.x - 110 : menu.screen.x
  const anchorY = above ? menu.screen.y - 8 : menu.screen.y + 14

  const wire = (() => {
    if (!menu.source) return null

    const side = menu.source.handle === 'source' ? 'right' : 'left'
    const handle = document.querySelector<HTMLElement>(
      `.react-flow__node[data-id="${menu.source.nodeId}"] .react-flow__handle[data-handle="${side}"]`
    )
    if (!handle) return null

    const rect = handle.getBoundingClientRect()
    const x1 = rect.left + rect.width / 2
    const y1 = rect.top + rect.height / 2
    const x2 = menu.screen.x
    const y2 = menu.screen.y
    const curve = Math.max(48, Math.abs(x2 - x1) * 0.4)

    return `M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`
  })()

  return (
    <>
      {wire ? (
        <svg
          className="pointer-events-none fixed inset-0 z-[99] h-full w-full"
          aria-hidden="true"
        >
          <path
            d={wire}
            className="fill-none stroke-[color-mix(in_srgb,var(--link)_55%,transparent)] [stroke-dasharray:5_4] [stroke-width:1.5]"
          />
        </svg>
      ) : null}

      <Menu
        open
        onClose={closeMenu}
        x={anchorX}
        y={anchorY}
        width={220}
        placement={above ? 'above' : 'auto'}
        className="!p-1 overscroll-contain [animation:menu-in_120ms_ease-out]"
      >
        <div className="px-2 pt-1.5 pb-1 text-[11px] text-fg-subtle">
          {menu.source
            ? sourceIsGroup
              ? `引用组内 ${sourceChildren} 个节点`
              : '引用该节点生成'
            : '添加节点'}
        </div>

        <div className="mb-1 flex h-7 items-center gap-1.5 rounded-md bg-surface-hover px-2 text-fg-subtle">
          <Icon name="search" size={13} />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索节点…"
            className="!h-auto !min-w-0 !flex-1 !rounded-none !border-0 !bg-transparent !p-0 !text-xs !text-fg focus:!border-transparent"
          />
        </div>

        <div>
          {kinds.map((kind) => (
            <Button
              key={kind}
              type="button"
              variant="ghost"
              size="none"
              className="!flex h-8 w-full items-center gap-2 !justify-start !rounded-md px-2 text-[13px] !font-normal !text-fg-muted hover:!text-fg disabled:!opacity-40"
              onClick={() => pick(kind)}
            >
              <Icon name={ICONS[kind]} size={16} />
              <span>{NODE_META[kind].label}</span>
            </Button>
          ))}
          {kinds.length === 0 && !stageMatches && (
            <div className="px-2 py-2.5 text-center text-xs text-fg-subtle">
              没有匹配的节点
            </div>
          )}
        </div>

        {!menu.source && stageMatches ? (
          <>
            <div className="mx-1.5 my-1 h-px bg-divider" />
            <div className="px-2 pt-1.5 pb-1 text-[11px] text-fg-subtle">
              场景
            </div>
            <Button
              type="button"
              variant="ghost"
              size="none"
              className="!flex h-8 w-full items-center gap-2 !justify-start !rounded-md px-2 text-[13px] !font-normal !text-fg-muted hover:!text-fg disabled:!opacity-40"
              onClick={() => void addStage()}
              disabled={creatingStage}
            >
              <Icon name="frame" size={16} />
              <span>{creatingStage ? '创建中…' : '导演台'}</span>
            </Button>
          </>
        ) : null}

        {!menu.source && query.trim() === '' ? (
          <>
            <div className="mx-1.5 my-1 h-px bg-divider" />
            <div className="px-2 pt-1.5 pb-1 text-[11px] text-fg-subtle">
              添加资源
            </div>
            <Button
              type="button"
              variant="ghost"
              size="none"
              className="!flex h-8 w-full items-center gap-2 !justify-start !rounded-md px-2 text-[13px] !font-normal !text-fg-muted hover:!text-fg disabled:!opacity-40"
              onClick={() => {
                closeMenu()
                const studioId = createStudioAt(menu.flow)
                useStudioStore.getState().openStudio(studioId)
              }}
            >
              <Icon name="film" size={16} />
              <span>剪辑室</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="none"
              className="!flex h-8 w-full items-center gap-2 !justify-start !rounded-md px-2 text-[13px] !font-normal !text-fg-muted hover:!text-fg disabled:!opacity-40"
              onClick={() => {
                closeMenu()
                void uploadMaterialsAt(menu.flow)
              }}
            >
              <Icon name="folder-plus" size={16} />
              <span>上传素材</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="none"
              className="!flex h-8 w-full items-center gap-2 !justify-start !rounded-md px-2 text-[13px] !font-normal !text-fg-muted hover:!text-fg disabled:!opacity-40"
              onClick={() => {
                closeMenu()
                useUIStore.getState().openHistory()
              }}
            >
              <Icon name="history" size={16} />
              <span>从生成历史选择</span>
            </Button>
          </>
        ) : null}

        {menu.source ? (
          <>
            <div className="mx-1.5 my-1 h-px bg-divider" />
            <Button
              type="button"
              variant="ghost"
              size="none"
              className="!flex h-8 w-full items-center gap-2 !justify-start !rounded-md px-2 text-[13px] !font-normal !text-fg-muted hover:!text-fg disabled:!opacity-40"
              disabled
            >
              <Icon name="cursor" size={16} />
              <span>参考节点</span>
            </Button>
          </>
        ) : null}
      </Menu>
    </>
  )
}
