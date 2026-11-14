import { cn } from './cn'

export interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
  label?: string
  size?: 'sm' | 'md'
}

const SIZES = {
  sm: {
    root: 'h-3 w-[22px]',
    knob: 'h-2 w-2',
    on: 'translate-x-[10px]',
    off: 'translate-x-[2px]'
  },
  md: {
    root: 'h-[17px] w-[30px]',
    knob: 'h-[13px] w-[13px]',
    on: 'translate-x-[13px]',
    off: 'translate-x-[2px]'
  }
} as const

export function Switch({
  checked,
  onChange,
  disabled,
  className,
  label,
  size = 'md'
}: SwitchProps) {
  const metrics = SIZES[size]

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-pill transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
        metrics.root,
        checked ? 'bg-pick-bar' : 'bg-border-strong',
        disabled && 'pointer-events-none opacity-50',
        className
      )}
    >
      <span
        className={cn(
          'block rounded-full bg-surface transition-transform',
          metrics.knob,
          checked ? metrics.on : metrics.off
        )}
      />
    </button>
  )
}
