import { useEffect, useState } from 'react'
import type {
  SkillAdminEntry,
  SkillImportKind,
  SkillImportPreview,
  SkillScope
} from '@shared/skills'
import { Icon } from '../../components/Icon'
import { Button, Dialog, NativeSelect, Switch } from '../../components/ui'

const SCOPE_LABEL: Record<SkillScope, string> = {
  builtin: '内置',
  global: '全局',
  project: '项目'
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

interface SkillImportDialogProps {
  open: boolean
  projectPath: string | null
  onClose: () => void
  onImported: (entry: SkillAdminEntry) => void
}

export function SkillImportDialog({
  open,
  projectPath,
  onClose,
  onImported
}: SkillImportDialogProps) {
  const [scope, setScope] = useState<'global' | 'project'>('global')
  const [preview, setPreview] = useState<SkillImportPreview | null>(null)
  const [overwrite, setOverwrite] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setScope('global')
    setPreview(null)
    setOverwrite(false)
    setBusy(false)
    setError(null)
  }, [open])

  useEffect(() => {
    if (!projectPath && scope === 'project') setScope('global')
  }, [projectPath, scope])

  useEffect(() => {
    setOverwrite(false)
  }, [scope])

  const conflict = Boolean(preview?.existingScopes.includes(scope))

  const discard = async (): Promise<void> => {
    const token = preview?.token
    setPreview(null)
    setOverwrite(false)
    setError(null)
    if (token) {
      await window.api.skills.discardImport(token).catch(() => undefined)
    }
  }

  const close = (): void => {
    if (busy) return
    void discard().finally(onClose)
  }

  const pick = async (kind: SkillImportKind): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const result = await window.api.skills.pickImport(kind)
      if (!result) return
      setPreview(result)
      setOverwrite(false)
    } catch (pickError) {
      setError(
        pickError instanceof Error ? pickError.message : '读取技能来源失败'
      )
    } finally {
      setBusy(false)
    }
  }

  const install = async (): Promise<void> => {
    if (!preview || (conflict && !overwrite)) return
    setBusy(true)
    setError(null)
    try {
      const entry = await window.api.skills.installImport({
        token: preview.token,
        scope,
        ...(conflict ? { overwrite: true } : {})
      })
      setPreview(null)
      onImported(entry)
      onClose()
    } catch (installError) {
      setError(
        installError instanceof Error ? installError.message : '导入技能失败'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="导入技能"
      description="从文件夹或 ZIP 导入标准 SKILL.md 技能。一次只导入一个技能。"
      size="lg"
      footer={
        preview ? (
          <>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void discard()}
              disabled={busy}
            >
              重新选择
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => void install()}
              disabled={busy || (conflict && !overwrite)}
            >
              {busy ? '导入中…' : '导入技能'}
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={close}
            disabled={busy}
          >
            取消
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-3 text-xs text-fg">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] text-fg-subtle">导入到</span>
          <NativeSelect
            value={scope}
            onChange={(event) =>
              setScope(event.target.value as 'global' | 'project')
            }
            disabled={busy}
          >
            <option value="global">全局技能 · 本机所有项目可用</option>
            <option value="project" disabled={!projectPath}>
              {projectPath
                ? '项目技能 · 仅当前项目可用'
                : '项目技能（未打开项目）'}
            </option>
          </NativeSelect>
        </label>

        {preview ? (
          <>
            <div className="rounded-card border border-border bg-surface-raised p-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[13px] font-semibold text-fg">
                  {preview.name}
                </span>
                <span className="shrink-0 rounded-full bg-surface-hover px-1.5 py-px text-[9px] leading-[14px] text-fg-muted">
                  {SCOPE_LABEL[scope]}
                </span>
              </div>
              <div className="mt-1.5 text-[11px] leading-[1.6] text-fg-muted">
                {preview.description}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-fg-subtle">
                <span>来源：{preview.sourceLabel}</span>
                {preview.version ? <span>v{preview.version}</span> : null}
                <span>{preview.files.length} 个文件</span>
                <span>{formatSize(preview.totalBytes)}</span>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="text-[11px] font-semibold text-fg-muted">
                文件
              </div>
              <div className="max-h-[180px] overflow-y-auto rounded-card border border-border bg-surface-raised">
                {preview.files.map((file) => (
                  <div
                    key={file.path}
                    className="flex items-center gap-2 border-b border-border px-2.5 py-1.5 text-[11px] last:border-b-0"
                  >
                    <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-fg-muted">
                      {file.path}
                    </span>
                    <span className="shrink-0 text-[10px] text-fg-subtle">
                      {formatSize(file.size)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {preview.existingScopes.length > 0 ? (
              <div className="rounded-md border border-[color-mix(in_srgb,var(--warning)_35%,var(--border))] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] px-2.5 py-2 text-[11px] leading-[1.6] text-fg-muted">
                已存在同名技能：
                {preview.existingScopes
                  .map((entry) => SCOPE_LABEL[entry])
                  .join(' / ')}
                。
                {conflict
                  ? `继续导入会覆盖${SCOPE_LABEL[scope]}技能。`
                  : '导入后会按作用域优先级遮蔽低层同名技能。'}
              </div>
            ) : null}

            {conflict ? (
              <label className="flex cursor-pointer items-center gap-2 text-[11px] text-fg-muted">
                <Switch
                  checked={overwrite}
                  onChange={setOverwrite}
                  size="sm"
                  label="覆盖同名技能"
                />
                <span>覆盖同名技能</span>
              </label>
            ) : null}
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 max-[620px]:grid-cols-1">
              <Button
                type="button"
                variant="secondary"
                size="none"
                className="flex h-[112px] flex-col !items-start !justify-start gap-1.5 !rounded-card border-border bg-surface-raised p-3 text-left hover:border-border-strong hover:bg-surface-hover"
                onClick={() => void pick('folder')}
                disabled={busy}
              >
                <Icon name="folder" size={20} className="text-fg-muted" />
                <span className="text-[12px] font-semibold text-fg">
                  选择文件夹
                </span>
                <span className="text-[10px] leading-[1.5] text-fg-subtle">
                  选择技能根目录，或包含单个技能的一层子目录
                </span>
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="none"
                className="flex h-[112px] flex-col !items-start !justify-start gap-1.5 !rounded-card border-border bg-surface-raised p-3 text-left hover:border-border-strong hover:bg-surface-hover"
                onClick={() => void pick('zip')}
                disabled={busy}
              >
                <Icon name="download" size={20} className="text-fg-muted" />
                <span className="text-[12px] font-semibold text-fg">
                  选择 ZIP 压缩包
                </span>
                <span className="text-[10px] leading-[1.5] text-fg-subtle">
                  支持根目录或单层包装目录，最大 50MB
                </span>
              </Button>
            </div>

            <div className="rounded-md border border-dashed border-border px-2.5 py-2 text-[10px] leading-[1.6] text-fg-subtle">
              标准技能需要 SKILL.md，frontmatter 包含合法的 name 和
              description，正文不能为空。支持 references/ 和 assets/；
              当前版本不导入或执行 scripts/。
            </div>
          </>
        )}

        {error ? (
          <div className="break-all rounded-md bg-[rgba(239,68,68,0.08)] px-2.5 py-2 text-[11px] leading-[1.6] text-danger">
            {error}
          </div>
        ) : null}

        {busy && !preview ? (
          <div className="text-[10px] text-fg-subtle">
            正在读取并校验技能…
          </div>
        ) : null}
      </div>
    </Dialog>
  )
}
