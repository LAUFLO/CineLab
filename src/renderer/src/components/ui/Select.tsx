import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../Icon'
import { cn } from './cn'

export interface SelectOption<T extends string> {
  value: T
  label: string
  disabled?: boolean
}

interface SelectProps<T extends string> {
  value: T
  options: SelectOption<T>[]
  onChange: (value: T) => void
  disabled?: boolean
  className?: string
  title?: string
}

interface MenuPosition {
  left: number
  top: number
  width: number
  placement: 'bottom' | 'top'
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  disabled,
  className,
  title
}: SelectProps<T>) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<MenuPosition | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const selected = options.find((option) => option.value === value) ?? options[0]

  const updatePosition = (): void => {
    const trigger = triggerRef.current
    const menu = menuRef.current
    if (!trigger) return

    const rect = trigger.getBoundingClientRect()
    const width = Math.min(
      Math.max(rect.width, 180),
      Math.max(180, window.innerWidth - 16)
    )
    const menuHeight = menu?.offsetHeight ?? 0
    const placement =
      rect.bottom + 6 + menuHeight > window.innerHeight &&
      rect.top > menuHeight + 6
        ? 'top'
        : 'bottom'

    setPosition({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      top:
        placement === 'bottom'
          ? rect.bottom + 6
          : Math.max(8, rect.top - menuHeight - 6),
      width,
      placement
    })
  }

  useLayoutEffect(() => {
    if (!open) return
    updatePosition()
  }, [open, options.length])

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setOpen(false)
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setOpen(false)
      triggerRef.current?.focus()
    }

    const onReflow = (): void => updatePosition()

    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('resize', onReflow)
    window.addEventListener('scroll', onReflow, true)

    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('resize', onReflow)
      window.removeEventListener('scroll', onReflow, true)
    }
  }, [open, options.length])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={cn(
          'inline-flex h-9 min-w-[120px] items-center justify-between gap-2 rounded-card border border-border bg-surface px-3 text-sm text-fg transition-colors',
          'hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
          'disabled:pointer-events-none disabled:opacity-50',
          className
        )}
        disabled={disabled}
        title={title ?? selected?.label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="truncate">{selected?.label}</span>
        <Icon name="chevron-down" size={12} className="text-fg-subtle" />
      </button>

      {open
        ? createPortal(
            <div
              ref={menuRef}
              className={cn(
                'fixed z-[1000] max-h-72 overflow-y-auto rounded-card border border-border bg-surface-raised p-1 shadow-menu',
                position?.placement === 'top' ? 'is-top' : ''
              )}
              role="listbox"
              style={
                position
                  ? {
                      left: position.left,
                      top: position.top,
                      width: position.width
                    }
                  : { visibility: 'hidden' }
              }
            >
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  className={cn(
                    'flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                    'hover:bg-surface-hover hover:text-fg',
                    option.value === value
                      ? 'bg-surface-hover text-fg'
                      : 'text-fg-muted',
                    'disabled:pointer-events-none disabled:opacity-40'
                  )}
                  disabled={option.disabled}
                  title={option.label}
                  onClick={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                >
                  <span className="truncate">{option.label}</span>
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </>
  )
}
