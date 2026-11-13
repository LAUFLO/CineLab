import { useEffect, useRef, type ReactNode } from 'react'
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
}

export function Menu({
  open,
  onClose,
  x,
  y,
  width = 200,
  children,
  className
}: MenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

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

  if (!open) return null

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      className={cn(
        'fixed z-[1000] rounded-card border border-border bg-surface-raised p-1 shadow-menu',
        className
      )}
      style={{
        left: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
        top: Math.max(8, Math.min(y, window.innerHeight - 8)),
        width
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
  danger?: boolean
  disabled?: boolean
  onSelect: () => void
}

export function MenuItem({
  children,
  icon,
  danger,
  disabled,
  onSelect
}: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
        'hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none',
        danger ? 'text-danger' : 'text-fg',
        'disabled:pointer-events-none disabled:opacity-40'
      )}
    >
      {icon ? <span className="shrink-0 text-fg-subtle">{icon}</span> : null}
      <span className="truncate">{children}</span>
    </button>
  )
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-divider" />
}
