import { useEffect, useState } from 'react'
import type {
  WorkflowSaveInput,
  WorkflowSummary
} from '@shared/workflow-schema'
import { Button, Dialog, Input, Select, Textarea } from '../components/ui'
import { useCanvasStore } from '../stores/canvas'
import { useProjectStore } from '../stores/project'
import { useUIStore } from '../stores/ui'

export function WorkflowSaveDialog() {
  const request = useUIStore((state) => state.workflowSaveRequest)
  const close = useUIStore((state) => state.closeWorkflowSave)
  const showToast = useUIStore((state) => state.showToast)
  const nodes = useCanvasStore((state) => state.nodes)
  const edges = useCanvasStore((state) => state.edges)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [includeText, setIncludeText] = useState(true)
  const [saving, setSaving] = useState(false)
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([])
  const [overwriteSlug, setOverwriteSlug] = useState('')
  const [saved, setSaved] = useState<WorkflowSummary | null>(null)

  useEffect(() => {
    if (!request) return
    setSaved(null)
    setOverwriteSlug(request.overwriteSlug ?? '')
    void window.api.workflow.list().then(setWorkflows)
  }, [request])

  if (!request) return null

  if (saved) {
    return (
      <Dialog
        open
        onClose={() => {
          setSaved(null)
          close()
        }}
        ariaLabel="工作流已保存"
        panelClassName="w-[min(440px,100%)] p-5"
      >
        <div className="mb-1 text-[16px] text-fg">工作流已保存</div>
        <p className="mb-4 mt-0 text-[12px] leading-[1.7] text-fg-subtle">
          「{saved.name}」已存入资产库「工作流」，包含 {saved.meta.nodeCount}{' '}
          个节点、{saved.meta.generationCount} 个生成节点。
        </p>
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setSaved(null)
              close()
            }}
          >
            完成
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              const slug = saved.slug
              setSaved(null)
              close()
              void useProjectStore.getState().startNew(slug)
            }}
          >
            用此工作流新建项目
          </Button>
        </div>
      </Dialog>
    )
  }

  const selectedIds = request.selectedIds
  const nodeCount = selectedIds?.length ?? nodes.length
  const selectedSet = new Set(selectedIds ?? nodes.map((node) => node.id))
  const edgeCount = selectedIds
    ? edges.filter(
        (edge) =>
          selectedIds.includes(edge.source) && selectedIds.includes(edge.target)
      ).length
    : edges.length
  const droppedEdges = edges.filter((edge) => {
    const sourceInside = selectedSet.has(edge.source)
    const targetInside = selectedSet.has(edge.target)
    return sourceInside !== targetInside
  }).length

  const submit = async (): Promise<void> => {
    const trimmed = name.trim()
    if (!trimmed) {
      showToast('请输入工作流名称', 'error')
      return
    }

    setSaving(true)
    try {
      const targetSlug = request.overwriteSlug ?? (overwriteSlug || undefined)
      const summary = await window.api.workflow.save({
        name: trimmed,
        description: description.trim() || undefined,
        nodes: nodes as unknown as WorkflowSaveInput['nodes'],
        edges: edges as unknown as WorkflowSaveInput['edges'],
        selectedIds,
        projectPath: '',
        includeLinkedText: includeText,
        overwriteSlug: targetSlug
      })
      showToast(
        targetSlug
          ? `工作流「${summary.name}」已更新`
          : `工作流「${summary.name}」已保存`
      )
      setName('')
      setDescription('')
      setIncludeText(true)
      setOverwriteSlug('')
      setSaved(summary)
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : String(error),
        'error'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open
      onClose={close}
      ariaLabel="保存为工作流"
      panelClassName="w-[min(460px,100%)] p-5"
    >
      <div className="mb-1 text-[16px] text-fg">
        {request.overwriteSlug ? '更新工作流' : '保存为工作流'}
      </div>
      <p className="mb-4 mt-0 text-[12px] leading-[1.7] text-fg-subtle">
        只保存节点结构、提示词、模型和参数；生成结果和项目内素材不会保存。
      </p>

      <label className="mb-3 flex flex-col gap-1.5 text-[11px] text-fg-subtle">
        <span>名称</span>
        <Input
          className="!rounded-md border-border-strong bg-surface !px-2.5 !text-[13px] focus:!border-border-selected"
          value={name}
          placeholder="例如：产品宣传片"
          autoFocus
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void submit()
          }}
        />
      </label>

      <label className="mb-3 flex flex-col gap-1.5 text-[11px] text-fg-subtle">
        <span>描述（选填）</span>
        <Textarea
          className="!min-h-[72px] !rounded-md border-border-strong bg-surface !px-2.5 !py-2 !text-[12px] focus:!border-border-selected"
          value={description}
          placeholder="这个工作流适合什么场景"
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>

      <label className="mb-3 flex flex-col gap-1.5 text-[11px] text-fg-subtle">
        <span>保存方式</span>
        <Select
          value={overwriteSlug}
          options={[
            { value: '', label: '新建工作流' },
            ...workflows.map((workflow) => ({
              value: workflow.slug,
              label: `覆盖「${workflow.name}」`
            }))
          ]}
          onChange={setOverwriteSlug}
          className="!w-full !text-[13px]"
        />
      </label>

      <label className="mb-4 flex cursor-pointer items-center gap-2 text-[11px] text-fg-muted">
        <Input
          type="checkbox"
          className="!h-auto !w-auto !rounded-none !border-0 !bg-transparent !p-0 accent-fg"
          checked={includeText}
          onChange={(event) => setIncludeText(event.target.checked)}
        />
        <span>一并包含关联的文本节点（@ 提及）</span>
      </label>

      <div className="mb-4 rounded-md bg-surface-hover px-2.5 py-2 text-[11px] leading-[1.6] text-fg-subtle">
        当前将保存 {nodeCount} 个节点、{edgeCount} 条连线
        {selectedIds ? '（选中范围）' : '（整个画布）'}。
        {droppedEdges > 0
          ? `将丢弃 ${droppedEdges} 条外部连接。`
          : '没有外部连接。'}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={close} disabled={saving}>
          取消
        </Button>
        <Button variant="primary" onClick={() => void submit()} disabled={saving}>
          {saving ? '保存中…' : request.overwriteSlug ? '更新' : '保存'}
        </Button>
      </div>
    </Dialog>
  )
}
