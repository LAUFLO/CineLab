import { useEffect, useState, type RefObject } from 'react'
import { NODE_META, type NodeKind } from '@shared/canvas-schema'
import type { PromptTemplate, TemplateInput } from '@shared/library-schema'
import { Icon } from '../components/Icon'
import {
  Button,
  Dialog,
  DIALOG_PANEL,
  IconButton,
  Input,
  Popover
} from '../components/ui'
import { TemplateDialog } from '../panels/library/TemplateDialog'
import { useLibraryStore } from '../stores/library'
import { useUIStore } from '../stores/ui'

interface PresetPromptDialogProps {
  open: boolean
  kind: NodeKind
  anchorRef: RefObject<HTMLElement | null>
  avoidRef?: RefObject<HTMLElement | null>
  onClose: () => void
  onInsert: (template: PromptTemplate) => void
}

export function PresetPromptDialog({
  open,
  kind,
  anchorRef,
  avoidRef,
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
  const [previewing, setPreviewing] = useState<PromptTemplate | null>(null)

  useEffect(() => {
    if (!open) return
    void loadTemplates()
  }, [open, loadTemplates])

  useEffect(() => {
    if (open) return
    setQuery('')
    setEditing(null)
    setPreviewing(null)
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
    if (template.source === 'official') {
      showToast('官方预设提示词不能删除', 'error')
      return
    }
    requestConfirm({
      title: '删除预设提示词',
      message: `确定删除「${template.name}」吗？`,
      confirmLabel: '删除',
      danger: true,
      onConfirm: () => void deleteTemplate(template.id)
    })
  }

  // 新建/预览弹窗走 portal，点击它们内部也会被 Popover 当成外部点击；
  // 子弹窗打开时先保住预设浮窗，等子弹窗关闭后再恢复外部点击关闭。
  const handlePopoverClose = (): void => {
    if (editing || previewing) return
    onClose()
  }

  return (
    <>
      <Popover
        open={open}
        onClose={handlePopoverClose}
        anchorRef={anchorRef}
        avoidRef={avoidRef}
        placement="top"
        align="center"
        width={620}
        height={480}
        maxHeight={520}
        gap={14}
        follow
        bare
        ariaLabel="预设提示词"
        className="overflow-hidden"
      >
        <div className="flex h-full flex-col">
          <div className="flex shrink-0 items-center gap-2 px-3 py-2">
            <div className="shrink-0 whitespace-nowrap text-sm font-medium text-fg">
              预设提示词
            </div>
            <div className="flex-1" />
            <div className="w-[180px] shrink-0">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索预设"
                className="!h-7"
                aria-label="搜索预设提示词"
              />
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="shrink-0 whitespace-nowrap"
              onClick={() => setEditing({ name: '', kind, prompt: '' })}
            >
              <Icon name="plus" size={12} />
              新建
            </Button>
            <IconButton
              label="关闭"
              size="sm"
              className="shrink-0"
              onClick={onClose}
            >
              <Icon name="close" size={15} />
            </IconButton>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            {ordered.length === 0 ? (
              <div className="flex h-full items-center justify-center px-4 text-center text-xs text-fg-muted">
                {templates.length === 0
                  ? '还没有预设提示词，点击右上角新建'
                  : '没有匹配的预设提示词'}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
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
                    className="group flex cursor-pointer flex-col gap-1.5 rounded-card border border-border bg-surface-raised p-2.5 text-left transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                  >
                    <div className="flex items-center gap-1">
                      <div
                        className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg"
                        title={template.name}
                      >
                        {template.name}
                      </div>
                      {template.source === 'official' ? (
                        <span className="shrink-0 rounded-md border border-border bg-surface px-1 py-px text-[9px] text-fg-subtle">
                          官方
                        </span>
                      ) : null}
                      <div className="flex shrink-0 gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                        <IconButton
                          label="预览预设"
                          unstyled
                          className="flex h-6 w-6 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
                          onClick={(event) => {
                            event.stopPropagation()
                            setPreviewing(template)
                          }}
                        >
                          <Icon name="eye" size={13} />
                        </IconButton>
                        {template.source !== 'official' ? (
                          <>
                            <IconButton
                              label="编辑预设"
                              unstyled
                              className="flex h-6 w-6 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
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
                              <Icon name="edit" size={13} />
                            </IconButton>
                            <IconButton
                              label="删除预设"
                              unstyled
                              className="flex h-6 w-6 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
                              onClick={(event) => {
                                event.stopPropagation()
                                handleDelete(template)
                              }}
                            >
                              <Icon name="trash" size={13} />
                            </IconButton>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <div className="line-clamp-3 min-h-[50px] text-[11px] leading-[1.5] text-fg-muted">
                      {template.prompt || '空预设'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Popover>

      {previewing ? (
        <Dialog
          open
          onClose={() => setPreviewing(null)}
          bare
          ariaLabel="预设提示词全文"
          overlayClassName="fixed inset-0 z-[1100] flex items-center justify-center bg-overlay p-4"
          panelClassName={`w-[min(560px,100%)] ${DIALOG_PANEL}`}
        >
          <div className="mb-2 flex items-start justify-between gap-4">
            <div className="min-w-0 text-[15px] font-medium text-fg">
              {previewing.name}
            </div>
            <IconButton
              label="关闭"
              size="sm"
              onClick={() => setPreviewing(null)}
            >
              <Icon name="close" size={15} />
            </IconButton>
          </div>
          <p className="max-h-[55vh] overflow-y-auto whitespace-pre-wrap text-[13px] leading-6 text-fg-muted">
            {previewing.prompt || '空预设'}
          </p>
          <div className="mt-3 text-[11px] text-fg-subtle">
            适用节点：{NODE_META[previewing.kind].label}
          </div>
        </Dialog>
      ) : null}

      {editing ? (
        <TemplateDialog
          initial={editing}
          onCancel={() => setEditing(null)}
          onSave={handleSave}
          overlayClassName="fixed inset-0 z-[1100] flex items-center justify-center bg-overlay"
        />
      ) : null}
    </>
  )
}
