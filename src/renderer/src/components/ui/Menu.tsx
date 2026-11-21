import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
import { cn } from './cn'

export interface MenuProps {
  open: boolean
  onClose: () => void
  x: number
  y: number
  width?: number
  children: ReactNode
  className?: string
  onContextMenu?: (event: MouseEvent<HTMLDivElement>) => void
  /** cursor: x/y 为左上角；auto: 优先向下，空间不足向上翻；above: y 为菜单底边 */
  placement?: 'cursor' | 'auto' | 'above'
  /** 菜单内容最大高度；不传时按锚点可用空间计算 */
  maxHeight?: number
}

export function Menu({
  open,
  onClose,
  x,
  y,
  width = 200,
  children,
  className,
  onContextMenu,
  placement = 'cursor',
  maxHeight
}: MenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState<{
    top: number
    maxHeight?: number
  } | null>(null)

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent): void => {
      if (menuRef.current?.contains(event.target as Node)) return
      onClose()
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return

      const items = Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>(
          '[role="menuitem"]:not([disabled])'
        ) ?? []
      )
      if (items.length === 0) return

      event.preventDefault()
      const current = items.indexOf(document.activeElement as HTMLElement)
      const delta = event.key === 'ArrowDown' ? 1 : -1
      const next = (current + delta + items.length) % items.length
      items[next].focus()
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    menuRef.current
      ?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')
      ?.focus()

    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open, onClose])

  useLayoutEffect(() => {
    if (!open) {
      setLayout(null)
      return
    }
    const element = menuRef.current
    if (!element) return

    const measure = (): void => {
      const padding = 8
      const naturalHeight = element.scrollHeight

      if (placement === 'cursor' && maxHeight === undefined) {
        const top = Math.max(padding, Math.min(y, window.innerHeight - padding))
        setLayout((current) =>
          current?.top === top && current.maxHeight === undefined
            ? current
            : { top }
        )
        return
      }

      const spaceBelow = Math.max(120, window.innerHeight - y - padding)
      const spaceAbove = Math.max(120, y - padding)
      const flip =
        placement === 'above' ||
        (placement === 'auto' &&
          naturalHeight > spaceBelow &&
          spaceAbove > spaceBelow)
      const available = flip ? spaceAbove : spaceBelow
      const height = Math.min(naturalHeight, maxHeight ?? available, available)
      const top = flip
        ? Math.max(padding, y - height)
        : Math.min(y, window.innerHeight - height - padding)

      setLayout((current) =>
        current?.top === top && current.maxHeight === height
          ? current
          : { top, maxHeight: height }
      )
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [open, y, placement, maxHeight])

  if (!open) return null

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={onContextMenu}
      className={cn(
        'fixed z-[1000] rounded-card border border-border bg-surface-raised p-1 shadow-menu',
        className
      )}
      style={{
        left: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
        top:
          layout?.top ??
          Math.max(8, Math.min(y, window.innerHeight - 8)),
        width,
        maxHeight: layout?.maxHeight,
        overflowY: layout?.maxHeight ? 'auto' : undefined,
        visibility: layout ? 'visible' : 'hidden'
      }}
    >
      {children}
    </div>,
    document.body
  )
}

export interface MenuItemProps {
  children: ReactNode
  icon?: ReactNode
  trailing?: ReactNode
  danger?: boolean
  disabled?: boolean
  active?: boolean
  title?: string
  className?: string
  onSelect: (event: MouseEvent<HTMLButtonElement>) => void
  onMouseDown?: (event: MouseEvent<HTMLButtonElement>) => void
  onMouseEnter?: (event: MouseEvent<HTMLButtonElement>) => void
  onMouseLeave?: (event: MouseEvent<HTMLButtonElement>) => void
}

export function MenuItem({
  children,
  icon,
  trailing,
  danger,
  disabled,
  active,
  title,
  className,
  onSelect,
  onMouseDown,
  onMouseEnter,
  onMouseLeave
}: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      title={title}
      onClick={(event) => {
        event.stopPropagation()
        onSelect(event)
      }}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
        'hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none',
        active ? 'is-active bg-surface-hover text-fg' : '',
        danger ? 'text-danger' : 'text-fg',
        'disabled:pointer-events-none disabled:opacity-40',
        className
      )}
    >
      {icon ? <span className="shrink-0 text-fg-subtle">{icon}</span> : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing ? (
        <span className="ml-auto flex shrink-0 items-center gap-2 text-xs text-fg-subtle">
          {trailing}
        </span>
      ) : null}
    </button>
  )
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-divider" />
}
