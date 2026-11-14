import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from './cn'

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  variant?: 'ghost' | 'secondary'
  size?: 'xs' | 'sm' | 'md'
  /** Preserve an existing custom class without applying primitive styles. */
  unstyled?: boolean
}

const VARIANTS = {
  ghost: 'text-fg-muted hover:bg-surface-hover hover:text-fg',
  secondary:
    'border border-border bg-surface-raised text-fg hover:bg-surface-hover'
} as const

const SIZES = {
  xs: 'h-5 w-5',
  sm: 'h-7 w-7',
  md: 'h-8 w-8'
} as const

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      className,
      label,
      title,
      variant = 'ghost',
      size = 'sm',
      unstyled,
      type = 'button',
      ...props
    },
    ref
  ) {
    return (
      <button
        ref={ref}
        type={type}
        aria-label={label}
        title={title ?? label}
        className={
          unstyled
            ? className
            : cn(
                'inline-flex shrink-0 items-center justify-center rounded-[8px] transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                'disabled:pointer-events-none disabled:opacity-50',
                VARIANTS[variant],
                SIZES[size],
                className
              )
        }
        {...props}
      />
    )
  }
)
