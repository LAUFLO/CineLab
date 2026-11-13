import type { ReactNode } from 'react'
import { cn } from './cn'

export interface FieldProps {
  label: ReactNode
  htmlFor?: string
  hint?: ReactNode
  error?: ReactNode
  children: ReactNode
  className?: string
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className
}: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-fg-muted">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-fg-subtle">{hint}</p>
      ) : null}
    </div>
  )
}

export interface SettingRowProps {
  title: ReactNode
  hint?: ReactNode
  children: ReactNode
  className?: string
}

export function SettingRow({
  title,
  hint,
  children,
  className
}: SettingRowProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 border-b border-border py-3 last:border-b-0',
        className
      )}
    >
      <div className="min-w-0">
        <div className="text-sm text-fg">{title}</div>
        {hint ? <div className="mt-0.5 text-xs text-fg-subtle">{hint}</div> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}
