import type { PromptTemplate } from '@shared/library-schema'
import { NODE_META } from '@shared/canvas-schema'
import { Icon } from '../../components/Icon'
import { Button } from '../../components/ui'

interface TemplateGridProps {
  templates: PromptTemplate[]
  query: string
  onUse: (template: PromptTemplate) => void
  onEdit: (template: PromptTemplate) => void
  onDelete: (template: PromptTemplate) => void
  onCreate: () => void
}

export function TemplateGrid({
  templates,
  query,
  onUse,
  onEdit,
  onDelete,
  onCreate
}: TemplateGridProps) {
  const keyword = query.trim().toLowerCase()
  const filtered = keyword
    ? templates.filter(
        (template) =>
          template.name.toLowerCase().includes(keyword) ||
          template.prompt.toLowerCase().includes(keyword)
      )
    : templates

  return (
    <div className="library-templates">
      {filtered.map((template) => (
        <div key={template.id} className="library-template-card">
          <div className="library-template-card__head">
            <span className="library-template-card__kind">
              {NODE_META[template.kind].label}
            </span>
            <span className="library-template-card__name" title={template.name}>
              {template.name}
            </span>
          </div>

          <p className="library-template-card__prompt">
            {template.prompt || '空模板'}
          </p>

          <div className="library-template-card__actions">
            <Button
              type="button"
              className="btn-primary library-template-card__use"
              onClick={() => onUse(template)}
              unstyled
            >
              使用
            </Button>
            <Button
              type="button"
              title="编辑"
              onClick={() => onEdit(template)}
              unstyled
            >
              <Icon name="edit" size={13} />
            </Button>
            <Button
              type="button"
              title="删除"
              onClick={() => onDelete(template)}
              unstyled
            >
              <Icon name="trash" size={13} />
            </Button>
          </div>
        </div>
      ))}

      {filtered.length === 0 ? (
        <div className="library-empty">
          <Icon name="text" size={30} />
          <div className="library-empty__title">
            {keyword ? '没有匹配的模板' : '还没有提示词模板'}
          </div>
          <div className="library-empty__desc">
            {keyword
              ? '换个关键词试试'
              : '把常用提示词存成模板，跨项目直接复用'}
          </div>
        </div>
      ) : null}

      <Button
        type="button"
        className="library-add-btn"
        onClick={onCreate}
        unstyled
      >
        <Icon name="plus" size={14} />
        新建模板
      </Button>
    </div>
  )
}
