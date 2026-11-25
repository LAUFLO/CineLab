import { useState } from 'react'
import type { WorkflowSummary } from '@shared/workflow-schema'
import { Icon } from '../components/Icon'
import { Button, Dialog, Input } from '../components/ui'
import { useLibraryStore } from '../stores/library'
import { useUIStore } from '../stores/ui'

interface WorkflowManageDialogProps {
  workflows: WorkflowSummary[]
  open: boolean
  onClose: () => void
  onChanged: () => void
}

export function WorkflowManageDialog({
  workflows,
  open,
  onClose,
  onChanged
}: WorkflowManageDialogProps) {
  const renameWorkflow = useLibraryStore((state) => state.renameWorkflow)
  const deleteWorkflow = useLibraryStore((state) => state.deleteWorkflow)
  const showToast = useUIStore((state) => state.showToast)
  const requestConfirm = useUIStore((state) => state.requestConfirm)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  if (!open) return null

  const submitRename = (workflow: WorkflowSummary): void => {
    const name = draft.trim()
    if (!name || name === workflow.name) {
      setEditing(null)
      return
    }
    void renameWorkflow(workflow.slug, name).then(onChanged)
    setEditing(null)
  }

  return (
    <Dialog
      open
      onClose={onClose}
      ariaLabel="管理工作流"
      panelClassName="w-[min(560px,100%)] p-5"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[15px] text-fg">管理工作流</div>
        <Button variant="ghost" size="none" className="h-7 w-7" onClick={onClose}>
          <Icon name="close" size={14} />
        </Button>
      </div>

      {workflows.length === 0 ? (
        <div className="py-8 text-center text-xs text-fg-subtle">
          还没有保存的工作流
        </div>
      ) : (
        <div className="flex max-h-[380px] flex-col gap-1.5 overflow-y-auto pr-1">
          {workflows.map((workflow) => (
            <div
              key={workflow.slug}
              className="flex items-center gap-2 rounded-md border border-border bg-surface-hover px-2.5 py-2"
            >
              {editing === workflow.slug ? (
                <Input
                  className="!h-8 min-w-0 flex-1 !rounded-md border-border-strong bg-surface !px-2 !text-[12px]"
                  value={draft}
                  autoFocus
                  onChange={(event) => setDraft(event.target.value)}
                  onBlur={() => submitRename(workflow)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') submitRename(workflow)
                    if (event.key === 'Escape') setEditing(null)
                  }}
                />
              ) : (
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] text-fg">
                    {workflow.name}
                  </div>
                  <div className="text-[10.5px] text-fg-subtle">
                    {workflow.meta.nodeCount} 个节点 ·{' '}
                    {workflow.meta.generationCount} 个生成
                  </div>
                </div>
              )}

              <Button
                variant="ghost"
                size="none"
                className="!h-7 !w-7"
                title="重命名"
                onClick={() => {
                  setEditing(workflow.slug)
                  setDraft(workflow.name)
                }}
              >
                <Icon name="text" size={13} />
              </Button>
              <Button
                variant="ghost"
                size="none"
                className="!h-7 !w-7"
                title="导出"
                onClick={() => {
                  void window.api.workflow
                    .export(workflow.slug)
                    .then((result) => {
                      if (result.ok) showToast('工作流已导出')
                      else if (!result.canceled)
                        showToast(result.error ?? '导出失败', 'error')
                    })
                }}
              >
                <Icon name="download" size={13} />
              </Button>
              <Button
                variant="ghost"
                size="none"
                className="!h-7 !w-7"
                title="删除"
                onClick={() =>
                  requestConfirm({
                    title: '删除工作流？',
                    message: `「${workflow.name}」会从资产库永久删除，已用它创建的项目不受影响。`,
                    confirmLabel: '删除',
                    danger: true,
                    onConfirm: () =>
                      void deleteWorkflow(workflow.slug).then(onChanged)
                  })
                }
              >
                <Icon name="close" size={13} />
              </Button>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  )
}
