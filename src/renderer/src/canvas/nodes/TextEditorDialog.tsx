import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import { renderMarkdown } from './text-markdown'
import { Button, Dialog, Textarea } from '../../components/ui'

interface TextEditorDialogProps {
  open: boolean
  title: string
  initialText: string
  onClose: () => void
  onSave: (text: string) => void
}

const TOOLBAR: Array<{
  label: string
  before: string
  after?: string
}> = [
  { label: 'H2', before: '## ' },
  { label: '粗体', before: '**', after: '**' },
  { label: '列表', before: '- ' },
  { label: '引用', before: '> ' },
  { label: '代码', before: '```\n', after: '\n```' },
  { label: '表格', before: '| 列 1 | 列 2 |\n| --- | --- |\n| 内容 | 内容 |\n' }
]

export function TextEditorDialog({
  open,
  title,
  initialText,
  onClose,
  onSave
}: TextEditorDialogProps) {
  const [draft, setDraft] = useState(initialText)
  const [view, setView] = useState<'edit' | 'preview'>('edit')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!open) return
    setDraft(initialText)
    setView('edit')
    window.setTimeout(() => textareaRef.current?.focus(), 30)
  }, [open, initialText])

  useEffect(() => {
    if (!open || view !== 'edit') return
    textareaRef.current?.focus()
  }, [open, view])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault()
        onSave(draft)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, draft, onClose, onSave])

  const preview = useMemo(() => renderMarkdown(draft), [draft])

  const insert = (before: string, after = ''): void => {
    const textarea = textareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = draft.slice(start, end) || '文本'
    const next = `${draft.slice(0, start)}${before}${selected}${after}${draft.slice(end)}`
    setDraft(next)
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.selectionStart = start + before.length
      textarea.selectionEnd = start + before.length + selected.length
    })
  }

  if (!open) return null

  return (
    <Dialog
      open={open}
      onClose={onClose}
      bare
      ariaLabel="编辑文本"
      overlayClassName="text-editor"
      panelClassName="text-editor__panel"
    >
      <header className="text-editor__head">
        <div className="text-editor__title">
          <Icon name="text" size={14} />
          <span>编辑文本</span>
          <span className="text-editor__subtitle">{title}</span>
        </div>
        <Button
          type="button"
          className="icon-btn"
          title="关闭"
          onClick={onClose}
          unstyled
        >
          <Icon name="close" size={14} />
        </Button>
      </header>

      <div className="text-editor__toolbar">
        {view === 'edit' ? (
          TOOLBAR.map((item) => (
            <Button
              key={item.label}
              type="button"
              className="text-editor__tool"
              onClick={() => insert(item.before, item.after ?? '')}
              unstyled
            >
              {item.label}
            </Button>
          ))
        ) : (
          <span className="text-editor__preview-label">Markdown 预览</span>
        )}
        <Button
          type="button"
          className="text-editor__mode"
          onClick={() =>
            setView((current) => (current === 'edit' ? 'preview' : 'edit'))
          }
          unstyled
        >
          {view === 'edit' ? '预览' : 'Markdown'}
        </Button>
        <span className="text-editor__hint">
          支持 Markdown · Ctrl+Enter 保存
        </span>
      </div>

      <div className="text-editor__body">
        {view === 'edit' ? (
          <Textarea
            ref={textareaRef}
            className="text-editor__input"
            value={draft}
            spellCheck={false}
            placeholder="在这里输入文本，支持 Markdown…"
            onChange={(event) => setDraft(event.target.value)}
            unstyled
          />
        ) : (
          <div className="text-editor__preview">
            <div
              className="cnode__text cnode__text--markdown"
              dangerouslySetInnerHTML={{ __html: preview }}
            />
          </div>
        )}
      </div>

      <footer className="text-editor__footer">
        <span className="text-editor__count">{draft.length} 字</span>
        <Button
          type="button"
          className="btn-secondary btn-sm"
          onClick={onClose}
          unstyled
        >
          取消
        </Button>
        <Button
          type="button"
          className="btn-primary btn-sm"
          onClick={() => onSave(draft)}
          unstyled
        >
          保存
        </Button>
      </footer>
    </Dialog>
  )
}
