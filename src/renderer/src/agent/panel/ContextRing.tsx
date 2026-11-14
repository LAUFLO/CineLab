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
  return (
    <Button
      type="button"
      className={`agent-context-ring ${percent >= 80 ? 'is-high' : ''}`}
      title={title}
      onClick={onClick}
      disabled={disabled}
      unstyled
    >
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <circle className="agent-context-ring__track" cx="16" cy="16" r="13" />
        <circle
          className="agent-context-ring__value"
          cx="16"
          cy="16"
          r="13"
          pathLength={100}
          strokeDasharray={`${Math.max(0, Math.min(100, percent))} ${
            100 - Math.max(0, Math.min(100, percent))
          }`}
        />
      </svg>
      <span>{compacting ? '…' : `${percent}%`}</span>
    </Button>
  )
}
