import type { ParamDef } from '@shared/provider-schema'
import { Button, Input, Switch } from '../../components/ui'
import { ratioOf } from '../promptbar-model'

interface ParamPanelProps {
  groups: Array<{ name: string; params: ParamDef[] }>
  values: Record<string, unknown>
  watermark: boolean
  isCustom: (param: ParamDef) => boolean
  allowsCustom: (param: ParamDef) => boolean
  onSelectPreset: (param: ParamDef, value: string) => void
  onEnableCustom: (param: ParamDef) => void
  onChangeValue: (key: string, value: unknown) => void
  onWatermarkChange: (next: boolean) => void
}

const PANEL =
  'absolute bottom-[34px] left-0 z-[70] max-h-[62vh] w-[420px] overflow-y-auto rounded-[16px] border border-border bg-surface p-4 shadow-menu animate-[menu-in_120ms_ease-out]'
const SECTION = '[&+&]:mt-[18px]'
const SECTION_TITLE = 'mb-2 text-xs text-fg-muted'
const GRID = 'grid gap-2'
const OPTION =
  'min-h-[38px] !rounded-[9px] !px-2 !py-1.5 !font-normal text-xs bg-surface-hover'
const OPTION_IDLE = '!text-fg-muted hover:!text-fg'
const OPTION_ACTIVE =
  '!border-border-selected !bg-surface-raised !text-fg hover:!border-border-selected hover:!text-fg'
const OPTION_RATIO = 'flex-col !min-h-[62px] gap-[5px]'
const OPTION_CUSTOM = 'border-dashed'
const OPTION_CUSTOM_IDLE = '!text-fg-subtle hover:!text-fg'
const OPTION_CUSTOM_ACTIVE = '!border-solid !text-fg hover:!text-fg'
const CUSTOM_INPUT =
  '!col-span-full !h-[34px] !rounded-[8px] !border-border-strong !bg-surface !px-[9px] !text-xs focus:!border-border-selected'
const RATIO_BOX = 'w-5 max-h-5 rounded-[3px] border-[1.5px] border-current'
const RANGE = 'flex items-center gap-3'
const RANGE_INPUT = '!h-auto flex-1 !border-0 !bg-transparent !p-0 accent-fg'
const RANGE_VALUE = 'min-w-[38px] text-right text-xs text-fg tabular-nums'
const INPUT_ROW = 'flex items-center gap-2.5 text-xs text-fg-muted'
const ROW_INPUT =
  'nodrag nopan !h-[30px] flex-1 !rounded-[6px] !border-border-strong !bg-surface-hover !px-2 !text-xs focus:!border-border-selected'
const SWITCH_ROW =
  'mt-[18px] flex items-center justify-between border-t border-divider pt-3.5 text-xs text-fg-muted'

export function ParamPanel({
  groups,
  values,
  watermark,
  isCustom,
  allowsCustom,
  onSelectPreset,
  onEnableCustom,
  onChangeValue,
  onWatermarkChange
}: ParamPanelProps) {
  return (
    <div className={PANEL}>
      {groups.map((group) => (
        <div className={SECTION} key={group.name}>
          <div className={SECTION_TITLE}>{group.name}</div>

          {group.params.map((param) => {
            if (param.type === 'select' && param.options) {
              const ratioGrid = param.options.every((option) =>
                ratioOf(option.label)
              )
              const custom = isCustom(param)
              const allowCustom = allowsCustom(param)

              return (
                <div
                  key={param.key}
                  className={`${GRID} ${ratioGrid ? 'grid-cols-4' : 'grid-cols-3'}`}
                >
                  {param.options.map((option) => {
                    const ratio = ratioOf(option.label)
                    const selected =
                      String(option.value) === String(values[param.key]) &&
                      !custom

                    return (
                      <Button
                        key={option.value}
                        type="button"
                        variant="secondary"
                        size="none"
                        className={`${OPTION} ${
                          ratio ? OPTION_RATIO : ''
                        } ${selected ? OPTION_ACTIVE : OPTION_IDLE}`}
                        onClick={() => onSelectPreset(param, option.value)}
                      >
                        {ratio ? (
                          <span
                            className={RATIO_BOX}
                            style={{ aspectRatio: ratio }}
                          />
                        ) : null}
                        {option.label}
                      </Button>
                    )
                  })}

                  {allowCustom ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="none"
                      className={`${OPTION} ${OPTION_CUSTOM} ${
                        custom ? OPTION_CUSTOM_ACTIVE : OPTION_CUSTOM_IDLE
                      }`}
                      onClick={() => onEnableCustom(param)}
                    >
                      自定义
                    </Button>
                  ) : null}

                  {custom ? (
                    <Input
                      className={CUSTOM_INPUT}
                      value={String(values[param.key] ?? '')}
                      placeholder={
                        param.key === 'ratio'
                          ? '例如 2:1'
                          : param.key === 'size'
                            ? '例如 2048x1152'
                            : '输入自定义值'
                      }
                      onChange={(event) =>
                        onChangeValue(param.key, event.target.value)
                      }
                    />
                  ) : null}
                </div>
              )
            }

            if (param.type === 'boolean') {
              return (
                <div key={param.key} className={`${GRID} grid-cols-2`}>
                  {[true, false].map((value) => (
                    <Button
                      key={String(value)}
                      type="button"
                      variant="secondary"
                      size="none"
                      className={`${OPTION} ${
                        Boolean(values[param.key]) === value
                          ? OPTION_ACTIVE
                          : OPTION_IDLE
                      }`}
                      onClick={() => onChangeValue(param.key, value)}
                    >
                      {value ? '开启' : '关闭'}
                    </Button>
                  ))}
                </div>
              )
            }

            if (param.key === 'duration' && param.type === 'number') {
              const value = Number(values[param.key] ?? param.defaultValue ?? 5)

              return (
                <div key={param.key} className={RANGE}>
                  <Input
                    type="range"
                    min={param.min ?? 1}
                    max={param.max ?? 30}
                    step={1}
                    value={value}
                    className={RANGE_INPUT}
                    onChange={(event) =>
                      onChangeValue(param.key, Number(event.target.value))
                    }
                  />
                  <span className={RANGE_VALUE}>{value}s</span>
                </div>
              )
            }

            return (
              <div key={param.key} className={INPUT_ROW}>
                <span>{param.label}</span>
                <Input
                  className={ROW_INPUT}
                  type={param.type === 'number' ? 'number' : 'text'}
                  value={String(values[param.key] ?? '')}
                  onChange={(event) => {
                    const raw = event.target.value
                    const next = param.type === 'number' ? Number(raw) : raw
                    if (
                      param.type === 'number' &&
                      !Number.isFinite(next as number)
                    ) {
                      return
                    }
                    onChangeValue(param.key, next)
                  }}
                />
              </div>
            )
          })}
        </div>
      ))}

      <div className={SWITCH_ROW}>
        <span>AI 水印</span>
        <Switch
          label="AI 水印"
          size="sm"
          checked={watermark}
          onChange={onWatermarkChange}
        />
      </div>
    </div>
  )
}
