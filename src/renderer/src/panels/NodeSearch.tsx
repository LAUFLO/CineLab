import { useEffect, useMemo, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { NODE_META, type CanvasNodeKind } from '@shared/canvas-schema'
import { Icon, type IconName } from '../components/Icon'
import { isGroupNode, useCanvasStore } from '../stores/canvas'
import { useUIStore } from '../stores/ui'

const ICONS: Record<CanvasNodeKind, IconName> = {
  text: 'text',
  image: 'image',
  video: 'video',
  audio: 'audio',
  studio: 'film',
  film: 'film',
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
    void fitView({ nodes: [node], padding: 0.8, duration: 300, maxZoom: 1.5 })
    close()
  }

  return (
    <div className="search-overlay" onPointerDown={close}>
      <div
        className="search-dialog"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="search-input-wrap">
          <Icon name="search" size={15} />
          <input
            autoFocus
            className="search-input"
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
          <kbd className="search-kbd">Esc</kbd>
        </div>

        <div className="search-results">
          {results.length === 0 ? (
            <div className="search-empty">没有匹配的节点</div>
          ) : (
            results.map((node, index) => (
              <button
                key={node.id}
                type="button"
                className={`search-item ${index === active ? 'is-active' : ''}`}
                onPointerEnter={() => setActive(index)}
                onClick={() => pick(index)}
              >
                <Icon name={ICONS[node.data.kind]} size={14} />
                <span className="search-item__title">{node.data.title}</span>
                <span className="search-item__kind">
                  {NODE_META[node.data.kind].label}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
