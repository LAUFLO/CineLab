import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react'
import { Icon } from '../../components/Icon'
import {
  Button,
  DIALOG_SURFACE,
  Dialog,
  IconButton
} from '../../components/ui'
import type { WysiwygMarkdownEditorHandle } from './WysiwygMarkdownEditor'

const WysiwygMarkdownEditor = lazy(async () => {
  const module = await import('./WysiwygMarkdownEditor')
  return { default: module.WysiwygMarkdownEditor }
})

interface TextEditorDialogProps {
  open: boolean
  title: string
  initialText: string
  onClose: () => void
  onSave: (text: string) => void
}

export function TextEditorDialog({
  open,
  title,
  initialText,
  onClose,
  onSave
}: TextEditorDialogProps) {
  const [draft, setDraft] = useState(initialText)
  const editorRef = useRef<WysiwygMarkdownEditorHandle>(null)
  const saveRef = useRef<() => void>(() => undefined)

  const save = useCallback((): void => {
    let text = draft
    try {
      text = editorRef.current?.getMarkdown() ?? draft
    } catch {
      // 序列化失败时退回最后一次监听值，避免无法保存
    }
    onSave(text)
  }, [draft, onSave])
  saveRef.current = save

  useEffect(() => {
    if (!open) return
    setDraft(initialText)
  }, [open, initialText])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault()
        saveRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  if (!open) return null

  return (
    <Dialog
      open={open}
      onClose={onClose}
      bare
      ariaLabel="编辑文本"
      overlayClassName="fixed inset-0 z-[950] flex items-center justify-center bg-overlay p-6"
      panelClassName={`flex h-[min(720px,calc(100vh_-_48px))] w-[min(860px,calc(100vw_-_48px))] flex-col overflow-hidden ${DIALOG_SURFACE}`}
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

      <div className="flex shrink-0 items-center gap-2 border-b border-divider px-4 py-2 text-[11px] text-fg-subtle">
        <span className="shrink-0">支持 Markdown</span>
        <span className="min-w-0 truncate">
          {'输入 # 标题、- 列表、> 引用、**粗体**、``` 代码、|3x3| 空格 表格'}
        </span>
        <span className="ml-auto shrink-0">Ctrl+Enter 保存</span>
      </div>

      <div className="min-h-0 flex-1">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-xs text-fg-subtle">
              加载编辑器…
            </div>
          }
        >
          <WysiwygMarkdownEditor
            ref={editorRef}
            initialMarkdown={initialText}
            onChange={setDraft}
          />
        </Suspense>
      </div>

      <footer className="flex h-[52px] shrink-0 items-center justify-end gap-2 border-t border-divider px-4">
        <span className="mr-auto text-[11px] text-fg-subtle">
          {draft.length} 字
        </span>
        <Button variant="secondary" size="sm" onClick={onClose}>
          取消
        </Button>
        <Button variant="primary" size="sm" onClick={save}>
          保存
        </Button>
      </footer>
    </Dialog>
  )
}
