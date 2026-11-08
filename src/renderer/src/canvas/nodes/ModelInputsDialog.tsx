import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  CAPABILITY_LABEL,
  MEDIA_INPUTS,
  MEDIA_INPUT_LABEL,
  modelInputs,
  type MediaInput,
  type ModelDef
} from '@shared/provider-schema'
import { Icon } from '../../components/Icon'

interface ModelInputsDialogProps {
  model: ModelDef | null
  onCancel: () => void
  onSave: (inputs: MediaInput[]) => void
}

export function ModelInputsDialog({
  model,
  onCancel,
  onSave
}: ModelInputsDialogProps) {
  const [values, setValues] = useState<MediaInput[]>([])

  useEffect(() => {
    setValues(model ? modelInputs(model) : [])
  }, [model])

  useEffect(() => {
    if (!model) return

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onCancel()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [model, onCancel])

  if (!model) return null

  const toggle = (input: MediaInput): void => {
    if (input === 'text') return
    setValues((current) =>
      current.includes(input)
        ? current.filter((item) => item !== input)
        : [...current, input]
    )
  }

  return createPortal(
    <div className="settings-overlay" onPointerDown={onCancel}>
      <div
        className="operation-dialog model-inputs-dialog"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="operation-dialog__header">
          <div>
            <div className="operation-dialog__title">输入能力</div>
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
          勾选这个模型实际能接收的素材。Prompt Bar
          会根据当前节点已引用的图片或视频，自动置灰不支持的模型。
        </div>

        <div className="model-inputs__grid">
          {MEDIA_INPUTS.map((input) => {
            const checked = values.includes(input)
            const locked = input === 'text'

            return (
              <button
                key={input}
                type="button"
                className={`model-inputs__item${checked ? ' is-on' : ''}${
                  locked ? ' is-locked' : ''
                }`}
                onClick={() => toggle(input)}
              >
                <span className="model-inputs__check">{checked ? '✓' : ''}</span>
                <span className="model-inputs__name">
                  {MEDIA_INPUT_LABEL[input]}
                </span>
                {locked ? (
                  <span className="model-inputs__lock">必选</span>
                ) : null}
              </button>
            )
          })}
        </div>

        <div className="operation-dialog__hint">
          图片：参考图、首帧、尾帧；视频：参考视频，仅 http-template
          专用接口可用；音频：参考音频，目前仅部分模型支持。
        </div>

        <div className="operation-dialog__footer">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={values.length === 0}
            onClick={() => onSave(values)}
          >
            保存
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
