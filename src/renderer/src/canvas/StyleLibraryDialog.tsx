import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent
} from 'react'
import {
  STYLE_CATEGORIES,
  type StyleCard,
  type StyleCategory,
  type StyleSaveInput
} from '@shared/style-schema'
import { Icon } from '../components/Icon'
import {
  Button,
  Dialog,
  IconButton,
  Input,
  Popover,
  Select,
  Textarea
} from '../components/ui'
import { styleCoverUrl } from '../lib/style-url'
import { useLibraryStore } from '../stores/library'

interface StyleLibraryDialogProps {
  open: boolean
  onClose: () => void
  onSelect: (style: StyleCard) => void
}

interface CoverDraft {
  path: string
  dataUrl: string
}

interface StyleForm {
  name: string
  category: StyleCategory
  prompt: string
  cover: CoverDraft | null
}

const EMPTY_FORM: StyleForm = {
  name: '',
  category: STYLE_CATEGORIES[0],
  prompt: '',
  cover: null
}

const CATEGORY_OPTIONS = STYLE_CATEGORIES.map((category) => ({
  value: category,
  label: category
}))

export function StyleLibraryDialog({
  open,
  onClose,
  onSelect
}: StyleLibraryDialogProps) {
  const styles = useLibraryStore((state) => state.styles)
  const error = useLibraryStore((state) => state.error)
  const loadStyles = useLibraryStore((state) => state.loadStyles)
  const saveStyle = useLibraryStore((state) => state.saveStyle)
  const deleteStyle = useLibraryStore((state) => state.deleteStyle)
  const pickStyleCover = useLibraryStore((state) => state.pickStyleCover)

  const [category, setCategory] = useState<string>('全部')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hover, setHover] = useState<StyleCard | null>(null)
  const [view, setView] = useState<'list' | 'form'>('list')
  const [editing, setEditing] = useState<StyleCard | null>(null)
  const [form, setForm] = useState<StyleForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const hoverAnchor = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    setView('list')
    setEditing(null)
    setSelectedId(null)
    setHover(null)
    void loadStyles()
  }, [open, loadStyles])

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return styles.filter((style) => {
      if (category !== '全部' && style.category !== category) return false
      if (!keyword) return true
      return (
        style.name.toLowerCase().includes(keyword) ||
        style.prompt.toLowerCase().includes(keyword) ||
        style.category.toLowerCase().includes(keyword)
      )
    })
  }, [styles, category, query])

  const selected = styles.find((style) => style.id === selectedId) ?? null

  const startCreate = (): void => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setView('form')
  }

  const startEdit = (style: StyleCard): void => {
    setEditing(style)
    setForm({
      name: style.name,
      category: style.category as StyleCategory,
      prompt: style.prompt,
      cover: null
    })
    setView('form')
  }

  const chooseCover = async (): Promise<void> => {
    const picked = await pickStyleCover()
    if (!picked) return
    setForm((current) => ({ ...current, cover: picked }))
  }

  const submit = async (): Promise<void> => {
    if (saving) return
    setSaving(true)

    const input: StyleSaveInput = {
      id: editing?.id,
      name: form.name,
      category: form.category,
      prompt: form.prompt,
      coverSourcePath: form.cover?.path
    }

    const ok = await saveStyle(input)
    setSaving(false)
    if (ok) {
      setView('list')
      setEditing(null)
    }
  }

  const remove = async (style: StyleCard): Promise<void> => {
    if (!window.confirm(`删除自定义风格「${style.name}」？`)) return
    await deleteStyle(style.id)
    if (selectedId === style.id) setSelectedId(null)
  }

  const choose = (): void => {
    if (!selected) return
    onSelect(selected)
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      bare
      ariaLabel="风格库"
      overlayClassName="fixed inset-0 z-[900] flex items-center justify-center bg-overlay p-4"
      panelClassName="flex h-[min(640px,calc(100vh_-_64px))] w-[min(980px,calc(100vw_-_48px))] flex-col overflow-hidden rounded-panel border border-border bg-surface-raised text-fg shadow-float"
    >
      <div className="flex shrink-0 items-center gap-2 px-4 pb-1 pt-3">
        <div className="shrink-0 whitespace-nowrap text-sm font-medium text-fg">
          {view === 'list' ? '风格库' : editing ? '编辑风格' : '新建风格'}
        </div>
        <div className="flex-1" />
        {view === 'list' ? (
          <>
            <div className="w-[240px] shrink-0">
              <Input
                value={query}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setQuery(event.target.value)
                }
                placeholder="搜索风格或提示词"
                className="h-8"
                aria-label="搜索风格"
              />
            </div>
            <Button
              size="xs"
              variant="secondary"
              className="shrink-0 whitespace-nowrap"
              onClick={startCreate}
            >
              <Icon name="plus" size={12} />
              新建
            </Button>
          </>
        ) : null}
        <IconButton
          label="关闭"
          title=""
          size="sm"
          className="shrink-0"
          onClick={onClose}
        >
          <Icon name="close" size={15} />
        </IconButton>
      </div>

      {view === 'list' ? (
        <>
          <div className="flex shrink-0 flex-wrap gap-1.5 px-4 pb-2 pt-1">
            {['全部', ...STYLE_CATEGORIES].map((item) => (
              <Button
                key={item}
                size="xs"
                variant={category === item ? 'primary' : 'ghost'}
                onClick={() => setCategory(item)}
              >
                {item}
              </Button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {filtered.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-fg-muted">
                {styles.length === 0 ? '风格库加载中…' : '没有匹配的风格'}
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
                {filtered.map((style) => (
                  <div key={style.id} className="group relative">
                    <Button
                      unstyled
                      onClick={() => setSelectedId(style.id)}
                      onDoubleClick={() => {
                        setSelectedId(style.id)
                        onSelect(style)
                        onClose()
                      }}
                      onMouseEnter={(event: MouseEvent<HTMLButtonElement>) => {
                        hoverAnchor.current = event.currentTarget
                        setHover(style)
                      }}
                      onMouseLeave={() => setHover(null)}
                      className={`block w-full text-left transition-opacity ${
                        selectedId === style.id ? '' : 'hover:opacity-90'
                      }`}
                    >
                      <div className="relative">
                        <img
                          src={styleCoverUrl(style)}
                          alt={style.name}
                          className={`aspect-square w-full rounded-md object-cover ${
                            selectedId === style.id ? 'ring-1 ring-accent' : ''
                          }`}
                          loading="lazy"
                        />
                        {style.source === 'user' ? (
                          <span className="absolute left-1 top-1 rounded-full bg-surface/85 px-1.5 py-0.5 text-[9px] text-fg-muted">
                            自定义
                          </span>
                        ) : null}
                        {selectedId === style.id ? (
                          <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] text-accent-text">
                            ✓
                          </span>
                        ) : null}
                      </div>
                      <div className="flex justify-center px-1 py-1">
                        <span className="truncate text-center text-[11px] text-fg">
                          {style.name}
                        </span>
                      </div>
                    </Button>

                    {style.source === 'user' ? (
                      <div className="absolute bottom-7 right-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <IconButton
                          label="编辑风格"
                          title=""
                          size="xs"
                          className="h-6 w-6 bg-surface/90"
                          onClick={() => startEdit(style)}
                        >
                          <Icon name="edit" size={11} />
                        </IconButton>
                        <IconButton
                          label="删除风格"
                          title=""
                          size="xs"
                          className="h-6 w-6 bg-surface/90"
                          onClick={() => void remove(style)}
                        >
                          <Icon name="trash" size={11} />
                        </IconButton>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-3 px-4 py-2.5">
            <span className="min-w-0 truncate text-xs text-fg-muted">
              {selected
                ? `已选择：${selected.name}，生成时自动拼接到提示词前面`
                : '选择一个风格，生成时自动拼接到提示词前面'}
            </span>
            <div className="flex-1" />
            <Button size="sm" onClick={onClose}>
              取消
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={!selected}
              onClick={choose}
            >
              使用这个风格
            </Button>
          </div>
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
            <div>
              <div className="mb-1.5 text-xs text-fg-muted">封面</div>
              <Button
                unstyled
                onClick={() => void chooseCover()}
                className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-card border border-dashed border-border bg-surface text-fg-muted hover:border-border-strong"
              >
                {form.cover ? (
                  <img
                    src={form.cover.dataUrl}
                    alt="风格封面预览"
                    className="h-full w-full object-cover"
                  />
                ) : editing ? (
                  <img
                    src={styleCoverUrl(editing)}
                    alt={editing.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex flex-col items-center gap-1.5 text-xs">
                    <Icon name="image" size={20} />
                    选择图片
                  </span>
                )}
              </Button>
              <div className="mt-1 text-[11px] text-fg-muted">
                1:1 图片，仅用于展示，不参与生成
              </div>
            </div>

            <div className="space-y-3">
              <label className="block">
                <div className="mb-1.5 text-xs text-fg-muted">名称</div>
                <Input
                  value={form.name}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value
                    }))
                  }
                  placeholder="例如：赛博朋克"
                  maxLength={30}
                />
              </label>

              <label className="block">
                <div className="mb-1.5 text-xs text-fg-muted">分类</div>
                <Select
                  value={form.category}
                  options={CATEGORY_OPTIONS}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      category: value as StyleCategory
                    }))
                  }
                  menuWidth="trigger"
                />
              </label>

              <label className="block">
                <div className="mb-1.5 text-xs text-fg-muted">
                  风格提示词
                  <span className="ml-2 text-fg-muted">
                    只写画风，不写具体主体
                  </span>
                </div>
                <Textarea
                  value={form.prompt}
                  onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                    setForm((current) => ({
                      ...current,
                      prompt: event.target.value
                    }))
                  }
                  rows={6}
                  maxLength={300}
                  placeholder="例如：霓虹雨夜，湿地面强反射，青蓝与品红主色，体积雾，高对比。"
                />
              </label>

              {error ? (
                <div className="rounded-card border border-danger/40 px-3 py-2 text-xs text-danger">
                  {error}
                </div>
              ) : null}

              <div className="flex justify-end gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={() => {
                    setView('list')
                    setEditing(null)
                  }}
                >
                  返回
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={saving}
                  onClick={() => void submit()}
                >
                  {saving ? '保存中…' : '保存'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Popover
        open={Boolean(hover)}
        onClose={() => setHover(null)}
        anchorRef={hoverAnchor}
        width={320}
        className="p-3"
        ariaLabel="风格提示词预览"
      >
        {hover ? (
          <>
            <div className="text-xs font-medium text-fg">{hover.name}</div>
            <div className="mt-1 text-[11px] text-fg-muted">
              {hover.category} · {hover.source === 'official' ? '官方' : '自定义'}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-fg-muted">
              {hover.prompt}
            </p>
          </>
        ) : null}
      </Popover>
    </Dialog>
  )
}
