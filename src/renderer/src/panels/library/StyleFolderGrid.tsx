import { useRef, useState, type MouseEvent } from 'react'
import type { StyleCard } from '@shared/style-schema'
import { Popover } from '../../components/ui'
import { styleCoverUrl } from '../../lib/style-url'

export function filterStyles(styles: StyleCard[], query: string): StyleCard[] {
  const keyword = query.trim().toLowerCase()
  if (!keyword) return styles

  return styles.filter(
    (style) =>
      style.name.toLowerCase().includes(keyword) ||
      style.category.toLowerCase().includes(keyword) ||
      style.prompt.toLowerCase().includes(keyword)
  )
}

interface StyleFolderGridProps {
  styles: StyleCard[]
  query: string
}

export function StyleFolderGrid({ styles, query }: StyleFolderGridProps) {
  const filtered = filterStyles(styles, query)
  const [hover, setHover] = useState<StyleCard | null>(null)
  const hoverAnchor = useRef<HTMLElement | null>(null)

  if (styles.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-fg-muted">
        风格库加载中…
      </div>
    )
  }

  if (filtered.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-fg-muted">
        没有匹配的风格
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
        {filtered.map((style) => (
          <div
            key={style.id}
            className="group relative"
            onMouseEnter={(event: MouseEvent<HTMLDivElement>) => {
              hoverAnchor.current = event.currentTarget
              setHover(style)
            }}
            onMouseLeave={() => setHover(null)}
          >
            <div className="relative">
              <img
                src={styleCoverUrl(style)}
                alt={style.name}
                className="aspect-square w-full rounded-md object-cover"
                loading="lazy"
              />
              <span className="absolute left-1 top-1 rounded-full bg-surface/85 px-1.5 py-0.5 text-[9px] text-fg-muted">
                {style.source === 'official' ? '官方' : '自定义'}
              </span>
            </div>
            <div className="flex flex-col items-center px-1 py-1">
              <span className="w-full truncate text-center text-[11px] text-fg">
                {style.name}
              </span>
              <span className="w-full truncate text-center text-[10px] text-fg-subtle">
                {style.category}
              </span>
            </div>
          </div>
        ))}
      </div>

      <Popover
        open={Boolean(hover)}
        onClose={() => setHover(null)}
        anchorRef={hoverAnchor}
        width={300}
        className="p-3"
        ariaLabel="风格提示词预览"
      >
        {hover ? (
          <>
            <div className="text-xs font-medium text-fg">{hover.name}</div>
            <div className="mt-1 text-[11px] text-fg-muted">
              {hover.category} · {hover.source === 'official' ? '官方' : '自定义'}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-fg-muted">
              {hover.prompt}
            </p>
          </>
        ) : null}
      </Popover>
    </>
  )
}
