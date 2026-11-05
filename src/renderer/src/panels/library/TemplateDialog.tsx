import { useState } from 'react'
import { createPortal } from 'react-dom'
import { NODE_KINDS, NODE_META, type NodeKind } from '@shared/canvas-schema'
import type { TemplateInput } from '@shared/library-schema'

interface TemplateDialogProps {
  initial: TemplateInput | null
  onCancel: () => void
  onSave: (input: TemplateInput) => void
}

export function TemplateDialog({ initial, onCancel, onSave }: TemplateDialogProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [kind, setKind] = useState<NodeKind>(initial?.kind ?? 'image')
  const [prompt, setPrompt] = useState(initial?.prompt ?? '')

  const submit = (): void => {
    if (!name.trim() || !prompt.trim()) return
    onSave({
      id: initial?.id,
      name: name.trim(),
      kind,
      prompt: prompt.trim()
    })
  }

  return createPortal(
    <div className="library-modal" onPointerDown={onCancel}>
      <div
        className="library-modal__panel library-modal__panel--wide"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="library-modal__title">
          {initial ? '编辑提示词模板' : '新建提示词模板'}
        </div>

        <label className="field">
          <span>名称</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：雪夜电影感"
            autoFocus
          />
        </label>

        <label className="field">
          <span>适用节点</span>
          <select
            className="library-select"
            value={kind}
            onChange={(event) => setKind(event.target.value as NodeKind)}
          >
            {NODE_KINDS.map((item) => (
              <option key={item} value={item}>
                {NODE_META[item].label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>提示词</span>
          <textarea
            className="library-textarea"
            rows={6}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="模板会直接填入 prompt bar"
          />
        </label>

        <div className="library-modal__actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={submit}
            disabled={!name.trim() || !prompt.trim()}
          >
            保存
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
