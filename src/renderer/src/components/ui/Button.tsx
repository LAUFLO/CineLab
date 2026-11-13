import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from './cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Preserve an existing custom class without applying primitive styles. */
  unstyled?: boolean
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-fg text-fg-inverse',
  secondary:
    'border border-border text-fg-muted hover:border-border-strong hover:text-fg',
  ghost: 'text-fg-muted hover:bg-surface-hover hover:text-fg',
  danger: 'bg-danger text-fg-inverse'
}

const SIZES: Record<ButtonSize, string> = {
  xs: 'h-[26px] gap-1 rounded-[7px] px-[10px] text-xs',
  sm: 'h-7 gap-1.5 px-[10px] text-xs',
  md: 'h-[34px] gap-1.5 px-4 text-[13px]',
  lg: 'h-10 gap-2 px-4 text-sm'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      className,
      variant = 'secondary',
      size = 'md',
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
        className={
          unstyled
            ? className
            : cn(
                'inline-flex items-center justify-center rounded-[8px] font-medium transition-colors',
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
