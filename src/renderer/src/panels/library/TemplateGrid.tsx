import type { PromptTemplate } from '@shared/library-schema'
import { NODE_META } from '@shared/canvas-schema'
import { Icon } from '../../components/Icon'
import { Button } from '../../components/ui'

const ACTION_BUTTON_CLASS =
  '!h-7 !w-7 !rounded-md !px-0 text-fg-muted hover:text-fg'

interface TemplateGridProps {
  templates: PromptTemplate[]
  query: string
  onUse: (template: PromptTemplate) => void
  onEdit: (template: PromptTemplate) => void
  onDelete: (template: PromptTemplate) => void
}

export function TemplateGrid({
  templates,
  query,
  onUse,
  onEdit,
  onDelete
}: TemplateGridProps) {
  const keyword = query.trim().toLowerCase()
  const filtered = keyword
    ? templates.filter(
        (template) =>
          template.name.toLowerCase().includes(keyword) ||
          template.prompt.toLowerCase().includes(keyword)
      )
    : templates

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1.5 px-3 pb-[18px] pt-[30px] text-center text-fg-subtle">
        <Icon name="text" size={30} className="mb-0.5 opacity-[0.65]" />
        <div className="text-[13px] text-fg-muted">
          {keyword ? '没有匹配的模板' : '还没有提示词模板'}
        </div>
        <div className="max-w-[236px] text-xs leading-[1.7]">
          {keyword
            ? '换个关键词试试'
            : '把常用提示词存成模板，跨项目直接复用'}
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
      {filtered.map((template) => (
        <div
          key={template.id}
          className="flex flex-col justify-between gap-2 rounded-card border border-border bg-surface-raised px-[14px] py-3 hover:border-border-strong"
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 rounded-md border border-border bg-surface px-1.5 py-px text-[10px] text-fg-subtle">
              {NODE_META[template.kind].label}
            </span>
            <span
              className="min-w-0 flex-1 truncate text-[13px] text-fg"
              title={template.name}
            >
              {template.name}
            </span>
          </div>

          <p className="m-0 line-clamp-3 min-h-[60px] whitespace-pre-wrap text-xs leading-[1.65] text-fg-muted">
            {template.prompt || '空模板'}
          </p>

          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="primary"
              size="none"
              className="mr-auto h-7 min-w-[64px] cursor-pointer rounded-md px-3 text-xs"
              onClick={() => onUse(template)}
            >
              使用
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="none"
              title="编辑"
              className={ACTION_BUTTON_CLASS}
              onClick={() => onEdit(template)}
            >
              <Icon name="edit" size={13} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="none"
              title="删除"
              className={ACTION_BUTTON_CLASS}
              onClick={() => onDelete(template)}
            >
              <Icon name="trash" size={13} />
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
