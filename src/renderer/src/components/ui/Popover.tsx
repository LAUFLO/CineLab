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
  /** 向上展开时，浮窗底部不越过该元素顶部，用于避免遮挡输入框。 */
  avoidRef?: RefObject<HTMLElement | null>
  children: ReactNode
  width?: number
  /** start: 左对齐触发按钮；end: 右对齐。 */
  align?: 'start' | 'end' | 'center'
  /** 触发按钮随画布移动时持续跟随，用于分组工具栏等会平移的锚点。 */
  follow?: boolean
  /** auto: 按可用空间翻转；top/bottom: 强制方向。 */
  placement?: 'auto' | 'top' | 'bottom'
  /** 面板最大高度，默认 420。 */
  maxHeight?: number
  /** 期望高度；实际高度会按可用空间与 maxHeight 收缩，未指定时由内容决定。 */
  height?: number
  /** 与锚点的间距，默认 6。 */
  gap?: number
  /** 不套用默认内边距与滚动，由调用方控制。 */
  bare?: boolean
  className?: string
  ariaLabel?: string
}

interface PopoverPosition {
  left: number
  top: number
  width: number
  height: number | null
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
  avoidRef,
  children,
  width = 224,
  align = 'start',
  follow = false,
  placement: preferredPlacement = 'auto',
  maxHeight = 420,
  height,
  gap = GAP,
  bare = false,
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
      preferredPlacement !== 'auto'
        ? preferredPlacement
        : rect.bottom + gap + panelHeight > window.innerHeight &&
            rect.top > panelHeight + gap
          ? 'top'
          : 'bottom'
    const available =
      placement === 'top'
        ? Math.max(
            120,
            (avoidRef?.current?.getBoundingClientRect().top ?? rect.top) -
              gap -
              MARGIN
          )
        : Math.max(120, window.innerHeight - rect.bottom - gap - MARGIN)
    const nextHeight =
      height === undefined ? null : Math.min(height, maxHeight, available)
    const effectiveHeight = nextHeight ?? panelHeight
    const top =
      placement === 'bottom'
        ? rect.bottom + gap
        : Math.max(MARGIN, rect.top - effectiveHeight - gap)

    setPosition((current) => {
      const next = {
        left: Math.max(
          MARGIN,
          Math.min(rawLeft, window.innerWidth - nextWidth - MARGIN)
        ),
        top: Math.max(MARGIN, Math.min(top, window.innerHeight - MARGIN)),
        width: nextWidth,
        height: nextHeight
      }
      return current &&
        Math.abs(current.left - next.left) < 0.5 &&
        Math.abs(current.top - next.top) < 0.5 &&
        current.width === next.width &&
        current.height === next.height
        ? current
        : next
    })
  }, [align, anchorRef, avoidRef, width, preferredPlacement, height, maxHeight, gap])

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
        'fixed z-[1000] rounded-card border border-border bg-surface-raised shadow-menu',
        bare ? '' : 'overflow-y-auto p-1',
        className
      )}
      style={{
        left: position?.left ?? MARGIN,
        top: position?.top ?? MARGIN,
        width: position?.width ?? width,
        height: position?.height ?? undefined,
        maxHeight: `min(${maxHeight}px, calc(100vh - 16px))`,
        visibility: position ? 'visible' : 'hidden'
      }}
    >
      {children}
    </div>,
    document.body
  )
}
