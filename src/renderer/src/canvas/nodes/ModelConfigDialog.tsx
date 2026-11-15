import { useEffect, useMemo, useState } from 'react'
import {
  CAPABILITY_LABEL,
  MEDIA_INPUTS,
  MEDIA_INPUT_LABEL,
  MODEL_PRESETS,
  inferModelInputs,
  modelInputs,
  modelModeConfigs,
  modelModeIds,
  modelOperations,
  type MediaInput,
  type ModelDef,
  type ParamDef,
  type ParamOption
} from '@shared/provider-schema'
import {
  MODEL_MODE_DEFINITIONS,
  MODEL_MODE_LABEL,
  getModelModeDefinition,
  resolveModeSlots,
  type ModelModeConfig,
  type ModelModeId
} from '@shared/model-modes'
import {
  VIDEO_OPERATIONS,
  type VideoOperationId
} from '@shared/operation-schema'
import { paramTemplatesFor, type ParamTemplate } from '@shared/param-presets'
import type { HttpTemplate } from '@shared/http-template'
import { Icon } from '../../components/Icon'
import { Button, Dialog, Input, Select, Textarea } from '../../components/ui'

export interface ModelConfigValue {
  params: ParamDef[]
  inputs: MediaInput[]
  operations: VideoOperationId[]
  modes: ModelModeConfig[]
  extraBody?: Record<string, unknown>
  omitBody?: string[]
  template?: HttpTemplate
}

interface ModelConfigDialogProps {
  model: ModelDef | null
  onCancel: () => void
  onSave: (value: ModelConfigValue) => void
}

type ParamRow = ParamDef

type ExtraBodyValueType = 'text' | 'number' | 'boolean' | 'json'

interface ExtraBodyRow {
  key: string
  value: string
  type: ExtraBodyValueType
}

const EXTRA_BODY_TYPE_LABEL: Record<ExtraBodyValueType, string> = {
  text: '文本',
  number: '数字',
  boolean: '开关',
  json: 'JSON'
}

function toExtraBodyRows(
  value: Record<string, unknown> | undefined
): ExtraBodyRow[] {
  if (!value) return []

  return Object.entries(value).map(([key, item]) => {
    if (typeof item === 'boolean') {
      return { key, value: item ? 'true' : 'false', type: 'boolean' }
    }
    if (typeof item === 'number') {
      return { key, value: String(item), type: 'number' }
    }
    if (typeof item === 'string') {
      return { key, value: item, type: 'text' }
    }
    return { key, value: JSON.stringify(item, null, 2), type: 'json' }
  })
}

function fromExtraBodyRows(
  rows: ExtraBodyRow[]
): Record<string, unknown> | undefined {
  const result: Record<string, unknown> = {}

  for (const row of rows) {
    const key = row.key.trim()
    if (!key) continue

    if (row.type === 'boolean') {
      result[key] = row.value === 'true'
    } else if (row.type === 'number') {
      const number = Number(row.value)
      result[key] = Number.isFinite(number) ? number : row.value
    } else if (row.type === 'json') {
      result[key] = JSON.parse(row.value) as unknown
    } else {
      result[key] = row.value
    }
  }

  return Object.keys(result).length > 0 ? result : undefined
}

const TYPE_LABEL: Record<ParamDef['type'], string> = {
  select: '选项',
  number: '数值',
  text: '文本',
  boolean: '开关'
}

const TYPE_HINT: Record<ParamDef['type'], string> = {
  select: '从预设值里选，例如比例 16:9',
  number: '输入或拖动一个数，例如时长 5 秒',
  text: '自由输入文字',
  boolean: '开 / 关'
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

function chipSummary(def: ParamDef): string {
  if (def.type === 'select') return `${def.options?.length ?? 0} 项`
  if (def.type === 'boolean') return def.defaultValue ? '默认开' : '默认关'
  return `默认 ${def.defaultValue ?? '—'}`
}

/** 时长统一用滑条：旧的固定秒数下拉自动转成数值范围 */
function normalizeParam(def: ParamDef): ParamRow {
  const row = cloneDef(def)
  if (row.key !== 'duration' || row.type !== 'select') return row

  const values = (row.options ?? [])
    .map((option) => Number(option.value))
    .filter((value) => Number.isFinite(value))
  if (values.length < 2) return row

  const min = Math.min(...values)
  const max = Math.max(...values)
  const current = Number(row.defaultValue)

  return {
    ...row,
    type: 'number',
    options: undefined,
    defaultValue: Number.isFinite(current)
      ? Math.min(max, Math.max(min, current))
      : min,
    min,
    max
  }
}

/** 视频操作必须依赖视频输入，旧配置或预设不一致时自动补齐 */
function withVideoInput(
  inputs: MediaInput[],
  operations: VideoOperationId[]
): MediaInput[] {
  if (operations.length === 0 || inputs.includes('video')) return inputs
  return [...inputs, 'video']
}

export function ModelConfigDialog({
  model,
  onCancel,
  onSave
}: ModelConfigDialogProps) {
  const [rows, setRows] = useState<ParamRow[]>([])
  const [inputs, setInputs] = useState<MediaInput[]>([])
  const [operations, setOperations] = useState<VideoOperationId[]>([])
  const [modes, setModes] = useState<ModelModeConfig[]>([])
  const [operationNotice, setOperationNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [templatesOpen, setTemplatesOpen] = useState(true)
  const [openRow, setOpenRow] = useState<number | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [extraBodyText, setExtraBodyText] = useState('')
  const [extraBodyMode, setExtraBodyMode] = useState<'rows' | 'json'>('rows')
  const [extraBodyRows, setExtraBodyRows] = useState<ExtraBodyRow[]>([])
  const [omitBodyTags, setOmitBodyTags] = useState<string[]>([])
  const [omitBodyInput, setOmitBodyInput] = useState('')
  const [templateText, setTemplateText] = useState('')

  useEffect(() => {
    if (!model) {
      setRows([])
      setInputs([])
      setOperations([])
      setModes([])
      setExtraBodyText('')
      setExtraBodyMode('rows')
      setExtraBodyRows([])
      setOmitBodyTags([])
      setOmitBodyInput('')
      setTemplateText('')
      return
    }
    setError(null)
    setOperationNotice(null)
    setRows(model.params.map(normalizeParam))
    const initialOperations = modelOperations(model)
    setInputs(withVideoInput(modelInputs(model), initialOperations))
    setOperations(initialOperations)
    setModes(modelModeConfigs(model))
    setTemplatesOpen(true)
    setOpenRow(null)
    setAdvancedOpen(false)
    setExtraBodyText(
      model.extraBody ? JSON.stringify(model.extraBody, null, 2) : ''
    )
    setExtraBodyMode('rows')
    setExtraBodyRows(toExtraBodyRows(model.extraBody))
    setOmitBodyTags(model.omitBody ? [...model.omitBody] : [])
    setOmitBodyInput('')
    setTemplateText(model.template ? JSON.stringify(model.template, null, 2) : '')
  }, [model])

  const templates = model ? paramTemplatesFor(model.capability) : []
  const existingKeys = useMemo(
    () => new Set(rows.map((row) => row.key.trim()).filter(Boolean)),
    [rows]
  )
  const addedCount = templates.filter((template) =>
    existingKeys.has(template.def.key)
  ).length

  if (!model) return null

  const isVideo = modes.some(
    (mode) => getModelModeDefinition(mode.id)?.output === 'video'
  )
  const modeSectionVisible =
    model.capability.startsWith('image') ||
    model.capability.startsWith('video')
  const availableModes = MODEL_MODE_DEFINITIONS.filter(
    (definition) => !modes.some((mode) => mode.id === definition.id)
  )
  const operationAdapterReady = modes.some(
    (mode) => mode.id === 'video-edit' || mode.id === 'video-extend'
  )
  const preset = model.preset
    ? MODEL_PRESETS.find((item) => item.id === model.preset)
    : undefined

  const restorePreset = (): void => {
    if (!preset) return
    setError(null)
    setOperationNotice('已恢复预设默认值，保存后生效')
    setRows(preset.params.map(normalizeParam))
    const presetOperations = modelOperations(preset)
    setInputs(withVideoInput(modelInputs(preset), presetOperations))
    setOperations(presetOperations)
    setModes(modelModeConfigs(preset))
    setTemplatesOpen(true)
    setOpenRow(null)
    setExtraBodyText(
      preset.extraBody ? JSON.stringify(preset.extraBody, null, 2) : ''
    )
    setExtraBodyMode('rows')
    setExtraBodyRows(toExtraBodyRows(preset.extraBody))
    setOmitBodyTags(preset.omitBody ? [...preset.omitBody] : [])
    setOmitBodyInput('')
    setTemplateText(
      preset.template ? JSON.stringify(preset.template, null, 2) : ''
    )
  }

  const switchExtraBodyMode = (next: 'rows' | 'json'): void => {
    if (next === extraBodyMode) return
    setError(null)

    if (next === 'json') {
      try {
        const value = fromExtraBodyRows(extraBodyRows)
        setExtraBodyText(value ? JSON.stringify(value, null, 2) : '')
        setExtraBodyMode('json')
      } catch (advancedError) {
        setError(
          `请求扩展有字段不是合法 JSON：${
            advancedError instanceof Error
              ? advancedError.message
              : String(advancedError)
          }`
        )
      }
      return
    }

    try {
      const parsed = extraBodyText.trim() ? JSON.parse(extraBodyText) : {}
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('必须是 JSON 对象')
      }
      setExtraBodyRows(toExtraBodyRows(parsed as Record<string, unknown>))
      setExtraBodyMode('rows')
    } catch (advancedError) {
      setError(
        `JSON 格式不正确：${
          advancedError instanceof Error
            ? advancedError.message
            : String(advancedError)
        }`
      )
    }
  }

  const addExtraBodyRow = (): void => {
    setError(null)
    setExtraBodyRows((current) => [
      ...current,
      { key: '', value: '', type: 'text' }
    ])
  }

  const updateExtraBodyRow = (
    index: number,
    patch: Partial<ExtraBodyRow>
  ): void => {
    setError(null)
    setExtraBodyRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row
      )
    )
  }

  const removeExtraBodyRow = (index: number): void => {
    setError(null)
    setExtraBodyRows((current) =>
      current.filter((_, rowIndex) => rowIndex !== index)
    )
  }

  const addOmitTag = (): void => {
    const value = omitBodyInput.trim()
    if (!value) return
    setOmitBodyTags((current) =>
      current.includes(value) ? current : [...current, value]
    )
    setOmitBodyInput('')
  }

  const removeOmitTag = (tag: string): void => {
    setOmitBodyTags((current) => current.filter((item) => item !== tag))
  }

  const formatTemplate = (): void => {
    try {
      const parsed = JSON.parse(templateText) as unknown
      setTemplateText(JSON.stringify(parsed, null, 2))
      setError(null)
    } catch (advancedError) {
      setError(
        `自定义协议 JSON 格式不正确：${
          advancedError instanceof Error
            ? advancedError.message
            : String(advancedError)
        }`
      )
    }
  }

  const toggleInput = (input: MediaInput): void => {
    if (input === 'text') return
    setOperationNotice(null)
    if (input === 'video' && inputs.includes('video')) {
      if (operations.length > 0) {
        setOperations([])
        setOperationNotice('已关闭视频输入，同时关闭视频操作')
      }
      setInputs((current) => current.filter((item) => item !== input))
      return
    }
    setInputs((current) =>
      current.includes(input)
        ? current.filter((item) => item !== input)
        : [...current, input]
    )
  }

  const toggleOperation = (operation: VideoOperationId): void => {
    setOperationNotice(null)
    const next = operations.includes(operation)
      ? operations.filter((item) => item !== operation)
      : [...operations, operation]
    setOperations(next)
    if (next.length > 0 && !inputs.includes('video')) {
      setInputs([...inputs, 'video'])
    }
  }

  const toggleMode = (modeId: ModelModeId): void => {
    setError(null)
    const exists = modes.some((mode) => mode.id === modeId)

    if (exists && modes.length === 1) {
      setError('至少保留一个能力模式')
      return
    }

    const next = exists
      ? modes.filter((mode) => mode.id !== modeId)
      : [...modes, { id: modeId }]
    setModes(next)

    const nextInputs = inferModelInputs({
      capability: model.capability,
      remoteModel: model.remoteModel,
      adapter: model.adapter,
      template: model.template,
      modes: next
    })
    setInputs(withVideoInput(nextInputs, operations))
  }

  const updateModeSlot = (
    modeId: ModelModeId,
    slotId: string,
    max: number
  ): void => {
    const nextMax = Number.isFinite(max) ? Math.max(0, Math.floor(max)) : 0
    setModes((current) =>
      current.map((mode) =>
        mode.id === modeId
          ? {
              ...mode,
              slots: {
                ...(mode.slots ?? {}),
                [slotId]: {
                  ...(mode.slots?.[slotId] ?? {}),
                  max: nextMax
                }
              }
            }
          : mode
      )
    )
  }

  const resetModeSlots = (): void => {
    setModes((current) =>
      current.map((mode) => ({ ...mode, slots: undefined }))
    )
  }

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
    setOpenRow(rows.length)
    setRows((current) => [...current, cloneDef(template.def)])
  }

  const addAllTemplates = (): void => {
    const missing = templates.filter(
      (template) => !existingKeys.has(template.def.key)
    )
    if (missing.length === 0) return
    setError(null)
    setOpenRow(rows.length)
    setRows((current) => [
      ...current,
      ...missing.map((template) => cloneDef(template.def))
    ])
  }

  const addCustom = (): void => {
    const index = rows.length + 1
    setError(null)
    setOpenRow(rows.length)
    setRows((current) => [
      ...current,
      {
        key: `param_${index}`,
        label: '自定义参数',
        type: 'text',
        defaultValue: '',
        group: '其它'
      }
    ])
  }

  const removeRow = (index: number): void => {
    setError(null)
    setOpenRow(null)
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
          row.allowCustom ?? ['size', 'ratio', 'resolution'].includes(row.key)
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

    let extraBody: Record<string, unknown> | undefined
    if (extraBodyMode === 'rows') {
      const seenExtraKeys = new Set<string>()
      for (const row of extraBodyRows) {
        const key = row.key.trim()
        if (!key) continue
        if (seenExtraKeys.has(key)) {
          problems.push(`请求扩展字段重复：${key}`)
        }
        seenExtraKeys.add(key)
      }
      try {
        extraBody = fromExtraBodyRows(extraBodyRows)
      } catch (advancedError) {
        problems.push(
          `请求扩展有字段不是合法 JSON：${
            advancedError instanceof Error
              ? advancedError.message
              : String(advancedError)
          }`
        )
      }
    } else if (extraBodyText.trim()) {
      try {
        const parsed = JSON.parse(extraBodyText) as unknown
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('必须是 JSON 对象')
        }
        extraBody = parsed as Record<string, unknown>
      } catch (advancedError) {
        problems.push(
          `请求扩展无效：${
            advancedError instanceof Error
              ? advancedError.message
              : String(advancedError)
          }`
        )
      }
    }

    const omitBody = omitBodyTags.length > 0 ? omitBodyTags : undefined

    let template: HttpTemplate | undefined
    if (templateText.trim()) {
      try {
        const parsed = JSON.parse(templateText) as unknown
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('必须是 JSON 对象')
        }
        const record = parsed as Record<string, unknown>
        if (
          !record.submit ||
          typeof record.submit !== 'object' ||
          !record.poll ||
          typeof record.poll !== 'object'
        ) {
          throw new Error('必须包含 submit 和 poll')
        }
        template = parsed as HttpTemplate
      } catch (advancedError) {
        problems.push(
          `自定义协议无效：${
            advancedError instanceof Error
              ? advancedError.message
              : String(advancedError)
          }`
        )
      }
    }

    if (problems.length > 0) {
      setError(problems[0])
      return
    }

    onSave({ params, inputs, operations, modes, extraBody, omitBody, template })
  }

  return (
    <Dialog
      open
      onClose={onCancel}
      bare
      ariaLabel="模型配置"
      overlayClassName="settings-overlay"
      panelClassName="operation-dialog model-config-dialog"
    >
      <header className="operation-dialog__header">
        <div>
          <div className="operation-dialog__title">模型配置</div>
          <div className="operation-dialog__subtitle">
            {model.name} ·{' '}
            {modelModeIds(model)
              .map((id) => MODEL_MODE_LABEL[id])
              .join(' · ') || CAPABILITY_LABEL[model.capability]}
          </div>
        </div>
        <Button
          type="button"
          className="operation-dialog__close"
          title="关闭"
          onClick={onCancel}
          unstyled
        >
          <Icon name="close" size={14} />
        </Button>
      </header>

      {modeSectionVisible ? (
        <div className="model-config__section">
          <div className="model-config__section-title">能力模式</div>
          <div className="model-params__intro">
            这些是这个模型支持的生成方式。点击已启用的卡片可以取消。
          </div>
          {modes.length > 0 ? (
            <div className="model-modes">
              {modes.map((mode) => {
                const definition = getModelModeDefinition(mode.id)
                const slots = resolveModeSlots(mode)
                return (
                  <Button
                    type="button"
                    className="model-mode is-on"
                    key={mode.id}
                    title="点击取消这个模式"
                    onClick={() => toggleMode(mode.id)}
                    unstyled
                  >
                    <span className="model-mode__head">
                      <span className="model-mode__name">
                        {MODEL_MODE_LABEL[mode.id]}
                      </span>
                      <span className="model-mode__output">
                        {definition?.output === 'video' ? '视频' : '图片'} ·
                        点击取消
                      </span>
                    </span>
                    <span className="model-mode__slots">
                      {slots.map((slot) => (
                        <span className="model-mode__slot" key={slot.id}>
                          {slot.label}
                          {slot.max > 1
                            ? ` 0–${slot.max}`
                            : slot.required
                              ? ' 1'
                              : ' 可选'}
                        </span>
                      ))}
                    </span>
                  </Button>
                )
              })}
            </div>
          ) : (
            <div className="model-config__hint is-warning">
              还没有启用任何模式。至少启用一个，否则这个模型不会出现在生成入口。
            </div>
          )}
          {availableModes.length > 0 ? (
            <div className="model-modes__available">
              <span className="model-modes__available-label">添加模式</span>
              {availableModes.map((definition) => (
                <Button
                  type="button"
                  className="model-mode__add"
                  key={definition.id}
                  onClick={() => toggleMode(definition.id)}
                  unstyled
                >
                  + {MODEL_MODE_LABEL[definition.id]}
                </Button>
              ))}
            </div>
          ) : null}
          {modes.length > 0 ? (
            <details className="model-mode-limits">
              <summary>调整槽位上限</summary>
              <div className="model-mode-limits__list">
                {modes.flatMap((mode) =>
                  resolveModeSlots(mode).map((slot) => (
                    <label
                      className="model-mode-limit"
                      key={`${mode.id}-${slot.id}`}
                    >
                      <span>
                        {MODEL_MODE_LABEL[mode.id]} · {slot.label}
                      </span>
                      <Input
                        type="number"
                        min={0}
                        max={99}
                        value={slot.max}
                        onChange={(event) =>
                          updateModeSlot(
                            mode.id,
                            slot.id,
                            Number(event.target.value)
                          )
                        }
                        unstyled
                      />
                      <span>张</span>
                    </label>
                  ))
                )}
              </div>
              <Button
                type="button"
                className="btn-secondary btn-small"
                onClick={resetModeSlots}
                unstyled
              >
                恢复默认上限
              </Button>
            </details>
          ) : null}
        </div>
      ) : null}

      <div className="model-params__intro">
        勾选这个模型实际能接收的素材。Prompt Bar
        会根据当前节点已引用的图片或视频，自动置灰不支持的模型。
      </div>

      <div className="model-config__section">
        <div className="model-config__section-title">输入能力</div>
        <div className="model-inputs__grid">
          {MEDIA_INPUTS.map((input) => {
            const checked = inputs.includes(input)
            const locked = input === 'text'
            const requiredByOperation =
              input === 'video' && operations.length > 0

            return (
              <Button
                key={input}
                type="button"
                className={`model-inputs__item${checked ? ' is-on' : ''}${
                  locked ? ' is-locked' : ''
                }`}
                onClick={() => toggleInput(input)}
                disabled={locked}
                title={
                  requiredByOperation
                    ? '取消视频输入会同时关闭视频操作'
                    : undefined
                }
                unstyled
              >
                <span className="model-inputs__check">
                  {checked ? '✓' : ''}
                </span>
                <span className="model-inputs__name">
                  {MEDIA_INPUT_LABEL[input]}
                </span>
                {locked ? (
                  <span className="model-inputs__lock">必选</span>
                ) : null}
                {requiredByOperation ? (
                  <span className="model-inputs__lock">操作需要</span>
                ) : null}
              </Button>
            )
          })}
        </div>
      </div>

      {isVideo ? (
        <div className="model-config__section">
          <div className="model-config__section-title">视频操作</div>
          <div className="model-config__hint">
            只有使用自定义协议的视频接口需要勾选。勾选后该模型会出现在片段重拍、元素替换、智能续写的模型列表里。
          </div>
          {!operationAdapterReady ? (
            <div className="model-config__hint is-warning">
              当前模型没有声明视频编辑或延长模式，勾选后操作节点仍会置灰。
            </div>
          ) : null}
          <div className="model-inputs__grid">
            {VIDEO_OPERATIONS.map((operation) => {
              const checked = operations.includes(operation.id)
              return (
                <Button
                  key={operation.id}
                  type="button"
                  className={`model-inputs__item${checked ? ' is-on' : ''}`}
                  onClick={() => toggleOperation(operation.id)}
                  disabled={!operationAdapterReady && !checked}
                  title={operation.description}
                  unstyled
                >
                  <span className="model-inputs__check">
                    {checked ? '✓' : ''}
                  </span>
                  <span className="model-inputs__name">
                    {operation.label}
                  </span>
                </Button>
              )
            })}
          </div>
          {operationNotice ? (
            <div className="model-config__hint">{operationNotice}</div>
          ) : null}
        </div>
      ) : null}

      <div className="model-config__section-title">生成参数</div>
      <div className="model-params__intro">
        这些参数会显示在 Prompt Bar
        的「生成设置」里。第一次配置可以直接添加常用参数，不需要了解接口字段名。
      </div>

      {templates.length > 0 ? (
        <>
          <div className="model-params__templates-head">
            <Button
              type="button"
              className="model-params__templates-toggle"
              onClick={() => setTemplatesOpen((value) => !value)}
              unstyled
            >
              <Icon
                name={templatesOpen ? 'chevron-down' : 'chevron-right'}
                size={12}
              />
              <span className="model-params__templates-title">常用参数</span>
              <span className="model-params__templates-count">
                {addedCount}/{templates.length}
              </span>
            </Button>
            <div className="model-params__templates-actions">
              <span className="model-params__templates-desc">点击标签添加</span>
              <Button
                type="button"
                className="btn-secondary btn-small"
                disabled={addedCount === templates.length}
                onClick={addAllTemplates}
                unstyled
              >
                全部添加
              </Button>
            </div>
          </div>

          {templatesOpen ? (
            <div className="model-params__template-chips">
              {templates.map((template) => {
                const added = existingKeys.has(template.def.key)
                return (
                  <Button
                    key={template.id}
                    type="button"
                    className={`model-params__chip${added ? ' is-added' : ''}`}
                    disabled={added}
                    title={`${template.description}\n${optionSummary(
                      template.def
                    )}`}
                    onClick={() => addTemplate(template)}
                    unstyled
                  >
                    <span>{template.def.label}</span>
                    <span className="model-params__chip-meta">
                      {chipSummary(template.def)}
                    </span>
                    <span className="model-params__chip-action">
                      {added ? '✓' : '+'}
                    </span>
                  </Button>
                )
              })}
            </div>
          ) : null}
        </>
      ) : null}

      <div className="model-params__list">
        {rows.length === 0 ? (
          <div className="model-params__empty">
            <div>还没有参数</div>
            <div>从上方常用参数添加，或点底部「自定义参数」</div>
          </div>
        ) : (
          rows.map((row, index) => {
            const expanded = openRow === index
            return (
              <div
                className={`model-param${expanded ? ' is-open' : ''}`}
                key={`${row.key}-${index}`}
              >
                <div className="model-param__summary-row">
                  <Button
                    type="button"
                    className="model-param__summary"
                    onClick={() => setOpenRow(expanded ? null : index)}
                    unstyled
                  >
                    <Icon
                      name={expanded ? 'chevron-down' : 'chevron-right'}
                      size={12}
                    />
                    <span className="model-param__name">
                      {row.label || '未命名参数'}
                    </span>
                    <span className="model-param__type">
                      {TYPE_LABEL[row.type]}
                    </span>
                    <span className="model-param__value">
                      {optionSummary(row)}
                    </span>
                  </Button>
                  <Button
                    type="button"
                    className="icon-btn"
                    title="删除参数"
                    onClick={() => removeRow(index)}
                    unstyled
                  >
                    <Icon name="close" size={12} />
                  </Button>
                </div>

                {expanded ? (
                  <div className="model-param__body">
                    <div className="model-param__head">
                      <Input
                        className="model-param__label"
                        value={row.label}
                        placeholder="参数显示名，例如「画面比例」"
                        onChange={(event) =>
                          updateRow(index, { label: event.target.value })
                        }
                        unstyled
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
                    </div>
                    <div className="model-param__type-hint">
                      {TYPE_HINT[row.type]}
                    </div>

                    <div className="model-param__grid is-single">
                      <label>
                        <span>分组</span>
                        <Input
                          value={row.group ?? ''}
                          placeholder="例如：比例 / 画质 / 数量"
                          onChange={(event) =>
                            updateRow(index, { group: event.target.value })
                          }
                          unstyled
                        />
                      </label>
                    </div>

                    <details className="model-param__advanced">
                      <summary>高级：接口字段名（通常不需要改）</summary>
                      <label>
                        <span>接口字段名</span>
                        <Input
                          value={row.key}
                          placeholder="例如：ratio"
                          onChange={(event) =>
                            updateRow(index, { key: event.target.value })
                          }
                          unstyled
                        />
                      </label>
                    </details>

                    {row.key === 'duration' && row.type === 'select' ? (
                      <div className="model-param__duration-hint">
                        <span>
                          如果模型支持 4–12
                          秒这类连续秒数，可以改为滑条；只支持固定档位的模型请保留下拉。
                        </span>
                        <Button
                          type="button"
                          className="model-param__convert"
                          onClick={() => convertDurationToRange(index)}
                          unstyled
                        >
                          改为时长滑条
                        </Button>
                      </div>
                    ) : null}

                    {row.type === 'select' ? (
                      <div className="model-param__options">
                        <div className="model-param__options-head">
                          <span>可选项</span>
                          <Button
                            type="button"
                            className="model-param__add-option"
                            onClick={() => addOption(index)}
                            unstyled
                          >
                            + 添加选项
                          </Button>
                        </div>

                        {(row.options ?? []).map((option, optionIndex) => (
                          <div
                            className="model-param__option"
                            key={`${index}-${optionIndex}`}
                          >
                            <Input
                              value={option.label}
                              placeholder="显示名，例如 16:9"
                              onChange={(event) =>
                                updateOption(index, optionIndex, {
                                  label: event.target.value
                                })
                              }
                              unstyled
                            />
                            <Input
                              value={option.value}
                              placeholder="接口值，例如 16:9"
                              onChange={(event) =>
                                updateOption(index, optionIndex, {
                                  value: event.target.value
                                })
                              }
                              unstyled
                            />
                            <Button
                              type="button"
                              className="icon-btn"
                              title="删除选项"
                              disabled={(row.options?.length ?? 0) <= 1}
                              onClick={() => removeOption(index, optionIndex)}
                              unstyled
                            >
                              <Icon name="close" size={11} />
                            </Button>
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
                          <Input
                            type="checkbox"
                            checked={row.allowCustom === true}
                            onChange={(event) =>
                              updateRow(index, {
                                allowCustom: event.target.checked
                              })
                            }
                            unstyled
                          />
                          <span>允许在生成设置中自定义值</span>
                        </label>
                      </div>
                    ) : null}

                    {row.type === 'number' ? (
                      <div className="model-param__grid is-three">
                        <label>
                          <span>默认值</span>
                          <Input
                            type="number"
                            value={String(row.defaultValue ?? '')}
                            placeholder="默认值"
                            onChange={(event) =>
                              updateRow(index, {
                                defaultValue: event.target.value
                              })
                            }
                            unstyled
                          />
                        </label>
                        <label>
                          <span>最小值</span>
                          <Input
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
                            unstyled
                          />
                        </label>
                        <label>
                          <span>最大值</span>
                          <Input
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
                            unstyled
                          />
                        </label>
                      </div>
                    ) : null}

                    {row.type === 'text' ? (
                      <div className="model-param__default">
                        <span>默认值</span>
                        <Input
                          value={String(row.defaultValue ?? '')}
                          placeholder="默认文本"
                          onChange={(event) =>
                            updateRow(index, {
                              defaultValue: event.target.value
                            })
                          }
                          unstyled
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
                            updateRow(index, {
                              defaultValue: next === 'true'
                            })
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })
        )}
      </div>

      <div className="model-config__section">
        <Button
          type="button"
          className="model-params__templates-toggle"
          onClick={() => setAdvancedOpen((current) => !current)}
          unstyled
        >
          <Icon
            name={advancedOpen ? 'chevron-down' : 'chevron-right'}
            size={12}
          />
          <span className="model-config__section-title">高级</span>
        </Button>
        <div className="model-config__hint">
          开发者选项，普通模型保持默认即可。只有自定义接口或中转站需要改：
          请求扩展把参数映射成接口字段，删除字段从默认请求体移除字段，
          自定义协议用于提交任务并轮询结果。
        </div>

        {advancedOpen ? (
          <>
            <div className="model-config__advanced-field">
              <div className="model-config__advanced-head">
                <span>请求扩展 — 追加到请求体的字段</span>
                <div className="model-config__advanced-tabs">
                  <Button
                    type="button"
                    className={`model-config__tab${
                      extraBodyMode === 'rows' ? ' is-active' : ''
                    }`}
                    onClick={() => switchExtraBodyMode('rows')}
                    unstyled
                  >
                    键值对
                  </Button>
                  <Button
                    type="button"
                    className={`model-config__tab${
                      extraBodyMode === 'json' ? ' is-active' : ''
                    }`}
                    onClick={() => switchExtraBodyMode('json')}
                    unstyled
                  >
                    JSON
                  </Button>
                </div>
              </div>

              {extraBodyMode === 'rows' ? (
                <div className="extra-body-table">
                  <div className="extra-body-table__head">
                    <span>字段名</span>
                    <span>值</span>
                    <span>类型</span>
                    <span />
                  </div>
                  {extraBodyRows.map((row, index) => (
                    <div className="extra-body-table__row" key={index}>
                      <Input
                        value={row.key}
                        placeholder="例如 camera_fixed"
                        onChange={(event) =>
                          updateExtraBodyRow(index, {
                            key: event.target.value
                          })
                        }
                        unstyled
                      />
                      {row.type === 'boolean' ? (
                        <Select
                          value={row.value}
                          options={[
                            { value: 'true', label: '开启' },
                            { value: 'false', label: '关闭' }
                          ]}
                          onChange={(next) =>
                            updateExtraBodyRow(index, { value: next })
                          }
                        />
                      ) : row.type === 'json' ? (
                        <Textarea
                          className="model-config__json is-compact"
                          value={row.value}
                          spellCheck={false}
                          onChange={(event) =>
                            updateExtraBodyRow(index, {
                              value: event.target.value
                            })
                          }
                          unstyled
                        />
                      ) : (
                        <Input
                          value={row.value}
                          placeholder="{{params.camera_fixed}}"
                          onChange={(event) =>
                            updateExtraBodyRow(index, {
                              value: event.target.value
                            })
                          }
                          unstyled
                        />
                      )}
                      <Select
                        value={row.type}
                        options={(
                          Object.entries(EXTRA_BODY_TYPE_LABEL) as Array<
                            [ExtraBodyValueType, string]
                          >
                        ).map(([value, label]) => ({ value, label }))}
                        onChange={(next) =>
                          updateExtraBodyRow(index, {
                            type: next as ExtraBodyValueType
                          })
                        }
                      />
                      <Button
                        type="button"
                        className="icon-btn"
                        title="删除字段"
                        onClick={() => removeExtraBodyRow(index)}
                        unstyled
                      >
                        <Icon name="close" size={12} />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    className="btn-secondary btn-small"
                    onClick={addExtraBodyRow}
                    unstyled
                  >
                    + 添加字段
                  </Button>
                </div>
              ) : (
                <Textarea
                  className="model-config__json"
                  value={extraBodyText}
                  spellCheck={false}
                  placeholder={
                    '{\n  "resolution": "{{params.resolution}}"\n}'
                  }
                  onChange={(event) => {
                    setError(null)
                    setExtraBodyText(event.target.value)
                  }}
                  unstyled
                />
              )}
            </div>

            <div className="model-config__advanced-field">
              <span>删除字段 — 从默认请求体移除的字段</span>
              <div className="omit-tags">
                {omitBodyTags.map((tag) => (
                  <span className="omit-tag" key={tag}>
                    {tag}
                    <Button
                      type="button"
                      className="omit-tag__remove"
                      title={`移除 ${tag}`}
                      onClick={() => removeOmitTag(tag)}
                      unstyled
                    >
                      <Icon name="close" size={10} />
                    </Button>
                  </span>
                ))}
                <Input
                  className="omit-tags__input"
                  value={omitBodyInput}
                  placeholder="输入字段名后回车，例如 n"
                  onChange={(event) => setOmitBodyInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      addOmitTag()
                    }
                  }}
                  unstyled
                />
              </div>
            </div>

            {model.adapter === 'http-template' ? (
              <div className="model-config__advanced-field">
                <div className="model-config__advanced-head">
                  <span>自定义协议 — 提交任务并轮询结果</span>
                  <Button
                    type="button"
                    className="btn-secondary btn-small"
                    onClick={formatTemplate}
                    unstyled
                  >
                    格式化
                  </Button>
                </div>
                <Textarea
                  className="model-config__json is-tall"
                  value={templateText}
                  spellCheck={false}
                  onChange={(event) => {
                    setError(null)
                    setTemplateText(event.target.value)
                  }}
                  unstyled
                />
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {error ? <div className="form-message is-error">{error}</div> : null}

      <footer className="model-params__footer">
        <Button
          type="button"
          className="btn-secondary"
          onClick={addCustom}
          unstyled
        >
          + 自定义参数
        </Button>
        {preset ? (
          <Button
            type="button"
            className="btn-secondary"
            onClick={restorePreset}
            unstyled
          >
            恢复预设默认值
          </Button>
        ) : null}
        <div className="model-params__spacer" />
        <Button
          type="button"
          className="btn-secondary"
          onClick={onCancel}
          unstyled
        >
          取消
        </Button>
        <Button type="button" className="btn-primary" onClick={submit} unstyled>
          保存配置
        </Button>
      </footer>
    </Dialog>
  )
}
