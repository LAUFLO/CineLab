import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../Icon'
import { IconButton } from './IconButton'
import { cn } from './cn'

export interface DialogProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  className?: string
  closeLabel?: string
}

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl'
} as const

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  className,
  closeLabel = '关闭'
}: DialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return

    previousFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null

    const panel = panelRef.current
    panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus()

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panel) return

      const items = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE)
      ).filter((element) => element.offsetParent !== null)
      if (items.length === 0) return

      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      previousFocus.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[900] flex items-center justify-center bg-overlay p-4"
      onPointerDown={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          'w-full rounded-panel border border-border bg-surface-raised p-5 text-fg shadow-menu',
          SIZES[size],
          className
        )}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-medium text-fg">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-2 text-sm text-fg-muted">
                {description}
              </p>
            ) : null}
          </div>
          <IconButton label={closeLabel} size="sm" onClick={onClose}>
            <Icon name="close" size={15} />
          </IconButton>
        </div>

        {children ? <div className="mt-4">{children}</div> : null}
        {footer ? (
          <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body
  )
}
