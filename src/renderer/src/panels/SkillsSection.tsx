import { useEffect, useMemo, useState } from 'react'
import type {
  SkillAdminEntry,
  SkillFileContent,
  SkillFileEntry,
  SkillScope
} from '@shared/skills'
import { Icon } from '../components/Icon'
import { useProjectStore } from '../stores/project'
import { useUIStore } from '../stores/ui'
import { Button, NativeSelect, Input, Textarea } from '../components/ui'

const SCOPE_LABEL: Record<SkillScope, string> = {
  builtin: '内置',
  global: '全局',
  project: '项目'
}

const SCOPES: SkillScope[] = ['builtin', 'global', 'project']

function entryKey(entry: Pick<SkillAdminEntry, 'scope' | 'name'>): string {
  return `${entry.scope}:${entry.name}`
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function fileIcon(path: string): 'image' | 'video' | 'audio' | 'text' {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return 'image'
  if (['mp4', 'webm', 'mov'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'm4a'].includes(ext)) return 'audio'
  return 'text'
}

interface SkillDraft {
  scope: 'global' | 'project'
  name: string
  description: string
  version: string
  body: string
}

function emptyDraft(): SkillDraft {
  return {
    scope: 'global',
    name: '',
    description: '',
    version: '',
    body: '# 新技能\n\n## 使用场景\n\n'
  }
}

export function SkillsSection() {
  const projectPath = useProjectStore((state) => state.path)
  const requestConfirm = useUIStore((state) => state.requestConfirm)
  const showToast = useUIStore((state) => state.showToast)
  const [skills, setSkills] = useState<SkillAdminEntry[]>([])
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [body, setBody] = useState('')
  const [description, setDescription] = useState('')
  const [version, setVersion] = useState('')
  const [files, setFiles] = useState<SkillFileEntry[]>([])
  const [preview, setPreview] = useState<SkillFileContent | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [cloning, setCloning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState<SkillDraft>(emptyDraft)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const selected = useMemo(
    () => skills.find((entry) => entryKey(entry) === selectedKey) ?? null,
    [skills, selectedKey]
  )
  const grouped = useMemo(
    () =>
      SCOPES.map((scope) => ({
        scope,
        entries: skills.filter((entry) => entry.scope === scope)
      })).filter((group) => group.entries.length > 0),
    [skills]
  )

  const refresh = async (
    select?: { scope: SkillScope; name: string } | null
  ): Promise<void> => {
    try {
      const list = await window.api.skills.list()
      setSkills(list)
      setError(null)
      const target = select
        ? list.find(
            (entry) =>
              entry.scope === select.scope && entry.name === select.name
          )
        : null
      if (target) {
        setSelectedKey(entryKey(target))
      } else if (
        !selectedKey ||
        !list.some((entry) => entryKey(entry) === selectedKey)
      ) {
        const first = list[0]
        setSelectedKey(first ? entryKey(first) : null)
      }
    } catch (refreshError) {
      setError(
        refreshError instanceof Error ? refreshError.message : '读取技能失败'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!selected) {
      setBody('')
      setFiles([])
      setPreview(null)
      return
    }
    let cancelled = false
    setConfirmRemove(false)
    setError(null)
    setDescription(selected.description)
    setVersion(selected.version ?? '')
    setPreview(null)
    void Promise.all([
      window.api.skills.readFile(selected.scope, selected.name, 'SKILL.md'),
      window.api.skills.files(selected.scope, selected.name)
    ])
      .then(([skillFile, fileList]) => {
        if (cancelled) return
        setBody(skillFile.content ?? '')
        setFiles(fileList)
      })
      .catch((loadError: unknown) => {
        if (cancelled) return
        setError(
          loadError instanceof Error ? loadError.message : '读取技能失败'
        )
      })
    return () => {
      cancelled = true
    }
  }, [selected])

  const updateEntry = (entry: SkillAdminEntry): void => {
    setSkills((current) =>
      current.map((item) => (entryKey(item) === entryKey(entry) ? entry : item))
    )
  }

  const save = async (): Promise<void> => {
    if (!selected || !selected.editable) return
    setSaving(true)
    setError(null)
    try {
      const saved = await window.api.skills.save({
        scope: selected.scope as 'global' | 'project',
        name: selected.name,
        description,
        ...(version.trim() ? { version: version.trim() } : {}),
        body
      })
      updateEntry(saved)
      setPreview(null)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const create = async (): Promise<void> => {
    if (draft.scope === 'project' && !projectPath) {
      setError('请先打开项目，再创建项目技能')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const created = await window.api.skills.create({
        scope: draft.scope,
        name: draft.name.trim(),
        description: draft.description.trim(),
        ...(draft.version.trim() ? { version: draft.version.trim() } : {}),
        body: draft.body
      })
      setCreating(false)
      setDraft(emptyDraft())
      await refresh({ scope: created.scope, name: created.name })
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '创建失败')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (): Promise<void> => {
    if (!selected || !selected.editable) return
    if (!confirmRemove) {
      setConfirmRemove(true)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await window.api.skills.remove(selected.scope, selected.name)
      setConfirmRemove(false)
      setSelectedKey(null)
      await refresh()
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : '删除失败')
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (
    entry: SkillAdminEntry,
    patch: { enabled?: boolean; disableModelInvocation?: boolean }
  ): Promise<void> => {
    setError(null)
    try {
      const updated = await window.api.skills.setOverride({
        scope: entry.scope,
        name: entry.name,
        ...patch
      })
      updateEntry(updated)
    } catch (toggleError) {
      setError(
        toggleError instanceof Error ? toggleError.message : '更新状态失败'
      )
    }
  }

  const upload = async (folder: 'references' | 'assets'): Promise<void> => {
    if (!selected || !selected.editable || uploading) return
    setUploading(true)
    setError(null)
    try {
      const result = await window.api.skills.uploadFiles(
        selected.scope,
        selected.name,
        folder
      )
      if (!result) return
      setFiles(result.files)
      setPreview(null)
      const overwritten = result.overwritten.length
      showToast(
        `已上传 ${result.uploaded.length} 个文件${
          overwritten > 0 ? `，覆盖 ${overwritten} 个` : ''
        }`
      )
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : '上传文件失败'
      )
    } finally {
      setUploading(false)
    }
  }

  const removeFile = (file: SkillFileEntry): void => {
    if (!selected || !selected.editable) return
    requestConfirm({
      title: '删除技能文件',
      message: `确定删除「${file.path}」？此操作无法撤销。`,
      confirmLabel: '删除',
      onConfirm: async () => {
        setError(null)
        try {
          const next = await window.api.skills.removeFile(
            selected.scope,
            selected.name,
            file.path
          )
          setFiles(next)
          if (preview?.path === file.path) setPreview(null)
        } catch (removeError) {
          setError(
            removeError instanceof Error ? removeError.message : '删除文件失败'
          )
        }
      }
    })
  }

  const cloneTo = async (targetScope: 'global' | 'project'): Promise<void> => {
    if (!selected || cloning) return
    if (targetScope === 'project' && !projectPath) {
      setError('请先打开项目，再创建项目覆盖')
      return
    }
    setCloning(true)
    setError(null)
    try {
      const created = await window.api.skills.clone({
        sourceScope: selected.scope,
        sourceName: selected.name,
        targetScope
      })
      await refresh({ scope: created.scope, name: created.name })
      showToast(`已创建${SCOPE_LABEL[targetScope]}覆盖：${created.name}`)
    } catch (cloneError) {
      setError(
        cloneError instanceof Error ? cloneError.message : '创建覆盖失败'
      )
    } finally {
      setCloning(false)
    }
  }

  const openFile = async (file: SkillFileEntry): Promise<void> => {
    if (!selected) return
    setError(null)
    try {
      const content = await window.api.skills.readFile(
        selected.scope,
        selected.name,
        file.path
      )
      setPreview(content)
      if (content.binary) {
        await window.api.skills.openFile(
          selected.scope,
          selected.name,
          file.path
        )
      }
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : '读取文件失败')
    }
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[15px] font-semibold">技能</div>
          <div className="mt-1 max-w-[560px] text-[11px] leading-[1.6] text-fg-subtle">
            内置技能随应用提供；全局技能在本机所有项目可用；项目技能只属于当前项目。
          </div>
        </div>
        <Button
          type="button"
          variant="primary"
          size="xs"
          className="inline-flex shrink-0 items-center gap-[5px]"
          onClick={() => {
            setCreating(true)
            setDraft(emptyDraft())
            setError(null)
          }}
        >
          <Icon name="plus" size={13} />
          新建技能
        </Button>
      </div>

      {error ? (
        <div className="break-all rounded-md bg-[rgba(239,68,68,0.08)] px-2.5 py-2 text-xs leading-[1.6] text-danger">
          {error}
        </div>
      ) : null}

      {creating ? (
        <div className="flex flex-col gap-2 rounded-card border border-border-strong bg-surface p-2.5">
          <div className="text-xs font-semibold">新建技能</div>
          <div className="grid grid-cols-[1fr_1.2fr_0.7fr] gap-2 max-[900px]:grid-cols-2">
            <label className="flex flex-col gap-1.5 [&>span]:mb-1 [&>span]:block [&>span]:text-[11px] [&>span]:text-fg-subtle">
              <span>作用域</span>
              <NativeSelect
                className="!h-auto w-full !rounded-md border-border bg-surface !px-2 !py-1.5 !text-[11px] text-fg focus:border-border-strong"
                value={draft.scope}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    scope: event.target.value as 'global' | 'project'
                  }))
                }
              >
                <option value="global">全局技能</option>
                <option value="project" disabled={!projectPath}>
                  项目技能{projectPath ? '' : '（未打开项目）'}
                </option>
              </NativeSelect>
            </label>
            <label className="flex flex-col gap-1.5 [&>span]:mb-1 [&>span]:block [&>span]:text-[11px] [&>span]:text-fg-subtle">
              <span>名称</span>
              <Input
                className="!h-auto w-full !rounded-md border-border bg-surface !px-2 !py-1.5 !text-[11px] text-fg focus:border-border-strong"
                value={draft.name}
                placeholder="例如 shot-lighting"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    name: event.target.value
                  }))
                }
              />
            </label>
            <label className="flex flex-col gap-1.5 [&>span]:mb-1 [&>span]:block [&>span]:text-[11px] [&>span]:text-fg-subtle">
              <span>版本</span>
              <Input
                className="!h-auto w-full !rounded-md border-border bg-surface !px-2 !py-1.5 !text-[11px] text-fg focus:border-border-strong"
                value={draft.version}
                placeholder="可选，例如 1.0"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    version: event.target.value
                  }))
                }
              />
            </label>
          </div>
          <label className="flex flex-col gap-1.5 [&>span]:mb-1 [&>span]:block [&>span]:text-[11px] [&>span]:text-fg-subtle">
            <span>描述</span>
            <Input
              className="!h-auto w-full !rounded-md border-border bg-surface !px-2 !py-1.5 !text-[11px] text-fg focus:border-border-strong"
              value={draft.description}
              placeholder="一句话说明这个技能做什么"
              maxLength={500}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  description: event.target.value
                }))
              }
            />
          </label>
          <label className="flex flex-col gap-1.5 [&>span]:mb-1 [&>span]:block [&>span]:text-[11px] [&>span]:text-fg-subtle">
            <span>SKILL.md 正文</span>
            <Textarea
              className="min-h-[120px] w-full resize-none !rounded-md border-border bg-surface !px-2 !py-1.5 !text-[11px] font-mono leading-[1.55] text-fg focus:border-border-strong"
              value={draft.body}
              rows={10}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  body: event.target.value
                }))
              }
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="xs"
              onClick={() => setCreating(false)}
              disabled={saving}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="primary"
              size="xs"
              onClick={() => void create()}
              disabled={
                saving || !draft.name.trim() || !draft.description.trim()
              }
            >
              {saving ? '创建中…' : '创建技能'}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid min-h-[460px] flex-1 grid-cols-[260px_minmax(0,1fr)] gap-2.5 max-[900px]:grid-cols-[210px_minmax(0,1fr)]">
        <aside className="min-h-0 min-w-0 overflow-y-auto rounded-card border border-border bg-surface p-2">
          {loading ? (
            <div className="p-3.5 text-[11px] leading-[1.6] text-fg-subtle">
              正在读取技能…
            </div>
          ) : grouped.length === 0 ? (
            <div className="p-3.5 text-[11px] leading-[1.6] text-fg-subtle">
              还没有技能
            </div>
          ) : (
            grouped.map((group) => (
              <div
                key={group.scope}
                className="[&:not(:first-child)]:mt-3"
              >
                <div className="flex items-center justify-between gap-2 px-1 pb-1.5 text-[10px] font-semibold text-fg-subtle">
                  <span>
                    {SCOPE_LABEL[group.scope]} · {group.entries.length}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="none"
                    className="p-0 text-[10px] text-fg-subtle underline hover:text-fg"
                    onClick={() =>
                      void window.api.skills.openDirectory(group.scope)
                    }
                  >
                    打开目录
                  </Button>
                </div>
                {group.entries.map((entry) => {
                  const key = entryKey(entry)
                  const active = key === selectedKey
                  return (
                    <Button
                      key={key}
                      type="button"
                      variant="ghost"
                      size="none"
                      className={`flex w-full flex-col !items-start gap-[3px] rounded-md border px-2 py-[7px] !text-left ${
                        active
                          ? 'border-border-strong bg-surface-hover'
                          : 'border-transparent bg-transparent hover:bg-surface-hover'
                      } ${entry.enabled ? '' : 'opacity-65'}`}
                      onClick={() => setSelectedKey(key)}
                    >
                      <div className="flex min-w-0 items-center gap-[5px]">
                        <span className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] text-fg">
                          {entry.name}
                        </span>
                        {!entry.enabled ? (
                          <span className="shrink-0 whitespace-nowrap rounded-full bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] px-1.5 py-px text-[9px] leading-[14px] text-warning">
                            已禁用
                          </span>
                        ) : null}
                        {entry.shadowedBy ? (
                          <span className="shrink-0 whitespace-nowrap rounded-full bg-[color-mix(in_srgb,var(--text-3)_14%,transparent)] px-1.5 py-px text-[9px] leading-[14px] text-fg-subtle">
                            被{SCOPE_LABEL[entry.shadowedBy]}覆盖
                          </span>
                        ) : null}
                      </div>
                      <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[10px] leading-[1.4] text-fg-subtle">
                        {entry.description}
                      </div>
                    </Button>
                  )
                })}
              </div>
            ))
          )}
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col gap-2.5 overflow-y-auto rounded-card border border-border bg-surface p-3">
          {!selected ? (
            <div className="p-3.5 text-[11px] leading-[1.6] text-fg-subtle">
              选择一个技能查看详情，或新建技能。
            </div>
          ) : (
            <>
              <header className="flex items-start justify-between gap-3 border-b border-border pb-2.5">
                <div className="min-w-0">
                  <div className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-sm font-semibold">
                    {selected.name}
                  </div>
                  <div className="mt-[5px] flex flex-wrap gap-1">
                    <span className="shrink-0 whitespace-nowrap rounded-full bg-surface-hover px-1.5 py-px text-[9px] leading-[14px] text-fg-muted">
                      {SCOPE_LABEL[selected.scope]}
                    </span>
                    {selected.editable ? null : (
                      <span className="shrink-0 whitespace-nowrap rounded-full bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] px-1.5 py-px text-[9px] leading-[14px] text-warning">
                        只读
                      </span>
                    )}
                    {selected.shadowedBy ? (
                      <span className="shrink-0 whitespace-nowrap rounded-full bg-[color-mix(in_srgb,var(--text-3)_14%,transparent)] px-1.5 py-px text-[9px] leading-[14px] text-fg-subtle">
                        被{SCOPE_LABEL[selected.shadowedBy]}同名技能覆盖
                      </span>
                    ) : null}
                    {selected.version ? (
                      <span className="shrink-0 whitespace-nowrap rounded-full bg-surface-hover px-1.5 py-px text-[9px] leading-[14px] text-fg-muted">
                        v{selected.version}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {selected.scope !== 'project' &&
                  !skills.some(
                    (entry) =>
                      entry.scope === 'project' && entry.name === selected.name
                  ) ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="xs"
                      className="inline-flex items-center gap-1"
                      onClick={() => void cloneTo('project')}
                      disabled={!projectPath || cloning}
                    >
                      <Icon name="copy" size={13} />
                      创建项目覆盖
                    </Button>
                  ) : null}
                  {selected.scope === 'builtin' &&
                  !skills.some(
                    (entry) =>
                      entry.scope === 'global' && entry.name === selected.name
                  ) ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="xs"
                      className="inline-flex items-center gap-1"
                      onClick={() => void cloneTo('global')}
                      disabled={cloning}
                    >
                      <Icon name="copy" size={13} />
                      创建全局覆盖
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="secondary"
                    size="xs"
                    className="inline-flex items-center gap-1"
                    onClick={() =>
                      void window.api.skills.openDirectory(
                        selected.scope,
                        selected.name
                      )
                    }
                  >
                    <Icon name="folder" size={13} />
                    打开目录
                  </Button>
                  {selected.editable ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="xs"
                      className={`inline-flex items-center gap-1 ${
                        confirmRemove
                          ? 'border-[color-mix(in_srgb,var(--danger)_50%,var(--border))] text-danger'
                          : ''
                      }`}
                      onClick={() => void remove()}
                      disabled={saving}
                    >
                      <Icon name="trash" size={13} />
                      {confirmRemove ? '确认删除' : '删除'}
                    </Button>
                  ) : null}
                </div>
              </header>

              <div className="flex flex-wrap gap-4 rounded-md border border-border bg-surface-raised px-2.5 py-2">
                <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-fg-muted">
                  <Input
                    type="checkbox"
                    className="!h-auto !w-auto !rounded-none !border-0 !bg-transparent !p-0 accent-[var(--accent)]"
                    checked={selected.enabled}
                    onChange={(event) =>
                      void toggle(selected, {
                        enabled: event.target.checked
                      })
                    }
                  />
                  <span>启用</span>
                </label>
                <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-fg-muted">
                  <Input
                    type="checkbox"
                    className="!h-auto !w-auto !rounded-none !border-0 !bg-transparent !p-0 accent-[var(--accent)]"
                    checked={Boolean(selected.disableModelInvocation)}
                    onChange={(event) =>
                      void toggle(selected, {
                        disableModelInvocation: event.target.checked
                      })
                    }
                  />
                  <span>禁止模型自动调用</span>
                </label>
              </div>

              <div className="flex flex-col gap-2">
                <label className="flex flex-col gap-1.5 [&>span]:mb-1 [&>span]:block [&>span]:text-[11px] [&>span]:text-fg-subtle">
                  <span>描述</span>
                  <Input
                    className="!h-auto w-full !rounded-md border-border bg-surface !px-2 !py-1.5 !text-[11px] text-fg focus:border-border-strong"
                    value={description}
                    disabled={!selected.editable}
                    maxLength={500}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1.5 [&>span]:mb-1 [&>span]:block [&>span]:text-[11px] [&>span]:text-fg-subtle">
                  <span>版本</span>
                  <Input
                    className="!h-auto w-full !rounded-md border-border bg-surface !px-2 !py-1.5 !text-[11px] text-fg focus:border-border-strong"
                    value={version}
                    disabled={!selected.editable}
                    onChange={(event) => setVersion(event.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1.5 [&>span]:mb-1 [&>span]:block [&>span]:text-[11px] [&>span]:text-fg-subtle">
                  <span>SKILL.md 正文</span>
                  <Textarea
                    className="min-h-[120px] w-full resize-none !rounded-md border-border bg-surface !px-2 !py-1.5 !text-[11px] font-mono leading-[1.55] text-fg focus:border-border-strong"
                    value={body}
                    disabled={!selected.editable}
                    rows={14}
                    onChange={(event) => setBody(event.target.value)}
                  />
                </label>
                {selected.editable ? (
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="primary"
                      size="xs"
                      onClick={() => void save()}
                      disabled={saving}
                    >
                      {saving ? '保存中…' : '保存技能'}
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-border px-2.5 py-2 text-[11px] leading-[1.6] text-fg-subtle">
                    内置技能只读。需要修改时，请在全局或项目中创建同名技能覆盖它。
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1.5 border-t border-border pt-2.5">
                <div className="flex items-center justify-between text-[11px] font-semibold text-fg-muted">
                  <span>文件</span>
                  <div className="flex items-center gap-2">
                    <small className="font-normal text-fg-subtle">
                      {files.length} 个
                    </small>
                    {selected.editable ? (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="none"
                          className="inline-flex items-center gap-1 p-0 text-[10px] text-fg-subtle underline hover:text-fg disabled:cursor-default disabled:opacity-45"
                          onClick={() => void upload('references')}
                          disabled={uploading}
                        >
                          <Icon name="plus" size={11} />
                          references
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="none"
                          className="inline-flex items-center gap-1 p-0 text-[10px] text-fg-subtle underline hover:text-fg disabled:cursor-default disabled:opacity-45"
                          onClick={() => void upload('assets')}
                          disabled={uploading}
                        >
                          <Icon name="plus" size={11} />
                          assets
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-col gap-0.5">
                  {files.map((file) => {
                    const active = preview?.path === file.path
                    return (
                      <div
                        key={file.path}
                        className={`group flex w-full items-center gap-0.5 rounded-md border pr-1 text-[10px] ${
                          active
                            ? 'border-border-strong bg-surface-hover text-fg'
                            : 'border-transparent text-fg-muted'
                        }`}
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          size="none"
                          className="flex min-w-0 flex-1 items-center gap-1.5 !justify-start bg-transparent py-[5px] pl-[7px] pr-1 !text-left font-[inherit] text-[10px]"
                          onClick={() => void openFile(file)}
                        >
                          <Icon name={fileIcon(file.path)} size={13} />
                          <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono">
                            {file.path}
                          </span>
                          <small className="text-fg-subtle">
                            {formatSize(file.size)}
                          </small>
                        </Button>
                        {selected.editable && file.path !== 'SKILL.md' ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="none"
                            className={`!h-[22px] !w-[22px] shrink-0 rounded-md p-0 text-fg-subtle hover:bg-surface-raised hover:text-danger ${
                              active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}
                            title="删除文件"
                            onClick={() => removeFile(file)}
                          >
                            <Icon name="trash" size={12} />
                          </Button>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
                {preview ? (
                  <div className="overflow-hidden rounded-md border border-border bg-surface-raised">
                    <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-[5px] font-mono text-[10px] text-fg-subtle">
                      <span>{preview.path}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="none"
                        className="p-0 text-[10px] text-fg-subtle underline hover:text-fg"
                        onClick={() =>
                          void window.api.skills.openFile(
                            selected.scope,
                            selected.name,
                            preview.path
                          )
                        }
                      >
                        用系统打开
                      </Button>
                    </div>
                    {preview.binary ? (
                      <div className="p-3.5 text-[11px] leading-[1.6] text-fg-subtle">
                        二进制文件，请用系统打开。
                      </div>
                    ) : (
                      <pre className="m-0 max-h-[240px] overflow-auto whitespace-pre-wrap break-words px-2.5 py-2 font-mono text-[10px] leading-[1.55] text-fg-muted">
                        {preview.content}
                      </pre>
                    )}
                  </div>
                ) : null}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
