import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  CAPABILITY_LABEL,
  type ModelDef,
  type ParamDef,
  type ParamOption
} from '@shared/provider-schema'
import { paramTemplatesFor, type ParamTemplate } from '@shared/param-presets'
import { Icon } from '../../components/Icon'
import { Select } from '../../components/Select'

interface ModelParamsDialogProps {
  model: ModelDef | null
  onCancel: () => void
  onSave: (params: ParamDef[]) => void
}

type ParamRow = ParamDef

const TYPE_LABEL: Record<ParamDef['type'], string> = {
  select: '下拉选择',
  number: '数字',
  text: '文本',
  boolean: '开关'
}

function cloneDef(def: ParamDef): ParamRow {
  return structuredClone(def)
}

function defaultFor(type: ParamDef['type']): ParamDef['defaultValue'] {
  if (type === 'number') return 1
  if (type === 'boolean') return false
  return ''
}

function optionSummary(def: ParamDef): string {
  if (def.type === 'select') {
    const count = def.options?.length ?? 0
    return `${count} 个选项 · 默认 ${
      def.options?.find((option) => option.value === def.defaultValue)?.label ??
      def.options?.[0]?.label ??
      '—'
    }`
  }
  if (def.type === 'number') return `默认 ${def.defaultValue ?? '—'}`
  if (def.type === 'boolean') return def.defaultValue ? '默认开启' : '默认关闭'
  return `默认 ${def.defaultValue || '空'}`
}

export function ModelParamsDialog({
  model,
  onCancel,
  onSave
}: ModelParamsDialogProps) {
  const [rows, setRows] = useState<ParamRow[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!model) {
      setRows([])
      return
    }
    setError(null)
    setRows(model.params.map(cloneDef))
  }, [model])

  const templates = model ? paramTemplatesFor(model.capability) : []
  const existingKeys = useMemo(
    () => new Set(rows.map((row) => row.key.trim()).filter(Boolean)),
    [rows]
  )

  if (!model) return null

  const updateRow = (index: number, patch: Partial<ParamRow>): void => {
    setError(null)
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row
      )
    )
  }

  const addTemplate = (template: ParamTemplate): void => {
    if (existingKeys.has(template.def.key)) return
    setError(null)
    setRows((current) => [...current, cloneDef(template.def)])
  }

  const addAllTemplates = (): void => {
    const missing = templates.filter(
      (template) => !existingKeys.has(template.def.key)
    )
    if (missing.length === 0) return
    setError(null)
    setRows((current) => [
      ...current,
      ...missing.map((template) => cloneDef(template.def))
    ])
  }

  const addCustom = (): void => {
    const index = rows.length + 1
    setError(null)
    setRows((current) => [
      ...current,
      {
        key: `param_${index}`,
        label: '自定义参数',
        type: 'select',
        options: [{ value: `value_${index}`, label: '选项 1' }],
        defaultValue: `value_${index}`,
        group: '其它'
      }
    ])
  }

  const removeRow = (index: number): void => {
    setError(null)
    setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))
  }

  const changeType = (index: number, type: ParamDef['type']): void => {
    const row = rows[index]
    if (!row) return

    if (type === 'select') {
      const options =
        row.options && row.options.length > 0
          ? row.options
          : [{ value: 'value', label: '选项 1' }]
      updateRow(index, {
        type,
        options,
        defaultValue: options[0]?.value,
        allowCustom:
          row.allowCustom ??
          ['size', 'ratio', 'resolution'].includes(row.key)
      })
      return
    }

    updateRow(index, {
      type,
      options: undefined,
      defaultValue:
        type === 'number'
          ? Number(row.defaultValue ?? 1) || 1
          : type === 'boolean'
            ? Boolean(row.defaultValue)
            : String(row.defaultValue ?? '')
    })
  }

  const convertDurationToRange = (index: number): void => {
    const row = rows[index]
    if (!row) return

    const values = (row.options ?? [])
      .map((option) => Number(option.value))
      .filter((value) => Number.isFinite(value))

    if (values.length < 2) {
      setError('时长选项不足两个，无法推导范围')
      return
    }

    const min = Math.min(...values)
    const max = Math.max(...values)
    const current = Number(row.defaultValue)
    const defaultValue = Number.isFinite(current)
      ? Math.min(max, Math.max(min, current))
      : min

    updateRow(index, {
      type: 'number',
      options: undefined,
      defaultValue,
      min,
      max,
      allowCustom: false,
      group: row.group?.trim() || '视频时长'
    })
  }

  const updateOption = (
    rowIndex: number,
    optionIndex: number,
    patch: Partial<ParamOption>
  ): void => {
    setError(null)
    setRows((current) =>
      current.map((row, index) => {
        if (index !== rowIndex) return row
        const options = (row.options ?? []).map((option, currentIndex) =>
          currentIndex === optionIndex ? { ...option, ...patch } : option
        )
        return { ...row, options }
      })
    )
  }

  const addOption = (rowIndex: number): void => {
    setError(null)
    setRows((current) =>
      current.map((row, index) => {
        if (index !== rowIndex) return row
        const options = [
          ...(row.options ?? []),
          {
            value: `value_${(row.options?.length ?? 0) + 1}`,
            label: `选项 ${(row.options?.length ?? 0) + 2}`
          }
        ]
        return { ...row, options }
      })
    )
  }

  const removeOption = (rowIndex: number, optionIndex: number): void => {
    setError(null)
    setRows((current) =>
      current.map((row, index) => {
        if (index !== rowIndex) return row
        const options = (row.options ?? []).filter(
          (_, currentIndex) => currentIndex !== optionIndex
        )
        const defaultValue = options.some(
          (option) => String(option.value) === String(row.defaultValue)
        )
          ? row.defaultValue
          : options[0]?.value
        return { ...row, options, defaultValue }
      })
    )
  }

  const submit = (): void => {
    const problems: string[] = []
    const seen = new Set<string>()

    const params: ParamDef[] = []

    rows.forEach((row, index) => {
      const key = row.key.trim()
      const label = row.label.trim()
      const position = `第 ${index + 1} 个参数`

      if (!label) problems.push(`${position}缺少显示名`)
      if (!key) problems.push(`${position}缺少接口字段名`)
      if (key && seen.has(key)) problems.push(`接口字段名重复：${key}`)
      if (key) seen.add(key)

      let options: ParamOption[] | undefined
      let defaultValue = row.defaultValue

      if (row.type === 'select') {
        options = (row.options ?? [])
          .map((option) => ({
            value: option.value.trim(),
            label: option.label.trim()
          }))
          .filter((option) => option.value || option.label)

        if (options.length === 0) {
          problems.push(`${position}至少需要一个选项`)
        } else if (options.some((option) => !option.value)) {
          problems.push(`${position}有选项缺少接口值`)
        } else if (options.some((option) => !option.label)) {
          problems.push(`${position}有选项缺少显示名`)
        }

        const matched = options.find(
          (option) => String(option.value) === String(defaultValue)
        )
        defaultValue = matched?.value ?? options[0]?.value
      } else if (row.type === 'number') {
        const number = Number(defaultValue)
        if (!Number.isFinite(number)) {
          problems.push(`${position}默认值必须是数字`)
        } else {
          defaultValue = number
        }
        if (
          row.min !== undefined &&
          row.max !== undefined &&
          Number(row.min) > Number(row.max)
        ) {
          problems.push(`${position}最小值不能大于最大值`)
        }
      } else if (row.type === 'boolean') {
        defaultValue = Boolean(defaultValue)
      } else {
        defaultValue = String(defaultValue ?? '')
      }

      params.push({
        key,
        label,
        type: row.type,
        ...(row.group?.trim() ? { group: row.group.trim() } : {}),
        ...(options && options.length > 0 ? { options } : {}),
        ...(defaultValue !== undefined ? { defaultValue } : {}),
        ...(row.min !== undefined ? { min: Number(row.min) } : {}),
        ...(row.max !== undefined ? { max: Number(row.max) } : {}),
        ...(row.allowCustom ? { allowCustom: true } : {})
      })
    })

    if (problems.length > 0) {
      setError(problems[0])
      return
    }

    onSave(params)
  }

  return createPortal(
    <div className="settings-overlay" onPointerDown={onCancel}>
      <div
        className="operation-dialog model-params-dialog"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="operation-dialog__header">
          <div>
            <div className="operation-dialog__title">模型参数</div>
            <div className="operation-dialog__subtitle">
              {model.name} · {CAPABILITY_LABEL[model.capability]}
            </div>
          </div>
          <button
            type="button"
            className="operation-dialog__close"
            title="关闭"
            onClick={onCancel}
          >
            <Icon name="close" size={14} />
          </button>
        </header>

        <div className="model-params__intro">
          这些参数会显示在 Prompt Bar 的「生成设置」里。第一次配置可以直接添加常用参数，不需要了解接口字段名。
        </div>

        <div className="model-params__templates-head">
          <div>
            <div className="model-params__templates-title">常用参数</div>
            <div className="model-params__templates-desc">
              点击卡片添加；已添加的不会重复
            </div>
          </div>
          <button
            type="button"
            className="btn-secondary btn-small"
            disabled={templates.every((template) =>
              existingKeys.has(template.def.key)
            )}
            onClick={addAllTemplates}
          >
            全部添加
          </button>
        </div>

        <div className="model-params__template-grid">
          {templates.map((template) => {
            const added = existingKeys.has(template.def.key)
            return (
              <button
                key={template.id}
                type="button"
                className={`model-params__template${added ? ' is-added' : ''}`}
                disabled={added}
                onClick={() => addTemplate(template)}
              >
                <div className="model-params__template-head">
                  <span className="model-params__template-name">
                    {template.def.label}
                  </span>
                  <span className="model-params__template-action">
                    {added ? '已添加' : '+ 添加'}
                  </span>
                </div>
                <div className="model-params__template-desc">
                  {template.description}
                </div>
                <div className="model-params__template-preview">
                  {optionSummary(template.def)}
                </div>
              </button>
            )
          })}
        </div>

        <div className="model-params__list">
          {rows.length === 0 ? (
            <div className="model-params__empty">
              <div>还没有参数</div>
              <div>从上方常用参数添加，或点底部「自定义参数」</div>
            </div>
          ) : (
            rows.map((row, index) => (
              <div className="model-param" key={`${row.key}-${index}`}>
                <div className="model-param__head">
                  <input
                    className="model-param__label"
                    value={row.label}
                    placeholder="参数显示名，例如「画面比例」"
                    onChange={(event) =>
                      updateRow(index, { label: event.target.value })
                    }
                  />
                  <Select
                    value={row.type}
                    options={[
                      { value: 'select', label: TYPE_LABEL.select },
                      { value: 'number', label: TYPE_LABEL.number },
                      { value: 'text', label: TYPE_LABEL.text },
                      { value: 'boolean', label: TYPE_LABEL.boolean }
                    ]}
                    onChange={(next) =>
                      changeType(index, next as ParamDef['type'])
                    }
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    title="删除参数"
                    onClick={() => removeRow(index)}
                  >
                    <Icon name="close" size={12} />
                  </button>
                </div>

                <div className="model-param__grid is-single">
                  <label>
                    <span>分组</span>
                    <input
                      value={row.group ?? ''}
                      placeholder="例如：比例 / 画质 / 数量"
                      onChange={(event) =>
                        updateRow(index, { group: event.target.value })
                      }
                    />
                  </label>
                </div>

                <details className="model-param__advanced">
                  <summary>高级：接口字段名（通常不需要改）</summary>
                  <label>
                    <span>接口字段名</span>
                    <input
                      value={row.key}
                      placeholder="例如：ratio"
                      onChange={(event) =>
                        updateRow(index, { key: event.target.value })
                      }
                    />
                  </label>
                </details>

                {row.key === 'duration' && row.type === 'select' ? (
                  <div className="model-param__duration-hint">
                    <span>
                      如果模型支持 4–12 秒这类连续秒数，可以改为滑条；只支持固定档位的模型请保留下拉。
                    </span>
                    <button
                      type="button"
                      className="model-param__convert"
                      onClick={() => convertDurationToRange(index)}
                    >
                      改为时长滑条
                    </button>
                  </div>
                ) : null}

                {row.type === 'select' ? (
                  <div className="model-param__options">
                    <div className="model-param__options-head">
                      <span>可选项</span>
                      <button
                        type="button"
                        className="model-param__add-option"
                        onClick={() => addOption(index)}
                      >
                        + 添加选项
                      </button>
                    </div>

                    {(row.options ?? []).map((option, optionIndex) => (
                      <div
                        className="model-param__option"
                        key={`${index}-${optionIndex}`}
                      >
                        <input
                          value={option.label}
                          placeholder="显示名，例如 16:9"
                          onChange={(event) =>
                            updateOption(index, optionIndex, {
                              label: event.target.value
                            })
                          }
                        />
                        <input
                          value={option.value}
                          placeholder="接口值，例如 16:9"
                          onChange={(event) =>
                            updateOption(index, optionIndex, {
                              value: event.target.value
                            })
                          }
                        />
                        <button
                          type="button"
                          className="icon-btn"
                          title="删除选项"
                          disabled={(row.options?.length ?? 0) <= 1}
                          onClick={() => removeOption(index, optionIndex)}
                        >
                          <Icon name="close" size={11} />
                        </button>
                      </div>
                    ))}

                    <div className="model-param__default">
                      <span>默认选项</span>
                      <Select
                        value={String(row.defaultValue ?? '')}
                        options={(row.options ?? []).map((option) => ({
                          value: option.value,
                          label: option.label
                        }))}
                        onChange={(next) =>
                          updateRow(index, { defaultValue: next })
                        }
                      />
                    </div>

                    <label className="model-param__check">
                      <input
                        type="checkbox"
                        checked={row.allowCustom === true}
                        onChange={(event) =>
                          updateRow(index, {
                            allowCustom: event.target.checked
                          })
                        }
                      />
                      <span>允许在生成设置中自定义值</span>
                    </label>
                  </div>
                ) : null}

                {row.type === 'number' ? (
                  <div className="model-param__grid is-three">
                    <label>
                      <span>默认值</span>
                      <input
                        type="number"
                        value={String(row.defaultValue ?? '')}
                        placeholder="默认值"
                        onChange={(event) =>
                          updateRow(index, { defaultValue: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      <span>最小值</span>
                      <input
                        type="number"
                        value={row.min ?? ''}
                        placeholder="最小值"
                        onChange={(event) =>
                          updateRow(index, {
                            min:
                              event.target.value === ''
                                ? undefined
                                : Number(event.target.value)
                          })
                        }
                      />
                    </label>
                    <label>
                      <span>最大值</span>
                      <input
                        type="number"
                        value={row.max ?? ''}
                        placeholder="最大值"
                        onChange={(event) =>
                          updateRow(index, {
                            max:
                              event.target.value === ''
                                ? undefined
                                : Number(event.target.value)
                          })
                        }
                      />
                    </label>
                  </div>
                ) : null}

                {row.type === 'text' ? (
                  <div className="model-param__default">
                    <span>默认值</span>
                    <input
                      value={String(row.defaultValue ?? '')}
                      placeholder="默认文本"
                      onChange={(event) =>
                        updateRow(index, { defaultValue: event.target.value })
                      }
                    />
                  </div>
                ) : null}

                {row.type === 'boolean' ? (
                  <div className="model-param__default">
                    <span>默认值</span>
                    <Select
                      value={row.defaultValue === true ? 'true' : 'false'}
                      options={[
                        { value: 'false', label: '关闭' },
                        { value: 'true', label: '开启' }
                      ]}
                      onChange={(next) =>
                        updateRow(index, { defaultValue: next === 'true' })
                      }
                    />
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>

        {error ? <div className="form-message is-error">{error}</div> : null}

        <footer className="model-params__footer">
          <button type="button" className="btn-secondary" onClick={addCustom}>
            + 自定义参数
          </button>
          <div className="model-params__spacer" />
          <button type="button" className="btn-secondary" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="btn-primary" onClick={submit}>
            保存参数
          </button>
        </footer>
      </div>
    </div>,
    document.body
  )
}
