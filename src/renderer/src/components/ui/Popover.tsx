import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject
} from 'react'
import { createPortal } from 'react-dom'
import { cn } from './cn'

export interface PopoverProps {
  open: boolean
  onClose: () => void
  /** 触发按钮的 ref；Popover 根据它的位置定位。 */
  anchorRef: RefObject<HTMLElement | null>
  children: ReactNode
  width?: number
  /** start: 左对齐触发按钮；end: 右对齐。 */
  align?: 'start' | 'end' | 'center'
  /** 触发按钮随画布移动时持续跟随，用于分组工具栏等会平移的锚点。 */
  follow?: boolean
  className?: string
  ariaLabel?: string
}

interface PopoverPosition {
  left: number
  top: number
  width: number
}

const GAP = 6
const MARGIN = 8

/**
 * 通用浮层：任意内容 + 自动定位/翻转 + 点击外部/Esc 关闭。
 * 统一样式，业务代码不再自己写 `absolute + shadow-menu`。
 */
export function Popover({
  open,
  onClose,
  anchorRef,
  children,
  width = 224,
  align = 'start',
  follow = false,
  className,
  ariaLabel
}: PopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<PopoverPosition | null>(null)

  const updatePosition = useCallback((): void => {
    const anchor = anchorRef.current
    if (!anchor) return

    const rect = anchor.getBoundingClientRect()
    const panelHeight = panelRef.current?.offsetHeight ?? 0
    const nextWidth = Math.min(width, window.innerWidth - MARGIN * 2)
    const rawLeft =
      align === 'end'
        ? rect.right - nextWidth
        : align === 'center'
          ? rect.left + rect.width / 2 - nextWidth / 2
          : rect.left
    const placement =
      rect.bottom + GAP + panelHeight > window.innerHeight &&
      rect.top > panelHeight + GAP
        ? 'top'
        : 'bottom'
    const top =
      placement === 'bottom'
        ? rect.bottom + GAP
        : Math.max(MARGIN, rect.top - panelHeight - GAP)

    setPosition((current) => {
      const next = {
        left: Math.max(
          MARGIN,
          Math.min(rawLeft, window.innerWidth - nextWidth - MARGIN)
        ),
        top: Math.max(MARGIN, Math.min(top, window.innerHeight - MARGIN)),
        width: nextWidth
      }
      return current &&
        Math.abs(current.left - next.left) < 0.5 &&
        Math.abs(current.top - next.top) < 0.5 &&
        current.width === next.width
        ? current
        : next
    })
  }, [align, anchorRef, width])

  useLayoutEffect(() => {
    if (!open) return
    updatePosition()
    const frame = requestAnimationFrame(updatePosition)
    return () => cancelAnimationFrame(frame)
  }, [open, updatePosition])

  useEffect(() => {
    if (!open || !follow) return
    let frame = 0
    const tick = (): void => {
      updatePosition()
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [open, follow, updatePosition])

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node
      if (panelRef.current?.contains(target)) return
      if (anchorRef.current?.contains(target)) return
      onClose()
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      onClose()
    }
    const onReflow = (): void => updatePosition()

    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('resize', onReflow)
    window.addEventListener('scroll', onReflow, true)

    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('resize', onReflow)
      window.removeEventListener('scroll', onReflow, true)
    }
  }, [open, onClose, updatePosition, anchorRef])

  if (!open) return null

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={ariaLabel}
      onPointerDown={(event) => event.stopPropagation()}
      className={cn(
        'fixed z-[1000] max-h-[min(420px,calc(100vh-16px))] overflow-y-auto rounded-card border border-border bg-surface-raised p-1 shadow-menu',
        className
      )}
      style={{
        left: position?.left ?? MARGIN,
        top: position?.top ?? MARGIN,
        width: position?.width ?? width,
        visibility: position ? 'visible' : 'hidden'
      }}
    >
      {children}
    </div>,
    document.body
  )
}
