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
      overlayClassName="fixed inset-0 z-[260] flex items-center justify-center bg-black/50"
      panelClassName="w-[560px] rounded-[12px] border border-border bg-surface px-5 pb-4 pt-[18px] shadow-menu"
    >
      <div className="mb-[14px] text-sm text-fg">
        {initial ? '编辑提示词模板' : '新建提示词模板'}
      </div>

      <label className="mb-[14px] flex flex-col gap-1.5">
        <span className="text-xs text-fg-muted">名称</span>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="例如：雪夜电影感"
          autoFocus
          className="!h-[34px] !rounded-[8px] !bg-surface-hover !px-2.5 !text-[13px]"
        />
      </label>

      <label className="mb-[14px] flex flex-col gap-1.5">
        <span className="text-xs text-fg-muted">适用节点</span>
        <Select
          value={kind}
          options={NODE_KINDS.map((item) => ({
            value: item,
            label: NODE_META[item].label
          }))}
          onChange={(next) => setKind(next)}
        />
      </label>

      <label className="mb-[14px] flex flex-col gap-1.5">
        <span className="text-xs text-fg-muted">提示词</span>
        <Textarea
          className="!min-h-[76px] resize-y !rounded-[8px] !bg-surface-hover !px-2.5 !py-2 !text-[13px]"
          rows={6}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="模板会直接填入 prompt bar"
        />
      </label>

      <div className="mt-4 flex justify-end gap-2">
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
