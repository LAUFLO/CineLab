import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import { renderMarkdown, MARKDOWN_CLASS } from './text-markdown'
import { Button, Dialog, IconButton, Textarea } from '../../components/ui'

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
      overlayClassName="fixed inset-0 z-[950] flex items-center justify-center bg-[color-mix(in_srgb,var(--canvas-bg)_72%,transparent)] p-6"
      panelClassName="flex h-[min(720px,calc(100vh_-_48px))] w-[min(860px,calc(100vw_-_48px))] flex-col overflow-hidden rounded-[14px] border border-border bg-surface shadow-float"
    >
      <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-divider pl-[18px] pr-[14px]">
        <div className="flex min-w-0 items-center gap-[7px] text-[13px] text-fg">
          <Icon name="text" size={14} />
          <span>编辑文本</span>
          <span className="max-w-[360px] truncate text-xs text-fg-subtle">
            {title}
          </span>
        </div>
        <IconButton label="关闭" className="ml-auto" onClick={onClose}>
          <Icon name="close" size={14} />
        </IconButton>
      </header>

      <div className="flex shrink-0 items-center gap-1.5 border-b border-divider px-4 py-2">
        {view === 'edit' ? (
          TOOLBAR.map((item) => (
            <Button
              key={item.label}
              type="button"
              variant="ghost"
              size="none"
              className="h-[26px] !rounded-[6px] bg-surface-hover px-2.5 text-[11px] text-fg-muted hover:text-fg"
              onClick={() => insert(item.before, item.after ?? '')}
            >
              {item.label}
            </Button>
          ))
        ) : (
          <span className="text-[11px] text-fg-subtle">Markdown 预览</span>
        )}
        <Button
          type="button"
          variant="secondary"
          size="none"
          className="ml-auto h-[26px] !rounded-[6px] px-3 text-[11px]"
          onClick={() =>
            setView((current) => (current === 'edit' ? 'preview' : 'edit'))
          }
        >
          {view === 'edit' ? '预览' : 'Markdown'}
        </Button>
        <span className="ml-3 text-[11px] text-fg-subtle">
          支持 Markdown · Ctrl+Enter 保存
        </span>
      </div>

      <div className="min-h-0 flex-1">
        {view === 'edit' ? (
          <Textarea
            ref={textareaRef}
            className="h-full w-full !min-h-0 !resize-none !rounded-none !border-0 bg-surface !p-4 font-mono !text-[13px] leading-[1.75] text-fg outline-none [&::-webkit-scrollbar]:h-[7px] [&::-webkit-scrollbar]:w-[7px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-pill [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-transparent [&::-webkit-scrollbar-thumb]:bg-[color-mix(in_srgb,var(--text-3)_52%,transparent)] [&::-webkit-scrollbar-thumb]:bg-clip-padding [&::-webkit-scrollbar-thumb:hover]:bg-[color-mix(in_srgb,var(--text-3)_72%,transparent)]"
            value={draft}
            spellCheck={false}
            placeholder="在这里输入文本，支持 Markdown…"
            onChange={(event) => setDraft(event.target.value)}
          />
        ) : (
          <div className="h-full overflow-y-auto px-6 py-5 [&::-webkit-scrollbar]:h-[7px] [&::-webkit-scrollbar]:w-[7px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-pill [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-transparent [&::-webkit-scrollbar-thumb]:bg-[color-mix(in_srgb,var(--text-3)_52%,transparent)] [&::-webkit-scrollbar-thumb]:bg-clip-padding [&::-webkit-scrollbar-thumb:hover]:bg-[color-mix(in_srgb,var(--text-3)_72%,transparent)]">
            <div
              className={`${MARKDOWN_CLASS} !static !inset-auto !overflow-visible !p-0`}
              dangerouslySetInnerHTML={{ __html: preview }}
            />
          </div>
        )}
      </div>

      <footer className="flex h-[52px] shrink-0 items-center justify-end gap-2 border-t border-divider px-4">
        <span className="mr-auto text-[11px] text-fg-subtle">
          {draft.length} 字
        </span>
        <Button variant="secondary" size="sm" onClick={onClose}>
          取消
        </Button>
        <Button variant="primary" size="sm" onClick={() => onSave(draft)}>
          保存
        </Button>
      </footer>
    </Dialog>
  )
}
