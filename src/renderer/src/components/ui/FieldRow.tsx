import type { ReactNode } from 'react'
import { cn } from './cn'

export interface FieldRowProps {
  children: ReactNode
  className?: string
}

/** 同行控件容器：保证同一行的输入框、下拉和按钮使用一致的尺寸。 */
export function FieldRow({ children, className }: FieldRowProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>{children}</div>
  )
}
