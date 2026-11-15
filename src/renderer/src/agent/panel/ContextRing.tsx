import { Button } from '../../components/ui'

export function ContextRing({
  percent,
  compacting,
  title,
  disabled,
  onClick
}: {
  percent: number
  compacting: boolean
  title: string
  disabled: boolean
  onClick: () => void
}) {
  const clamped = Math.max(0, Math.min(100, percent))
  return (
    <Button
      type="button"
      className="relative size-[30px] shrink-0 !rounded-full !border-0 !bg-transparent !font-normal p-0 !text-fg-subtle hover:!text-fg disabled:!opacity-[0.65]"
      title={title}
      onClick={onClick}
      disabled={disabled}
      variant="secondary"
      size="none"
    >
      <svg
        viewBox="0 0 32 32"
        aria-hidden="true"
        className="absolute inset-0 h-full w-full -rotate-90"
      >
        <circle
          className="fill-none stroke-border [stroke-width:2.5]"
          cx="16"
          cy="16"
          r="13"
        />
        <circle
          className={`fill-none [stroke-linecap:round] [stroke-width:2.5] transition-[stroke-dasharray] duration-300 ease-out ${
            percent >= 80 ? 'stroke-warning' : 'stroke-accent'
          }`}
          cx="16"
          cy="16"
          r="13"
          pathLength={100}
          strokeDasharray={`${clamped} ${100 - clamped}`}
        />
      </svg>
      <span className="relative text-[9px] leading-none text-fg-muted">
        {compacting ? '…' : `${percent}%`}
      </span>
    </Button>
  )
}
