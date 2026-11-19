import {
  Children,
  forwardRef,
  isValidElement,
  type ChangeEvent,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes
} from 'react'
import { Select } from './Select'

export interface NativeSelectProps
  extends SelectHTMLAttributes<HTMLSelectElement> {
  /** 兼容旧参数；统一后不再使用原生 select。 */
  unstyled?: boolean
}

type OptionElement = ReactElement<{
  value?: string | number
  children?: ReactNode
  disabled?: boolean
}>

/**
 * 兼容层：保留原有 `<option>` 用法，内部统一渲染 `Select`。
 * 这样设置页、检查器、时间轴的下拉都使用同一套浮层样式。
 */
export const NativeSelect = forwardRef<HTMLSelectElement, NativeSelectProps>(
  function NativeSelect(
    {
      className,
      children,
      value,
      onChange,
      disabled,
      id,
      name,
      title,
      'aria-label': ariaLabel,
      unstyled: _unstyled
    },
    ref
  ) {
    void ref
    const options = Children.toArray(children)
      .filter((child): child is OptionElement => isValidElement(child))
      .map((child) => ({
        value: String(child.props.value ?? child.props.children ?? ''),
        label: String(child.props.children ?? ''),
        disabled: child.props.disabled
      }))
    const current =
      value === undefined ? options[0]?.value ?? '' : String(value)

    return (
      <Select
        value={current}
        options={options}
        onChange={(next) => {
          if (!onChange) return
          const event = {
            target: { value: next, name },
            currentTarget: { value: next, name }
          } as unknown as ChangeEvent<HTMLSelectElement>
          onChange(event)
        }}
        disabled={disabled}
        className={className}
        title={title}
        id={id}
        name={name}
        ariaLabel={ariaLabel}
        menuWidth="trigger"
      />
    )
  }
)
