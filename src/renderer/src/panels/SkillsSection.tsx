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
import '../styles/skills.css'

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
        refreshError instanceof Error
          ? refreshError.message
          : '读取技能失败'
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
      current.map((item) =>
        entryKey(item) === entryKey(entry) ? entry : item
      )
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
      setError(
        createError instanceof Error ? createError.message : '创建失败'
      )
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
      setError(
        removeError instanceof Error ? removeError.message : '删除失败'
      )
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

  const upload = async (
    folder: 'references' | 'assets'
  ): Promise<void> => {
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
            removeError instanceof Error
              ? removeError.message
              : '删除文件失败'
          )
        }
      }
    })
  }

  const cloneTo = async (
    targetScope: 'global' | 'project'
  ): Promise<void> => {
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
      setError(
        openError instanceof Error ? openError.message : '读取文件失败'
      )
    }
  }

  return (
    <div className="settings-section skills-section">
      <div className="skills-head">
        <div>
          <div className="skills-head__title">技能</div>
          <div className="skills-head__desc">
            内置技能随应用提供；全局技能在本机所有项目可用；项目技能只属于当前项目。
          </div>
        </div>
        <button
          type="button"
          className="btn-primary btn-small"
          onClick={() => {
            setCreating(true)
            setDraft(emptyDraft())
            setError(null)
          }}
        >
          <Icon name="plus" size={13} />
          新建技能
        </button>
      </div>

      {error ? <div className="form-message is-error">{error}</div> : null}

      {creating ? (
        <div className="skills-create">
          <div className="skills-create__title">新建技能</div>
          <div className="skills-form-row">
            <label className="field">
              <span>作用域</span>
              <select
                className="skills-input"
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
              </select>
            </label>
            <label className="field">
              <span>名称</span>
              <input
                className="skills-input"
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
            <label className="field">
              <span>版本</span>
              <input
                className="skills-input"
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
          <label className="field">
            <span>描述</span>
            <input
              className="skills-input"
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
          <label className="field">
            <span>SKILL.md 正文</span>
            <textarea
              className="skills-textarea"
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
          <div className="skills-create__actions">
            <button
              type="button"
              className="btn-secondary btn-small"
              onClick={() => setCreating(false)}
              disabled={saving}
            >
              取消
            </button>
            <button
              type="button"
              className="btn-primary btn-small"
              onClick={() => void create()}
              disabled={
                saving ||
                !draft.name.trim() ||
                !draft.description.trim()
              }
            >
              {saving ? '创建中…' : '创建技能'}
            </button>
          </div>
        </div>
      ) : null}

      <div className="skills-layout">
        <aside className="skills-list">
          {loading ? (
            <div className="skills-empty">正在读取技能…</div>
          ) : grouped.length === 0 ? (
            <div className="skills-empty">还没有技能</div>
          ) : (
            grouped.map((group) => (
              <div key={group.scope} className="skills-group">
                <div className="skills-group__head">
                  <span>
                    {SCOPE_LABEL[group.scope]} · {group.entries.length}
                  </span>
                  <button
                    type="button"
                    className="skills-link"
                    onClick={() =>
                      void window.api.skills.openDirectory(group.scope)
                    }
                  >
                    打开目录
                  </button>
                </div>
                {group.entries.map((entry) => {
                  const key = entryKey(entry)
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`skills-item ${
                        key === selectedKey ? 'is-active' : ''
                      } ${entry.enabled ? '' : 'is-disabled'}`}
                      onClick={() => setSelectedKey(key)}
                    >
                      <div className="skills-item__row">
                        <span className="skills-item__name">{entry.name}</span>
                        {!entry.enabled ? (
                          <span className="skills-badge is-off">已禁用</span>
                        ) : null}
                        {entry.shadowedBy ? (
                          <span className="skills-badge is-shadow">
                            被{SCOPE_LABEL[entry.shadowedBy]}覆盖
                          </span>
                        ) : null}
                      </div>
                      <div className="skills-item__desc">
                        {entry.description}
                      </div>
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </aside>

        <section className="skills-detail">
          {!selected ? (
            <div className="skills-empty">
              选择一个技能查看详情，或新建技能。
            </div>
          ) : (
            <>
              <header className="skills-detail__head">
                <div>
                  <div className="skills-detail__title">{selected.name}</div>
                  <div className="skills-detail__meta">
                    <span className="skills-badge">
                      {SCOPE_LABEL[selected.scope]}
                    </span>
                    {selected.editable ? null : (
                      <span className="skills-badge is-off">只读</span>
                    )}
                    {selected.shadowedBy ? (
                      <span className="skills-badge is-shadow">
                        被{SCOPE_LABEL[selected.shadowedBy]}同名技能覆盖
                      </span>
                    ) : null}
                    {selected.version ? (
                      <span className="skills-badge">
                        v{selected.version}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="skills-detail__actions">
                  {selected.scope !== 'project' &&
                  !skills.some(
                    (entry) =>
                      entry.scope === 'project' &&
                      entry.name === selected.name
                  ) ? (
                    <button
                      type="button"
                      className="btn-secondary btn-small"
                      onClick={() => void cloneTo('project')}
                      disabled={!projectPath || cloning}
                    >
                      <Icon name="copy" size={13} />
                      创建项目覆盖
                    </button>
                  ) : null}
                  {selected.scope === 'builtin' &&
                  !skills.some(
                    (entry) =>
                      entry.scope === 'global' &&
                      entry.name === selected.name
                  ) ? (
                    <button
                      type="button"
                      className="btn-secondary btn-small"
                      onClick={() => void cloneTo('global')}
                      disabled={cloning}
                    >
                      <Icon name="copy" size={13} />
                      创建全局覆盖
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn-secondary btn-small"
                    onClick={() =>
                      void window.api.skills.openDirectory(
                        selected.scope,
                        selected.name
                      )
                    }
                  >
                    <Icon name="folder" size={13} />
                    打开目录
                  </button>
                  {selected.editable ? (
                    <button
                      type="button"
                      className={`btn-secondary btn-small ${
                        confirmRemove ? 'is-danger' : ''
                      }`}
                      onClick={() => void remove()}
                      disabled={saving}
                    >
                      <Icon name="trash" size={13} />
                      {confirmRemove ? '确认删除' : '删除'}
                    </button>
                  ) : null}
                </div>
              </header>

              <div className="skills-toggles">
                <label className="skills-switch">
                  <input
                    type="checkbox"
                    checked={selected.enabled}
                    onChange={(event) =>
                      void toggle(selected, {
                        enabled: event.target.checked
                      })
                    }
                  />
                  <span>启用</span>
                </label>
                <label className="skills-switch">
                  <input
                    type="checkbox"
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

              <div className="skills-editor">
                <label className="field">
                  <span>描述</span>
                  <input
                    className="skills-input"
                    value={description}
                    disabled={!selected.editable}
                    maxLength={500}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>版本</span>
                  <input
                    className="skills-input"
                    value={version}
                    disabled={!selected.editable}
                    onChange={(event) => setVersion(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>SKILL.md 正文</span>
                  <textarea
                    className="skills-textarea"
                    value={body}
                    disabled={!selected.editable}
                    rows={14}
                    onChange={(event) => setBody(event.target.value)}
                  />
                </label>
                {selected.editable ? (
                  <div className="skills-editor__actions">
                    <button
                      type="button"
                      className="btn-primary btn-small"
                      onClick={() => void save()}
                      disabled={saving}
                    >
                      {saving ? '保存中…' : '保存技能'}
                    </button>
                  </div>
                ) : (
                  <div className="skills-readonly">
                    内置技能只读。需要修改时，请在全局或项目中创建同名技能覆盖它。
                  </div>
                )}
              </div>

              <div className="skills-files">
                <div className="skills-files__head">
                  <span>文件</span>
                  <div className="skills-files__actions">
                    <small>{files.length} 个</small>
                    {selected.editable ? (
                      <>
                        <button
                          type="button"
                          className="skills-link"
                          onClick={() => void upload('references')}
                          disabled={uploading}
                        >
                          <Icon name="plus" size={11} />
                          references
                        </button>
                        <button
                          type="button"
                          className="skills-link"
                          onClick={() => void upload('assets')}
                          disabled={uploading}
                        >
                          <Icon name="plus" size={11} />
                          assets
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="skills-files__list">
                  {files.map((file) => (
                    <div
                      key={file.path}
                      className={`skills-file ${
                        preview?.path === file.path ? 'is-active' : ''
                      }`}
                    >
                      <button
                        type="button"
                        className="skills-file__main"
                        onClick={() => void openFile(file)}
                      >
                        <Icon name={fileIcon(file.path)} size={13} />
                        <span>{file.path}</span>
                        <small>{formatSize(file.size)}</small>
                      </button>
                      {selected.editable && file.path !== 'SKILL.md' ? (
                        <button
                          type="button"
                          className="skills-file__delete"
                          title="删除文件"
                          onClick={() => removeFile(file)}
                        >
                          <Icon name="trash" size={12} />
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
                {preview ? (
                  <div className="skills-preview">
                    <div className="skills-preview__head">
                      <span>{preview.path}</span>
                      <button
                        type="button"
                        className="skills-link"
                        onClick={() =>
                          void window.api.skills.openFile(
                            selected.scope,
                            selected.name,
                            preview.path
                          )
                        }
                      >
                        用系统打开
                      </button>
                    </div>
                    {preview.binary ? (
                      <div className="skills-empty">二进制文件，请用系统打开。</div>
                    ) : (
                      <pre>{preview.content}</pre>
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
