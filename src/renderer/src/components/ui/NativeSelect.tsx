import { forwardRef, type SelectHTMLAttributes } from 'react'
import { cn } from './cn'

const BASE =
  'h-9 w-full rounded-card border border-border bg-surface px-3 text-sm text-fg outline-none transition-colors focus:border-border-strong disabled:opacity-50'

export interface NativeSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Preserve existing custom styling without applying primitive styles. */
  unstyled?: boolean
}

export const NativeSelect = forwardRef<HTMLSelectElement, NativeSelectProps>(
  function NativeSelect({ className, unstyled, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={unstyled ? className : cn(BASE, className)}
        {...props}
      />
    )
  }
)
