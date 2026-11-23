import { useEffect, useMemo, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { NODE_META, type CanvasNodeKind } from '@shared/canvas-schema'
import { Icon, type IconName } from '../components/Icon'
import { isGroupNode, useCanvasStore } from '../stores/canvas'
import { useUIStore } from '../stores/ui'
import { Input, Button } from '../components/ui'

const ICONS: Record<CanvasNodeKind, IconName> = {
  text: 'text',
  image: 'image',
  video: 'video',
  audio: 'audio',
  studio: 'film',
  stage: 'frame',
  film: 'film',
  'video-op': 'history',
  study: 'film'
}

export function NodeSearch() {
  const open = useUIStore((state) => state.searchOpen)
  const close = useUIStore((state) => state.closeSearch)
  const nodes = useCanvasStore((state) => state.nodes)
  const { fitView } = useReactFlow()

  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
  }, [open])

  const results = useMemo(() => {
    if (!open) return []
    const keyword = query.trim().toLowerCase()

    return nodes
      .filter((node) => !isGroupNode(node))
      .filter((node) => {
        if (!keyword) return true
        const title = node.data.title.toLowerCase()
        const kind = NODE_META[node.data.kind].label.toLowerCase()
        const text =
          node.type === 'cine' ? (node.data.text ?? '').toLowerCase() : ''
        return (
          title.includes(keyword) ||
          kind.includes(keyword) ||
          text.includes(keyword)
        )
      })
      .slice(0, 12)
  }, [nodes, open, query])

  if (!open) return null

  const pick = (index: number): void => {
    const node = results[index]
    if (!node) return
    void fitView({ nodes: [node], padding: '22%', duration: 300, maxZoom: 1.5 })
    close()
  }

  return (
    <div
      className="fixed inset-0 z-[240] flex justify-center bg-overlay pt-[12vh] [-webkit-app-region:no-drag]"
      onPointerDown={close}
    >
      <div
        className="flex max-h-[420px] w-[560px] max-w-[calc(100vw-48px)] flex-col overflow-hidden rounded-panel border border-border bg-surface-raised shadow-float"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex h-12 items-center gap-2 border-b border-divider px-3.5 text-fg-subtle">
          <Icon name="search" size={15} />
          <Input
            autoFocus
            className="!h-9 min-w-0 flex-1 !rounded-none !border-0 !bg-transparent !px-0 !text-[14px] !text-fg"
            value={query}
            placeholder="搜索节点标题、类型或提示词"
            onChange={(event) => {
              setQuery(event.target.value)
              setActive(0)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                close()
                return
              }
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setActive((index) => Math.min(index + 1, results.length - 1))
                return
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault()
                setActive((index) => Math.max(index - 1, 0))
                return
              }
              if (event.key === 'Enter') {
                event.preventDefault()
                pick(active)
              }
            }}
          />
          <kbd className="min-w-[28px] whitespace-nowrap rounded-md border border-border bg-surface-hover px-[7px] py-0.5 text-center font-[inherit] text-[11px] text-fg-muted">
            Esc
          </kbd>
        </div>

        <div className="overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <div className="px-3 py-8 text-center text-[13px] text-fg-subtle">
              没有匹配的节点
            </div>
          ) : (
            results.map((node, index) => (
              <Button
                key={node.id}
                type="button"
                variant="ghost"
                size="none"
                className={`!flex h-9 w-full items-center gap-2.5 !justify-start rounded-card px-2.5 text-left text-[13px] !font-normal ${
                  index === active ? '!bg-surface-hover !text-fg' : ''
                }`}
                onPointerEnter={() => setActive(index)}
                onClick={() => pick(index)}
              >
                <Icon name={ICONS[node.data.kind]} size={14} />
                <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                  {node.data.title}
                </span>
                <span className="text-[11px] text-fg-subtle">
                  {NODE_META[node.data.kind].label}
                </span>
              </Button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
