import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type MouseEvent,
  type RefObject
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
  IconButton,
  Input,
  Popover,
  Select,
  Textarea
} from '../components/ui'
import { styleCoverUrl } from '../lib/style-url'
import { useLibraryStore } from '../stores/library'
import { useUIStore } from '../stores/ui'

interface StyleLibraryDialogProps {
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  avoidRef?: RefObject<HTMLElement | null>
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
  anchorRef,
  avoidRef,
  onClose,
  onSelect
}: StyleLibraryDialogProps) {
  const styles = useLibraryStore((state) => state.styles)
  const error = useLibraryStore((state) => state.error)
  const loadStyles = useLibraryStore((state) => state.loadStyles)
  const saveStyle = useLibraryStore((state) => state.saveStyle)
  const deleteStyle = useLibraryStore((state) => state.deleteStyle)
  const pickStyleCover = useLibraryStore((state) => state.pickStyleCover)
  const requestConfirm = useUIStore((state) => state.requestConfirm)

  const [category, setCategory] = useState<string>('全部')
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'list' | 'form'>('list')
  const [editing, setEditing] = useState<StyleCard | null>(null)
  const [form, setForm] = useState<StyleForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setView('list')
    setEditing(null)
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

  const remove = (style: StyleCard): void => {
    requestConfirm({
      title: '删除自定义风格',
      message: `确定删除「${style.name}」吗？`,
      confirmLabel: '删除',
      danger: true,
      onConfirm: () => void deleteStyle(style.id)
    })
  }

  const choose = (style: StyleCard): void => {
    onSelect(style)
    onClose()
  }

  return (
    <Popover
      open={open}
      onClose={onClose}
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
      ariaLabel="风格库"
      className="overflow-hidden"
    >
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center gap-2 px-3 py-2">
          <div className="shrink-0 whitespace-nowrap text-sm font-medium text-fg">
            {view === 'list' ? '风格库' : editing ? '编辑风格' : '新建风格'}
          </div>
          <div className="flex-1" />
          {view === 'list' ? (
            <>
              <div className="w-[200px] shrink-0">
                <Input
                  value={query}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setQuery(event.target.value)
                  }
                  placeholder="搜索风格或提示词"
                  className="!h-7"
                  aria-label="搜索风格"
                />
              </div>
              <Button
                size="sm"
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
            size="sm"
            className="shrink-0"
            onClick={onClose}
          >
            <Icon name="close" size={15} />
          </IconButton>
        </div>

        {view === 'list' ? (
          <>
            <div className="flex shrink-0 flex-wrap gap-1.5 px-3 pb-1 pt-0.5">
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

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {filtered.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-fg-muted">
                  {styles.length === 0 ? '风格库加载中…' : '没有匹配的风格'}
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {filtered.map((style) => (
                    <div key={style.id} className="group relative">
                      <Button
                        unstyled
                        onClick={() => choose(style)}
                        className="block w-full text-left"
                        title={style.name}
                      >
                        <div className="relative">
                          <img
                            src={styleCoverUrl(style)}
                            alt={style.name}
                            className="aspect-square w-full rounded-md object-cover transition-opacity hover:opacity-90"
                            loading="lazy"
                          />
                          {style.source === 'user' ? (
                            <span className="absolute left-1 top-1 rounded-full bg-surface/85 px-1.5 py-0.5 text-[9px] text-fg-muted">
                              自定义
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
                        <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          <IconButton
                            label="编辑风格"
                            size="sm"
                            className="bg-surface/90"
                            onClick={(event: MouseEvent<HTMLButtonElement>) => {
                              event.stopPropagation()
                              startEdit(style)
                            }}
                          >
                            <Icon name="edit" size={13} />
                          </IconButton>
                          <IconButton
                            label="删除风格"
                            size="sm"
                            className="bg-surface/90"
                            onClick={(event: MouseEvent<HTMLButtonElement>) => {
                              event.stopPropagation()
                              remove(style)
                            }}
                          >
                            <Icon name="trash" size={13} />
                          </IconButton>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)]">
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
                    rows={5}
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
      </div>
    </Popover>
  )
}
