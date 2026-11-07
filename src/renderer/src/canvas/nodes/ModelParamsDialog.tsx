import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ModelDef, ParamDef, ParamOption } from '@shared/provider-schema'
import { paramTemplatesFor } from '@shared/param-presets'
import { Icon } from '../../components/Icon'
import { Select } from '../../components/Select'

interface ModelParamsDialogProps {
  model: ModelDef | null
  onCancel: () => void
  onSave: (params: ParamDef[]) => void
}

interface ParamRow extends ParamDef {
  optionsText?: string
}

function optionsToText(options?: ParamOption[]): string {
  return (options ?? []).map((option) => `${option.value}|${option.label}`).join('\n')
}

function textToOptions(text?: string): ParamOption[] {
  return (text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [value, ...rest] = line.split('|')
      return {
        value: value.trim(),
        label: (rest.join('|') || value).trim()
      }
    })
    .filter((option) => option.value.length > 0)
}

function defaultFor(type: ParamDef['type']): string | number | boolean {
  if (type === 'number') return 1
  if (type === 'boolean') return false
  return ''
}

export function ModelParamsDialog({
  model,
  onCancel,
  onSave
}: ModelParamsDialogProps) {
  const [rows, setRows] = useState<ParamRow[]>([])

  useEffect(() => {
    if (!model) {
      setRows([])
      return
    }
    setRows(
      model.params.map((param) => ({
        ...param,
        optionsText: optionsToText(param.options)
      }))
    )
  }, [model])

  if (!model) return null

  const templates = paramTemplatesFor(model.capability)
  const existingKeys = new Set(rows.map((row) => row.key))

  const updateRow = (index: number, patch: Partial<ParamRow>): void => {
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row
      )
    )
  }

  const addTemplate = (templateId: string): void => {
    const template = templates.find((item) => item.id === templateId)
    if (!template || existingKeys.has(template.def.key)) return
    setRows((current) => [
      ...current,
      {
        ...structuredClone(template.def),
        optionsText: optionsToText(template.def.options)
      }
    ])
  }

  const addCustom = (): void => {
    setRows((current) => [
      ...current,
      {
        key: `param_${current.length + 1}`,
        label: '自定义参数',
        type: 'select',
        options: [{ value: 'value', label: '选项 1' }],
        optionsText: 'value|选项 1',
        defaultValue: 'value'
      }
    ])
  }

  const removeRow = (index: number): void => {
    setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))
  }

  const changeType = (index: number, type: ParamDef['type']): void => {
    updateRow(index, {
      type,
      ...(type === 'select'
        ? {}
        : { options: undefined, optionsText: '' }),
      defaultValue: defaultFor(type)
    })
  }

  const submit = (): void => {
    const params: ParamDef[] = rows
      .map((row) => {
        const type = row.type
        const options =
          type === 'select' ? textToOptions(row.optionsText) : undefined
        let defaultValue: ParamDef['defaultValue']

        if (row.defaultValue !== undefined && row.defaultValue !== '') {
          if (type === 'number') {
            defaultValue = Number(row.defaultValue)
          } else if (type === 'boolean') {
            defaultValue =
              row.defaultValue === true || row.defaultValue === 'true'
          } else {
            defaultValue = String(row.defaultValue)
          }
        }

        if (type === 'select') {
          const match = options?.find(
            (option) => String(option.value) === String(defaultValue)
          )
          defaultValue = match?.value ?? options?.[0]?.value
        }

        return {
          key: row.key.trim(),
          label: row.label.trim(),
          type,
          ...(options && options.length > 0 ? { options } : {}),
          ...(defaultValue !== undefined ? { defaultValue } : {}),
          ...(row.min !== undefined ? { min: row.min } : {}),
          ...(row.max !== undefined ? { max: row.max } : {})
        }
      })
      .filter((param) => param.key && param.label)

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
              {model.name} · {model.capability}
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

        <div className="model-params__templates">
          <span className="model-params__label">快速添加</span>
          {templates.map((template) => {
            const added = existingKeys.has(template.def.key)
            return (
              <button
                key={template.id}
                type="button"
                className={`model-params__chip${added ? ' is-added' : ''}`}
                disabled={added}
                onClick={() => addTemplate(template.id)}
              >
                {template.def.label}
              </button>
            )
          })}
        </div>

        <div className="model-params__list">
          {rows.length === 0 ? (
            <div className="model-params__empty">
              还没有参数。从上方模板添加，或自定义一个。
            </div>
          ) : (
            rows.map((row, index) => (
              <div className="model-param" key={index}>
                <div className="model-param__head">
                  <input
                    value={row.key}
                    placeholder="参数 key"
                    onChange={(event) =>
                      updateRow(index, { key: event.target.value })
                    }
                  />
                  <input
                    value={row.label}
                    placeholder="显示名"
                    onChange={(event) =>
                      updateRow(index, { label: event.target.value })
                    }
                  />
                  <Select
                    value={row.type}
                    options={[
                      { value: 'select', label: '下拉' },
                      { value: 'number', label: '数字' },
                      { value: 'text', label: '文本' },
                      { value: 'boolean', label: '开关' }
                    ]}
                    onChange={(next) => changeType(index, next)}
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

                {row.type === 'select' ? (
                  <textarea
                    className="model-param__options"
                    value={row.optionsText ?? ''}
                    placeholder={'每行一个选项：值|显示名\n例如：1024x1024|1024×1024'}
                    onChange={(event) =>
                      updateRow(index, { optionsText: event.target.value })
                    }
                  />
                ) : null}

                <div className="model-param__default">
                  <span>默认值</span>
                  {row.type === 'boolean' ? (
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
                  ) : (
                    <input
                      type={row.type === 'number' ? 'number' : 'text'}
                      value={String(row.defaultValue ?? '')}
                      placeholder="默认值"
                      onChange={(event) =>
                        updateRow(index, { defaultValue: event.target.value })
                      }
                    />
                  )}
                </div>
              </div>
            ))
          )}
        </div>

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
