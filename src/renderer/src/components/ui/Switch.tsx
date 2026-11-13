import { cn } from './cn'

export interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
  label?: string
}

export function Switch({
  checked,
  onChange,
  disabled,
  className,
  label
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-pill border transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
        checked
          ? 'border-accent bg-accent'
          : 'border-border bg-surface-hover',
        disabled && 'pointer-events-none opacity-50',
        className
      )}
    >
      <span
        className={cn(
          'block h-3.5 w-3.5 rounded-full bg-fg transition-transform',
          checked ? 'translate-x-[19px]' : 'translate-x-[3px]'
        )}
      />
    </button>
  )
}
