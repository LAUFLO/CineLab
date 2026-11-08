import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  CAPABILITY_LABEL,
  type ModelDef,
  type ModelPricing
} from '@shared/provider-schema'
import { Icon } from '../../components/Icon'
import { Select } from '../../components/Select'

interface ModelPricingDialogProps {
  model: ModelDef | null
  onCancel: () => void
  onSave: (pricing: ModelPricing | undefined) => void
}

const UNIT_OPTIONS: Array<{ value: ModelPricing['unit']; label: string }> = [
  { value: 'request', label: '按次' },
  { value: 'image', label: '按张' },
  { value: 'second', label: '按秒' },
  { value: '1k-tokens', label: '按千 token' }
]

const UNIT_HINT: Record<ModelPricing['unit'], string> = {
  request: '每次生成请求计一次费用。',
  image: '按生成张数计费；数量取自模型的 n 参数。',
  second: '按视频时长计费；时长取自模型的 duration 参数。',
  '1k-tokens': '按 token 用量计费；对话类模型无法在生成前预估，提案会显示未配置单价。'
}

export function ModelPricingDialog({
  model,
  onCancel,
  onSave
}: ModelPricingDialogProps) {
  const [unit, setUnit] = useState<ModelPricing['unit']>('request')
  const [currency, setCurrency] = useState('CNY')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!model) return
    setError(null)
    setUnit(model.pricing?.unit ?? 'request')
    setCurrency(model.pricing?.currency ?? 'CNY')
    setAmount(
      model.pricing ? String(model.pricing.amount) : ''
    )
    setNote(model.pricing?.note ?? '')
  }, [model])

  if (!model) return null

  const submit = (): void => {
    const value = Number(amount)
    if (amount.trim() === '' || !Number.isFinite(value) || value < 0) {
      setError('单价必须是非负数字')
      return
    }
    const code = currency.trim().toUpperCase()
    if (!code || code.length > 8) {
      setError('币种不能为空且不能超过 8 个字符')
      return
    }
    if (note.length > 200) {
      setError('备注不能超过 200 个字符')
      return
    }

    onSave({
      unit,
      currency: code,
      amount: value,
      ...(note.trim() ? { note: note.trim() } : {})
    })
  }

  return createPortal(
    <div className="settings-overlay" onPointerDown={onCancel}>
      <div
        className="operation-dialog model-params-dialog"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="operation-dialog__header">
          <div>
            <div className="operation-dialog__title">模型计费</div>
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
          单价只用于 Agent 生成提案的费用预估，不会触发真实扣费。留空表示未配置。
        </div>

        <div className="model-params__list">
          <div className="model-param">
            <div className="model-param__grid is-single">
              <label>
                <span>计费单位</span>
                <Select
                  value={unit}
                  options={UNIT_OPTIONS}
                  onChange={(next) => setUnit(next as ModelPricing['unit'])}
                />
              </label>
            </div>
            <div className="model-param__duration-hint">
              <span>{UNIT_HINT[unit]}</span>
            </div>
            <div className="model-param__grid is-three">
              <label>
                <span>币种</span>
                <input
                  value={currency}
                  placeholder="CNY"
                  onChange={(event) => setCurrency(event.target.value)}
                />
              </label>
              <label>
                <span>单价</span>
                <input
                  type="number"
                  min="0"
                  step="0.0001"
                  value={amount}
                  placeholder="例如 0.2"
                  onChange={(event) => setAmount(event.target.value)}
                />
              </label>
              <label>
                <span>备注</span>
                <input
                  value={note}
                  placeholder="可选"
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
            </div>
          </div>
        </div>

        {error ? <div className="form-message is-error">{error}</div> : null}

        <footer className="model-params__footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onSave(undefined)}
          >
            清除计费
          </button>
          <div className="model-params__spacer" />
          <button type="button" className="btn-secondary" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="btn-primary" onClick={submit}>
            保存计费
          </button>
        </footer>
      </div>
    </div>,
    document.body
  )
}
