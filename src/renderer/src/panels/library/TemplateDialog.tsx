import { useState } from 'react'
import { NODE_KINDS, NODE_META, type NodeKind } from '@shared/canvas-schema'
import type { TemplateInput } from '@shared/library-schema'
import { Button, Dialog, Input, Select, Textarea } from '../../components/ui'

interface TemplateDialogProps {
  initial: TemplateInput | null
  onCancel: () => void
  onSave: (input: TemplateInput) => void
}

export function TemplateDialog({
  initial,
  onCancel,
  onSave
}: TemplateDialogProps) {
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

  return (
    <Dialog
      open
      onClose={onCancel}
      bare
      ariaLabel={initial ? '编辑提示词模板' : '新建提示词模板'}
      overlayClassName="library-modal"
      panelClassName="library-modal__panel library-modal__panel--wide"
    >
      <div className="library-modal__title">
        {initial ? '编辑提示词模板' : '新建提示词模板'}
      </div>

      <label className="field">
        <span>名称</span>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="例如：雪夜电影感"
          autoFocus
          unstyled
        />
      </label>

      <label className="field">
        <span>适用节点</span>
        <Select
          value={kind}
          options={NODE_KINDS.map((item) => ({
            value: item,
            label: NODE_META[item].label
          }))}
          onChange={(next) => setKind(next)}
        />
      </label>

      <label className="field">
        <span>提示词</span>
        <Textarea
          className="library-textarea"
          rows={6}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="模板会直接填入 prompt bar"
          unstyled
        />
      </label>

      <div className="library-modal__actions">
        <Button variant="secondary" onClick={onCancel}>
          取消
        </Button>
        <Button
          variant="primary"
          onClick={submit}
          disabled={!name.trim() || !prompt.trim()}
        >
          保存
        </Button>
      </div>
    </Dialog>
  )
}
