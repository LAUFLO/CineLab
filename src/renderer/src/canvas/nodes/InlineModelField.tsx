import { Button, Select } from '../../components/ui'
import { useSettingsStore } from '../../stores/settings'
import type { ImageModelOption } from './inline-generation'

interface InlineModelFieldProps {
  models: ImageModelOption[]
  value: string
  onChange: (value: string) => void
  label: string
  disabled?: boolean
}

/**
 * 内联编辑器统一的模型选择。
 * 没有任何可用模型时显示配置引导，而不是一个空的灰色下拉框。
 */
export function InlineModelField({
  models,
  value,
  onChange,
  label,
  disabled
}: InlineModelFieldProps) {
  const openSettings = useSettingsStore((state) => state.openPanel)
  const usable = models.some((item) => !item.disabled)

  if (!usable) {
    return (
      <div className="flex items-center justify-between gap-2 text-[11px] leading-[1.5] text-fg-subtle">
        <span>
          {models.length === 0
            ? '未配置图片模型，请先到「设置 → 模型与运行时」添加。'
            : '当前没有可用的图片模型，请检查 API Key 或模型输入能力。'}
        </span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="shrink-0"
          onClick={() => openSettings('models')}
        >
          去配置
        </Button>
      </div>
    )
  }

  return (
    <Select
      size="sm"
      value={value}
      options={models.map((item) => ({
        value: item.key,
        label: `${item.providerName} · ${item.model.name}`,
        disabled: item.disabled,
        hint: item.reason
      }))}
      onChange={onChange}
      className="w-full"
      menuWidth="trigger"
      ariaLabel={label}
      disabled={disabled}
    />
  )
}
