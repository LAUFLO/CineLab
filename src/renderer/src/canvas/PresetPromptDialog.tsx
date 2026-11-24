import { useEffect, useState } from 'react'
import { NODE_META, type NodeKind } from '@shared/canvas-schema'
import type { PromptTemplate, TemplateInput } from '@shared/library-schema'
import { Icon } from '../components/Icon'
import { Button, Dialog, IconButton, Input } from '../components/ui'
import { TemplateDialog } from '../panels/library/TemplateDialog'
import { useLibraryStore } from '../stores/library'
import { useUIStore } from '../stores/ui'

interface PresetPromptDialogProps {
  open: boolean
  kind: NodeKind
  onClose: () => void
  onInsert: (template: PromptTemplate) => void
}

export function PresetPromptDialog({
  open,
  kind,
  onClose,
  onInsert
}: PresetPromptDialogProps) {
  const templates = useLibraryStore((state) => state.templates)
  const loadTemplates = useLibraryStore((state) => state.loadTemplates)
  const saveTemplate = useLibraryStore((state) => state.saveTemplate)
  const deleteTemplate = useLibraryStore((state) => state.deleteTemplate)
  const requestConfirm = useUIStore((state) => state.requestConfirm)
  const showToast = useUIStore((state) => state.showToast)

  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<TemplateInput | null>(null)

  useEffect(() => {
    if (!open) return
    void loadTemplates()
  }, [open, loadTemplates])

  useEffect(() => {
    if (open) return
    setQuery('')
    setEditing(null)
  }, [open])

  const keyword = query.trim().toLowerCase()
  const filtered = keyword
    ? templates.filter(
        (template) =>
          template.name.toLowerCase().includes(keyword) ||
          template.prompt.toLowerCase().includes(keyword)
      )
    : templates
  const ordered = [...filtered].sort((a, b) => {
    const aCurrent = a.kind === kind ? 0 : 1
    const bCurrent = b.kind === kind ? 0 : 1
    return aCurrent - bCurrent || a.name.localeCompare(b.name, 'zh-CN')
  })

  const handleSave = (input: TemplateInput): void => {
    void saveTemplate(input).then((ok) => {
      if (!ok) {
        showToast('保存预设提示词失败，请查看资产库提示', 'error')
        return
      }
      setEditing(null)
    })
  }

  const handleDelete = (template: PromptTemplate): void => {
    requestConfirm({
      title: '删除预设提示词',
      message: `确定删除「${template.name}」吗？`,
      confirmLabel: '删除',
      danger: true,
      onConfirm: () => void deleteTemplate(template.id)
    })
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      bare
      ariaLabel="预设提示词"
      overlayClassName="fixed inset-0 z-[900] flex items-center justify-center bg-overlay p-4"
      panelClassName="flex h-[min(560px,calc(100vh_-_64px))] w-[min(760px,calc(100vw_-_48px))] flex-col overflow-hidden rounded-panel border border-border bg-surface-raised text-fg shadow-float"
    >
      <div className="flex shrink-0 items-center gap-2 px-4 pb-1 pt-3">
        <div className="shrink-0 whitespace-nowrap text-sm font-medium text-fg">
          预设提示词
        </div>
        <div className="flex-1" />
        <div className="w-[220px] shrink-0">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索预设提示词"
            className="!h-7"
            aria-label="搜索预设提示词"
          />
        </div>
        <IconButton label="关闭" size="sm" onClick={onClose}>
          <Icon name="close" size={15} />
        </IconButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {ordered.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-fg-muted">
            {templates.length === 0
              ? '还没有预设提示词，点击下方新建'
              : '没有匹配的预设提示词'}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ordered.map((template) => (
              <div
                key={template.id}
                role="button"
                tabIndex={0}
                onClick={() => onInsert(template)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return
                  event.preventDefault()
                  onInsert(template)
                }}
                className="group relative flex cursor-pointer flex-col gap-1.5 rounded-card border border-border bg-surface-raised p-3 text-left transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                <div className="flex min-w-0 items-center gap-2 pr-14">
                  <span className="shrink-0 rounded-md border border-border bg-surface px-1.5 py-px text-[10px] text-fg-subtle">
                    {NODE_META[template.kind].label}
                  </span>
                  {template.kind === kind ? (
                    <span className="shrink-0 text-[10px] text-accent">
                      当前类型
                    </span>
                  ) : null}
                </div>

                <div className="truncate text-[13px] text-fg">
                  {template.name}
                </div>
                <div className="line-clamp-2 text-xs leading-[1.6] text-fg-muted">
                  {template.prompt || '空预设'}
                </div>

                <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <IconButton
                    label="编辑预设"
                    size="xs"
                    className="h-6 w-6 bg-surface/90"
                    onClick={(event) => {
                      event.stopPropagation()
                      setEditing({
                        id: template.id,
                        name: template.name,
                        kind: template.kind,
                        prompt: template.prompt
                      })
                    }}
                  >
                    <Icon name="edit" size={11} />
                  </IconButton>
                  <IconButton
                    label="删除预设"
                    size="xs"
                    className="h-6 w-6 bg-surface/90"
                    onClick={(event) => {
                      event.stopPropagation()
                      handleDelete(template)
                    }}
                  >
                    <Icon name="trash" size={11} />
                  </IconButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3 border-t border-divider px-4 py-2.5">
        <span className="min-w-0 truncate text-xs text-fg-muted">
          点击卡片插入到提示词光标位置，可连续添加多个
        </span>
        <div className="flex-1" />
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setEditing({ name: '', kind, prompt: '' })}
        >
          <Icon name="plus" size={12} />
          新建提示词
        </Button>
      </div>

      {editing ? (
        <TemplateDialog
          initial={editing}
          onCancel={() => setEditing(null)}
          onSave={handleSave}
          overlayClassName="fixed inset-0 z-[950] flex items-center justify-center bg-overlay"
        />
      ) : null}
    </Dialog>
  )
}
