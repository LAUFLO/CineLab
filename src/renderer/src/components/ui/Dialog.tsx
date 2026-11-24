import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../Icon'
import { IconButton } from './IconButton'
import { cn } from './cn'

export interface DialogProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  className?: string
  closeLabel?: string
  /** Render children inside a caller-styled panel without the default header. */
  bare?: boolean
  overlayClassName?: string
  panelClassName?: string
  ariaLabel?: string
  /** 点击遮罩是否关闭；表单类弹窗可传 false 防止误关，默认 true。 */
  closeOnOverlayClick?: boolean
}

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl'
} as const

/** 对话框表面：无内边距，供全出血布局使用。 */
export const DIALOG_SURFACE =
  'rounded-panel border border-border bg-surface-raised text-fg shadow-float'

/** bare 面板统一表面；尺寸、间距由调用方追加。 */
export const DIALOG_PANEL = `${DIALOG_SURFACE} p-[18px]`

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
  closeLabel = '关闭',
  bare = false,
  overlayClassName,
  panelClassName,
  ariaLabel,
  closeOnOverlayClick = true
}: DialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return

    previousFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null

    const panel = panelRef.current
    if (!panel) return
    const initialFocus =
      panel?.querySelector<HTMLElement>('[autofocus]') ??
      panel?.querySelector<HTMLElement>(
        'input:not([disabled]), textarea:not([disabled]), select:not([disabled])'
      ) ??
      panel?.querySelector<HTMLElement>(FOCUSABLE)
    initialFocus?.focus()

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCloseRef.current()
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

    // 原生 title 提示会被高 z-index 的弹窗遮住，弹窗内统一移除；
    // 可访问性由 aria-label 保留，后续可替换为自定义 tooltip。
    const titled = Array.from(
      panel.querySelectorAll<HTMLElement>('[title]')
    )
    const savedTitles = titled.map(
      (element) => [element, element.getAttribute('title')] as const
    )
    titled.forEach((element) => element.removeAttribute('title'))

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue
          const elements = [node, ...node.querySelectorAll<HTMLElement>('[title]')]
          for (const element of elements) {
            const title = element.getAttribute('title')
            if (title === null) continue
            savedTitles.push([element, title])
            element.removeAttribute('title')
          }
        }
      }
    })
    observer.observe(panel, { childList: true, subtree: true })

    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      observer.disconnect()
      for (const [element, title] of savedTitles) {
        if (title !== null && element.isConnected) {
          element.setAttribute('title', title)
        }
      }
      previousFocus.current?.focus?.()
    }
  }, [open])

  if (!open) return null

  const handleOverlayPointerDown = (): void => {
    if (closeOnOverlayClick) onClose()
  }

  if (bare) {
    return createPortal(
      <div
        className={overlayClassName}
        data-shortcut-block
        onPointerDown={handleOverlayPointerDown}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          className={panelClassName}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {children}
        </div>
      </div>,
      document.body
    )
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[900] flex items-center justify-center bg-overlay p-4"
      data-shortcut-block
      onPointerDown={handleOverlayPointerDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={cn('w-full', DIALOG_PANEL, SIZES[size], className)}
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
