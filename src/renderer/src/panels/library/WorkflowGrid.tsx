import { useMemo, useState } from 'react'
import type {
  WorkflowPackage,
  WorkflowSummary
} from '@shared/workflow-schema'
import { Icon } from '../../components/Icon'
import { Button, Dialog, Input } from '../../components/ui'
import { assetUrl } from '../../lib/asset-url'

interface WorkflowGridProps {
  workflows: WorkflowSummary[]
  query: string
  onAddToCanvas: (workflow: WorkflowSummary) => void
  onRename: (slug: string, name: string) => void
  onDelete: (workflow: WorkflowSummary) => void
  onExport: (workflow: WorkflowSummary) => void
  onCreateProject: (workflow: WorkflowSummary) => void
}

export function WorkflowGrid({
  workflows,
  query,
  onAddToCanvas,
  onRename,
  onDelete,
  onExport,
  onCreateProject
}: WorkflowGridProps) {
  const [renaming, setRenaming] = useState<WorkflowSummary | null>(null)
  const [draft, setDraft] = useState('')
  const [preview, setPreview] = useState<WorkflowPackage | null>(null)

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return workflows
    return workflows.filter((workflow) =>
      workflow.name.toLowerCase().includes(keyword)
    )
  }, [workflows, query])

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center text-xs leading-[1.8] text-fg-subtle">
        <Icon name="folder" size={28} className="text-fg-subtle" />
        <div>还没有保存的工作流</div>
        <div>在画布中选中节点，右键「保存为工作流」</div>
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-3 max-[900px]:grid-cols-2">
        {filtered.map((workflow) => (
          <div
            key={workflow.slug}
            className="group relative flex flex-col overflow-hidden rounded-card border border-border bg-surface-hover transition-[border-color,background] duration-[120ms] hover:border-border-selected hover:bg-surface-raised"
          >
            <Button
              type="button"
              variant="ghost"
              size="none"
              className="flex flex-col gap-2 p-3 !text-left !font-normal"
              onClick={() => onAddToCanvas(workflow)}
            >
              <div className="flex h-24 items-center justify-center overflow-hidden rounded-md border border-border bg-surface">
                {workflow.thumbnail ? (
                  <img
                    src={assetUrl(workflow.thumbnail, 'global')}
                    alt=""
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <Icon name="folder" size={28} className="text-fg-subtle" />
                )}
              </div>
              <div className="min-w-0">
                <div className="truncate text-[13px] text-fg">
                  {workflow.name}
                </div>
                <div className="mt-0.5 text-[10.5px] leading-[1.6] text-fg-subtle">
                  {workflow.meta.nodeCount} 个节点 ·{' '}
                  {workflow.meta.generationCount} 个生成
                  {workflow.meta.uploadSlotCount > 0
                    ? ` · ${workflow.meta.uploadSlotCount} 个待上传`
                    : ''}
                </div>
              </div>
            </Button>

            <div className="flex items-center gap-1 border-t border-divider px-2 py-1.5">
              <Button
                variant="ghost"
                size="none"
                className="!h-6 !px-1.5 !text-[10.5px] !font-normal"
                onClick={() => onAddToCanvas(workflow)}
              >
                添加到画布
              </Button>
              <Button
                variant="ghost"
                size="none"
                className="!h-6 !px-1.5 !text-[10.5px] !font-normal"
                onClick={() => onCreateProject(workflow)}
              >
                新建项目
              </Button>
              <div className="ml-auto flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="none"
                  className="!h-6 !w-6"
                  title="预览"
                  onClick={() => {
                    void window.api.workflow
                      .read(workflow.slug)
                      .then(setPreview)
                  }}
                >
                  <Icon name="search" size={12} />
                </Button>
                <Button
                  variant="ghost"
                  size="none"
                  className="!h-6 !w-6"
                  title="重命名"
                  onClick={() => {
                    setRenaming(workflow)
                    setDraft(workflow.name)
                  }}
                >
                  <Icon name="text" size={12} />
                </Button>
                <Button
                  variant="ghost"
                  size="none"
                  className="!h-6 !w-6"
                  title="导出"
                  onClick={() => onExport(workflow)}
                >
                  <Icon name="download" size={12} />
                </Button>
                <Button
                  variant="ghost"
                  size="none"
                  className="!h-6 !w-6"
                  title="删除"
                  onClick={() => onDelete(workflow)}
                >
                  <Icon name="close" size={12} />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {renaming ? (
        <Dialog
          open
          onClose={() => setRenaming(null)}
          ariaLabel="重命名工作流"
          panelClassName="w-[min(380px,100%)] p-5"
        >
          <div className="mb-3 text-[15px] text-fg">重命名工作流</div>
          <Input
            className="!h-9 !rounded-md border-border-strong bg-surface !px-2.5 !text-[13px] focus:!border-border-selected"
            value={draft}
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              const name = draft.trim()
              if (!name) return
              onRename(renaming.slug, name)
              setRenaming(null)
            }}
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRenaming(null)}>
              取消
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                const name = draft.trim()
                if (!name) return
                onRename(renaming.slug, name)
                setRenaming(null)
              }}
            >
              保存
            </Button>
          </div>
        </Dialog>
      ) : null}
      {preview ? (
        <Dialog
          open
          onClose={() => setPreview(null)}
          ariaLabel="工作流预览"
          panelClassName="w-[min(560px,100%)] p-5"
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[15px] text-fg">{preview.name}</div>
            <Button
              variant="ghost"
              size="none"
              className="h-7 w-7"
              onClick={() => setPreview(null)}
            >
              <Icon name="close" size={14} />
            </Button>
          </div>

          <div className="mb-3 flex h-44 items-center justify-center overflow-hidden rounded-md border border-border bg-surface">
            {(() => {
              const thumbnail = workflows.find(
                (item) => item.id === preview.id
              )?.thumbnail
              return thumbnail ? (
                <img
                  src={assetUrl(thumbnail, 'global')}
                  alt=""
                  className="h-full w-full object-contain"
                />
              ) : (
                <Icon name="folder" size={28} className="text-fg-subtle" />
              )
            })()}
          </div>

          <div className="mb-2 text-[11px] leading-[1.7] text-fg-subtle">
            {preview.meta.nodeCount} 个节点 · {preview.meta.generationCount}{' '}
            个生成节点 · {preview.meta.uploadSlotCount} 个待上传
          </div>

          <div className="mb-4 max-h-[170px] overflow-y-auto rounded-md border border-border">
            {preview.canvas.nodes.slice(0, 100).map((node) => (
              <div
                key={node.id}
                className="flex items-center justify-between gap-2 border-b border-divider px-2.5 py-1 text-[11px] last:border-b-0"
              >
                <span className="min-w-0 truncate text-fg-muted">
                  {String(
                    (node.data as { title?: string }).title ?? node.id
                  )}
                </span>
                <span className="shrink-0 text-fg-subtle">{node.type}</span>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPreview(null)}>
              关闭
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                const summary = workflows.find(
                  (item) => item.id === preview.id
                )
                setPreview(null)
                if (summary) onAddToCanvas(summary)
              }}
            >
              添加到画布
            </Button>
          </div>
        </Dialog>
      ) : null}
    </>
  )
}
