import { useState } from 'react'
import { NODE_KINDS, NODE_META, type NodeKind } from '@shared/canvas-schema'
import type { TemplateInput } from '@shared/library-schema'
import { Button, Dialog, Field, Input, Select, Textarea } from '../../components/ui'

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

  return (
    <Dialog
      open
      onClose={onCancel}
      title={initial ? '编辑提示词模板' : '新建提示词模板'}
      size="md"
      footer={
        <>
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
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="名称" htmlFor="template-name">
          <Input
            id="template-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：雪夜电影感"
            autoFocus
          />
        </Field>

        <Field label="适用节点">
          <Select
            value={kind}
            options={NODE_KINDS.map((item) => ({
              value: item,
              label: NODE_META[item].label
            }))}
            onChange={(next) => setKind(next)}
          />
        </Field>

        <Field label="提示词" htmlFor="template-prompt">
          <Textarea
            id="template-prompt"
            rows={6}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="模板会直接填入 prompt bar"
          />
        </Field>
      </div>
    </Dialog>
  )
}
