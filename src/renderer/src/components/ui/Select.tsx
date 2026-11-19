import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../Icon'
import { cn } from './cn'

export interface SelectOption<T extends string> {
  value: T
  label: string
  disabled?: boolean
  /** 置灰时显示的原因 */
  hint?: string
}

interface SelectProps<T extends string> {
  value: T
  options: SelectOption<T>[]
  onChange: (value: T) => void
  disabled?: boolean
  className?: string
  title?: string
  id?: string
  name?: string
  ariaLabel?: string
  /** trigger: 菜单与按钮同宽；auto: 至少 180px */
  menuWidth?: 'trigger' | 'auto'
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
  title,
  id,
  name,
  ariaLabel,
  menuWidth = 'auto'
}: SelectProps<T>) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<MenuPosition | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const selected =
    options.find((option) => option.value === value) ?? options[0]

  const updatePosition = useCallback((): void => {
    const trigger = triggerRef.current
    const menu = menuRef.current
    if (!trigger) return

    const rect = trigger.getBoundingClientRect()
    const width =
      menuWidth === 'trigger'
        ? Math.max(rect.width, 96)
        : Math.min(
            Math.max(rect.width, 180),
            Math.max(180, window.innerWidth - 16)
          )
    const menuHeight = menu?.offsetHeight ?? 0
    const placement =
      rect.bottom + 6 + menuHeight > window.innerHeight &&
      rect.top > menuHeight + 6
        ? 'top'
        : 'bottom'

    const next: MenuPosition = {
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      top:
        placement === 'bottom'
          ? rect.bottom + 6
          : Math.max(8, rect.top - menuHeight - 6),
      width,
      placement
    }

    setPosition((current) =>
      current &&
      current.left === next.left &&
      current.top === next.top &&
      current.width === next.width &&
      current.placement === next.placement
        ? current
        : next
    )
  }, [menuWidth])

  useLayoutEffect(() => {
    if (!open) return

    updatePosition()

    // PromptBar 会跟随节点移动并带入 180ms 入场动画，菜单需要持续跟住，
    // 否则打开后再移动会停在旧位置。
    let frame = 0
    const started = performance.now()
    const track = (): void => {
      updatePosition()
      if (performance.now() - started < 320) {
        frame = requestAnimationFrame(track)
      }
    }
    frame = requestAnimationFrame(track)

    return () => cancelAnimationFrame(frame)
  }, [open, options.length, updatePosition])

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
  }, [open, options.length, updatePosition])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={cn(
          'inline-flex h-9 min-w-[120px] items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 text-sm text-fg transition-colors',
          'hover:border-border-selected hover:bg-surface-hover focus-visible:border-border-selected focus-visible:outline-none',
          'disabled:pointer-events-none disabled:opacity-55',
          className
        )}
        id={id}
        name={name}
        aria-label={ariaLabel}
        disabled={disabled}
        title={title ?? selected?.label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="truncate">{selected?.label}</span>
        <Icon
          name="chevron-down"
          size={12}
          className={cn(
            'text-fg-muted transition-transform duration-150',
            open && 'rotate-180'
          )}
        />
      </button>

      {open
        ? createPortal(
            <div
              ref={menuRef}
              className={cn(
                'fixed z-[1000] max-h-[280px] overflow-y-auto rounded-card border border-border bg-surface-raised p-1 shadow-menu',
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
                    'flex min-h-8 w-full items-center rounded-md px-2 text-left text-sm leading-8 transition-colors',
                    'hover:bg-surface-hover hover:text-fg',
                    option.value === value
                      ? 'bg-surface-hover font-medium text-fg'
                      : 'text-fg-muted',
                    'disabled:pointer-events-none disabled:opacity-50'
                  )}
                  disabled={option.disabled}
                  title={option.hint ?? option.label}
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
