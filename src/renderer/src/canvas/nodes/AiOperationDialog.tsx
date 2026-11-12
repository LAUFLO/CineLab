import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ModelDef } from '@shared/provider-schema'
import { modelInputs } from '@shared/provider-schema'
import { Icon } from '../../components/Icon'
import { Select } from '../../components/Select'
import { useSettingsStore } from '../../stores/settings'

interface AiOperationDialogProps {
  open: boolean
  title: string
  initialPrompt: string
  busy: boolean
  masked?: boolean
  /** 生成结果会创建新节点，而不是写回当前节点版本栈 */
  createsNode?: boolean
  onClose: () => void
  onConfirm: (prompt: string, modelKey: string, model: ModelDef) => void
}

export function AiOperationDialog({
  open,
  title,
  initialPrompt,
  busy,
  masked = false,
  createsNode = false,
  onClose,
  onConfirm
}: AiOperationDialogProps) {
  const providers = useSettingsStore((state) => state.providers)
  const openSettings = useSettingsStore((state) => state.openPanel)

  const models = useMemo(() => {
    return providers
      .flatMap((provider) =>
        provider.models
          .filter(
            (model) =>
              model.capability === 'image.i2i' || model.capability === 'image.t2i'
          )
          .map((model) => ({
            key: `${provider.id}/${model.id}`,
            providerName: provider.name,
            model
          }))
      )
      .sort((a, b) => {
        const rank = (item: { model: ModelDef }): number =>
          (modelInputs(item.model).includes('image') ? 0 : 10) +
          (item.model.capability === 'image.i2i' ? 0 : 1)
        return rank(a) - rank(b)
      })
  }, [providers])

  const firstModelKey =
    models.find((item) => modelInputs(item.model).includes('image'))?.key ??
    models[0]?.key ??
    ''
  const [prompt, setPrompt] = useState(initialPrompt)
  const [modelKey, setModelKey] = useState(firstModelKey)

  useEffect(() => {
    if (!open) return
    setPrompt(initialPrompt)
    setModelKey(firstModelKey)
  }, [open, initialPrompt, firstModelKey])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) onClose()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, busy, onClose])

  if (!open) return null

  const active = models.find((item) => item.key === modelKey)
  const activeSupportsImage = active
    ? modelInputs(active.model).includes('image')
    : false
  const valid =
    Boolean(active) && activeSupportsImage && prompt.trim().length > 0

  return createPortal(
    <div
      className="operation-dialog-overlay"
      onPointerDown={() => {
        if (!busy) onClose()
      }}
    >
      <div
        className="operation-dialog is-wide"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="operation-dialog__header">
          <div>
            <div className="operation-dialog__title">{title}</div>
            <div className="operation-dialog__subtitle">
              {masked
                ? '只修改涂抹区域，结果作为当前节点的新版本'
                : createsNode
                  ? '结果会创建一个新节点，并自动连到当前节点'
                  : '结果作为当前节点的新版本，保留原图'}
            </div>
          </div>
          <button
            type="button"
            className="operation-dialog__close"
            title="关闭"
            disabled={busy}
            onClick={onClose}
          >
            <Icon name="close" size={14} />
          </button>
        </div>

        {models.length === 0 ? (
          <div className="operation-dialog__empty">
            <p>还没有可用的图片模型。</p>
            <p>P1 操作需要支持图生图的模型，请先在设置中添加。</p>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                onClose()
                openSettings()
              }}
            >
              打开设置
            </button>
          </div>
        ) : (
          <>
            <label className="operation-dialog__field">
              <span>使用模型</span>
              <Select
                value={modelKey}
                options={models.map((item) => ({
                  value: item.key,
                  label: `${item.providerName} · ${item.model.name}${
                    modelInputs(item.model).includes('image')
                      ? ''
                      : '（不支持参考图）'
                  }`,
                  disabled: !modelInputs(item.model).includes('image')
                }))}
                onChange={(next) => setModelKey(next)}
                disabled={busy}
              />
            </label>

            <label className="operation-dialog__field">
              <span>提示词</span>
              <textarea
                className="operation-dialog__textarea"
                rows={7}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                disabled={busy}
              />
            </label>

            <div className="operation-dialog__hint">
              建议选择支持图生图的模型；提示词可以按需微调。
              {masked
                ? ' 当前操作会把蒙版一起提交，模型需要支持 /images/edits mask。'
                : ''}
            </div>
          </>
        )}

        <div className="operation-dialog__footer">
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!valid || busy}
            onClick={() => {
              if (!active || !prompt.trim()) return
              onConfirm(prompt.trim(), modelKey, active.model)
            }}
          >
            {busy ? '提交中…' : '开始生成'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
