import type { ReactNode } from 'react'
import { cn } from './cn'

export type ToastTone = 'default' | 'success' | 'error'

export interface ToastProps {
  children: ReactNode
  tone?: ToastTone
  className?: string
  /** Preserve an existing custom class without applying primitive styles. */
  unstyled?: boolean
}

export function Toast({
  children,
  tone = 'default',
  className,
  unstyled
}: ToastProps) {
  return (
    <div
      role="status"
      className={
        unstyled
          ? className
          : cn(
              'fixed bottom-6 left-1/2 z-[1100] -translate-x-1/2 rounded-card border px-4 py-2 text-sm shadow-float',
              tone === 'error'
                ? 'border-danger bg-surface-raised text-danger'
                : tone === 'success'
                  ? 'border-success bg-surface-raised text-success'
                  : 'border-border bg-surface-raised text-fg',
              className
            )
      }
    >
      {children}
    </div>
  )
}
