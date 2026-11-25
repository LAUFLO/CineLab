import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from 'react'
import {
  defaultValueCtx,
  Editor,
  editorViewCtx,
  rootCtx,
  serializerCtx
} from '@milkdown/core'
import { history } from '@milkdown/plugin-history'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { Textarea } from '../../components/ui'
import { MARKDOWN_CONTENT_CLASS } from './text-markdown'

interface WysiwygMarkdownEditorProps {
  initialMarkdown: string
  onChange: (markdown: string) => void
}

export interface WysiwygMarkdownEditorHandle {
  /** 同步读取编辑器当前 Markdown，避开 listener 的 200ms 防抖。 */
  getMarkdown: () => string
}

const FALLBACK_CLASS =
  'h-full w-full !min-h-0 !resize-none !rounded-none !border-0 bg-surface !p-4 font-mono !text-[13px] leading-[1.75] text-fg outline-none'

export const WysiwygMarkdownEditor = forwardRef<
  WysiwygMarkdownEditorHandle,
  WysiwygMarkdownEditorProps
>(function WysiwygMarkdownEditor({ initialMarkdown, onChange }, ref) {
  const rootRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Editor | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const initialMarkdownRef = useRef(initialMarkdown)
  initialMarkdownRef.current = initialMarkdown
  const dirtyRef = useRef(false)
  const [empty, setEmpty] = useState(!initialMarkdown.trim())
  const [failed, setFailed] = useState(false)
  const [fallback, setFallback] = useState(initialMarkdown)
  const fallbackRef = useRef(fallback)
  fallbackRef.current = fallback

  useEffect(() => {
    dirtyRef.current = false
    setFallback(initialMarkdown)
  }, [initialMarkdown])

  useImperativeHandle(ref, () => ({
    getMarkdown: () => {
      if (!dirtyRef.current) return initialMarkdownRef.current
      const editor = editorRef.current
      if (!editor) return fallbackRef.current
      return editor.action((ctx) => {
        const view = ctx.get(editorViewCtx)
        const serializer = ctx.get(serializerCtx)
        return serializer(view.state.doc)
      })
    }
  }))

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    let disposed = false
    let instance: Editor | null = null
    const markDirty = (): void => {
      dirtyRef.current = true
    }
    const hidePlaceholder = (): void => {
      dirtyRef.current = true
      setEmpty(false)
    }
    const preventLinkNavigation = (event: MouseEvent): void => {
      const target = event.target
      if (target instanceof Element && target.closest('a')) {
        event.preventDefault()
      }
    }
    root.addEventListener('keydown', markDirty)
    root.addEventListener('beforeinput', hidePlaceholder)
    root.addEventListener('paste', hidePlaceholder)
    root.addEventListener('drop', hidePlaceholder)
    root.addEventListener('compositionstart', hidePlaceholder)
    root.addEventListener('click', preventLinkNavigation, true)

    const start = async (): Promise<void> => {
      try {
        const created = await Editor.make()
          .config((ctx) => {
            ctx.set(rootCtx, root)
            ctx.set(defaultValueCtx, initialMarkdown)
            ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
              if (disposed) return
              dirtyRef.current = true
              setEmpty(!markdown.trim())
              onChangeRef.current(markdown)
            })
          })
          .use(commonmark)
          .use(gfm)
          .use(history)
          .use(listener)
          .create()

        if (disposed) {
          void created.destroy()
          return
        }

        editorRef.current = created
        instance = created
        created.action((ctx) => {
          ctx.get(editorViewCtx).focus()
        })
      } catch (error) {
        if (disposed) return
        console.error('Markdown editor failed to initialize', error)
        setFailed(true)
      }
    }

    void start()

    return () => {
      disposed = true
      root.removeEventListener('keydown', markDirty)
      root.removeEventListener('beforeinput', hidePlaceholder)
      root.removeEventListener('paste', hidePlaceholder)
      root.removeEventListener('drop', hidePlaceholder)
      root.removeEventListener('compositionstart', hidePlaceholder)
      root.removeEventListener('click', preventLinkNavigation, true)
      editorRef.current = null
      if (instance) void instance.destroy()
    }
  }, [initialMarkdown])

  if (failed) {
    return (
      <div className="h-full p-4">
        <Textarea
          className={FALLBACK_CLASS}
          value={fallback}
          spellCheck={false}
          placeholder="在这里输入文本，支持 Markdown…"
          onChange={(event) => {
            dirtyRef.current = true
            setFallback(event.target.value)
            onChangeRef.current(event.target.value)
          }}
        />
      </div>
    )
  }

  return (
    <div className="relative flex h-full flex-col overflow-auto px-6 py-5 text-fg [&_.ProseMirror]:min-h-full [&_.ProseMirror]:outline-none [&_.ProseMirror_.selectedCell]:bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] [&_.ProseMirror_.tableWrapper]:overflow-x-auto">
      <div ref={rootRef} className={`${MARKDOWN_CONTENT_CLASS} min-h-full flex-1`} />
      {empty ? (
        <div className="pointer-events-none absolute top-5 left-6 text-[13px] text-fg-subtle">
          在这里输入文本，支持 Markdown…
        </div>
      ) : null}
    </div>
  )
})

