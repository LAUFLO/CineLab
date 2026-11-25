import {
  forwardRef,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes
} from 'react'
import { cn } from './cn'

export type ControlSize = 'xs' | 'sm' | 'md' | 'lg'

const FIELD_CLASS =
  'w-full rounded-md border border-border bg-surface text-fg placeholder:text-fg-subtle outline-none transition-colors focus:border-border-strong disabled:opacity-50'

const INPUT_SIZES: Record<ControlSize, string> = {
  xs: 'h-[26px] px-2 text-xs',
  sm: 'h-7 px-2 text-xs',
  md: 'h-9 px-3 text-sm',
  lg: 'h-10 px-4 text-sm'
}

const TEXTAREA_SIZES: Record<ControlSize, string> = {
  xs: 'px-2 py-1.5 text-xs',
  sm: 'px-2 py-1.5 text-xs',
  md: 'px-3 py-2 text-sm',
  lg: 'px-4 py-2 text-sm'
}

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  unstyled?: boolean
  size?: ControlSize
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, unstyled, size = 'md', ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={
        unstyled
          ? className
          : cn(FIELD_CLASS, INPUT_SIZES[size], className)
      }
      {...props}
    />
  )
})

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  unstyled?: boolean
  size?: ControlSize
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className, unstyled, size = 'md', ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={
          unstyled
            ? className
            : cn(
                'min-h-24 resize-none overflow-y-auto',
                FIELD_CLASS,
                TEXTAREA_SIZES[size],
                className
              )
        }
        {...props}
      />
    )
  }
)
