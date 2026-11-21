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
    on: 'translate-x-[12px]',
    off: 'translate-x-[2px]'
  },
  md: {
    root: 'h-[18px] w-[32px]',
    knob: 'h-3 w-3',
    on: 'translate-x-[17px]',
    off: 'translate-x-[3px]'
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
        'relative inline-flex shrink-0 items-center rounded-[2px] transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
        metrics.root,
        checked ? 'bg-pick-bar' : 'bg-border-strong',
        disabled && 'pointer-events-none opacity-50',
        className
      )}
    >
      <span
        className={cn(
          'block bg-surface transition-transform',
          metrics.knob,
          checked ? metrics.on : metrics.off
        )}
      />
    </button>
  )
}
