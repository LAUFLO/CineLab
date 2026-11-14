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
    <div className="param-panel">
      {groups.map((group) => (
        <div className="param-panel__section" key={group.name}>
          <div className="param-panel__title">{group.name}</div>

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
                  className={`param-panel__grid${ratioGrid ? ' is-ratio' : ''}`}
                >
                  {param.options.map((option) => {
                    const ratio = ratioOf(option.label)

                    return (
                      <Button
                        key={option.value}
                        type="button"
                        className={`param-panel__option${
                          ratio ? ' param-panel__option--ratio' : ''
                        }${
                          String(option.value) === String(values[param.key]) &&
                          !custom
                            ? ' is-active'
                            : ''
                        }`}
                        onClick={() => onSelectPreset(param, option.value)}
                        unstyled
                      >
                        {ratio ? (
                          <span
                            className="param-panel__ratio"
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
                      className={`param-panel__option param-panel__option--custom${
                        custom ? ' is-active' : ''
                      }`}
                      onClick={() => onEnableCustom(param)}
                      unstyled
                    >
                      自定义
                    </Button>
                  ) : null}

                  {custom ? (
                    <Input
                      className="param-panel__custom-input"
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
                <div key={param.key} className="param-panel__grid is-two">
                  {[true, false].map((value) => (
                    <Button
                      key={String(value)}
                      type="button"
                      className={`param-panel__option${
                        Boolean(values[param.key]) === value ? ' is-active' : ''
                      }`}
                      onClick={() => onChangeValue(param.key, value)}
                      unstyled
                    >
                      {value ? '开启' : '关闭'}
                    </Button>
                  ))}
                </div>
              )
            }

            if (param.key === 'duration' && param.type === 'number') {
              const value = Number(
                values[param.key] ?? param.defaultValue ?? 5
              )

              return (
                <div key={param.key} className="param-panel__range">
                  <Input
                    type="range"
                    min={param.min ?? 1}
                    max={param.max ?? 30}
                    step={1}
                    value={value}
                    onChange={(event) =>
                      onChangeValue(param.key, Number(event.target.value))
                    }
                    unstyled
                  />
                  <span className="param-panel__range-value">{value}s</span>
                </div>
              )
            }

            return (
              <div key={param.key} className="param-panel__input-row">
                <span>{param.label}</span>
                <Input
                  className="param-input nodrag nopan"
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

      <div className="param-panel__switch-row">
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
