import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from './cn'

const FIELD_CLASS =
  'w-full rounded-card border border-border bg-surface px-3 text-sm text-fg placeholder:text-fg-subtle outline-none transition-colors focus:border-border-strong disabled:opacity-50'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn('h-9', FIELD_CLASS, className)} {...props} />
  }
)

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn('min-h-24 resize-y py-2', FIELD_CLASS, className)}
      {...props}
    />
  )
})
