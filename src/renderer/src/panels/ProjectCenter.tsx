import { useEffect, useState } from 'react'
import type { RecentProject } from '@shared/project-schema'
import { BrandWordmark } from '../components/Brand'
import { Icon } from '../components/Icon'
import { ProjectCard } from '../components/ProjectCard'
import { PROJECT_TEMPLATES } from '@shared/project-templates'
import { useProjectStore } from '../stores/project'
import { useSettingsStore } from '../stores/settings'
import { Button } from '../components/ui'

export function ProjectCenter() {
  const startNew = useProjectStore((state) => state.startNew)
  const openExisting = useProjectStore((state) => state.openExisting)
  const openPath = useProjectStore((state) => state.openPath)
  const error = useProjectStore((state) => state.error)
  const providers = useSettingsStore((state) => state.providers)
  const settingsLoaded = useSettingsStore((state) => state.loaded)
  const loadSettings = useSettingsStore((state) => state.load)
  const openSettings = useSettingsStore((state) => state.openPanel)

  const hasUsableModel = providers.some(
    (provider) => provider.models.length > 0 && provider.hasKey
  )

  useEffect(() => {
    if (!settingsLoaded) {
      void loadSettings().catch(() => undefined)
    }
  }, [settingsLoaded, loadSettings])

  const [recent, setRecent] = useState<RecentProject[]>([])
  const [loading, setLoading] = useState(true)
  const [templateOpen, setTemplateOpen] = useState(false)

  const refreshRecent = (): void => {
    void window.api.project.recent().then(setRecent)
  }

  useEffect(() => {
    let cancelled = false

    void window.api.project
      .recent()
      .then((list) => {
        if (cancelled) return
        setRecent(list)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="absolute inset-0 flex items-start justify-center overflow-y-auto bg-canvas bg-[radial-gradient(var(--border)_1px,transparent_1px)] p-8 [background-size:20px_20px]">
      <div
        className={`my-auto rounded-[20px] border border-border bg-surface p-[44px_48px] text-center shadow-float animate-[welcome-in_220ms_ease-out] max-[720px]:p-[36px_28px] ${
          recent.length > 0 ? 'w-[min(960px,100%)]' : 'w-[min(560px,100%)]'
        }`}
      >
        <div className="flex items-center justify-center text-fg">
          <BrandWordmark height={64} />
        </div>
        <p className="mb-[26px] mt-2.5 text-[14px] text-fg-subtle">
          本地 AI 创作画布 · 数据存在你自己的硬盘上
        </p>

        <div className="flex items-center justify-center gap-2.5">
          <Button
            type="button"
            variant="primary"
            size="none"
            className="inline-flex h-12 items-center gap-2 rounded-xl px-[22px] text-[14px] hover:opacity-90"
            onClick={() => setTemplateOpen(true)}
          >
            <Icon name="plus" size={20} />
            新建项目
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="none"
            className="h-12 rounded-xl px-5 text-[13px]"
            onClick={() => void openExisting()}
          >
            打开已有项目
          </Button>
        </div>

        {settingsLoaded && !hasUsableModel ? (
          <Button
            type="button"
            variant="ghost"
            size="none"
            className="mt-[22px] flex w-full max-w-[468px] items-center gap-3 rounded-xl border border-border bg-surface-hover px-3.5 py-3 !text-left text-fg transition-[border-color,background] duration-[120ms] hover:border-border-strong hover:bg-surface-raised"
            onClick={() => openSettings('models')}
          >
            <Icon name="settings" size={16} className="shrink-0 text-fg-muted" />
            <span className="flex min-w-0 flex-col gap-[3px]">
              <strong className="text-[13px] font-medium">
                还没有配置模型
              </strong>
              <small className="text-[11px] text-fg-subtle">
                添加一个模型供应商后即可开始生成
              </small>
            </span>
            <span className="ml-auto shrink-0 text-xs text-fg-muted">
              配置模型 →
            </span>
          </Button>
        ) : null}

        {error ? (
          <div className="break-all rounded-md bg-[rgba(239,68,68,0.08)] px-2.5 py-2 text-xs leading-[1.6] text-danger">
            {error}
          </div>
        ) : null}

        {recent.length > 0 ? (
          <div className="mt-8">
            <div className="grid grid-cols-4 gap-3 max-[720px]:grid-cols-2 max-[520px]:grid-cols-1">
              {recent.map((project) => (
                <ProjectCard
                  key={project.path}
                  project={project}
                  onOpen={(path) => void openPath(path)}
                  onChanged={refreshRecent}
                />
              ))}
            </div>
          </div>
        ) : loading ? (
          <div className="mt-7 text-xs leading-[1.7] text-fg-subtle">
            正在读取最近项目…
          </div>
        ) : (
          <div className="mt-7 text-xs leading-[1.7] text-fg-subtle">
            还没有项目，新建一个开始创作
          </div>
        )}
      </div>

      {templateOpen ? (
        <div
          className="settings-overlay"
          onPointerDown={() => setTemplateOpen(false)}
        >
          <div
            className="w-[640px] max-w-[calc(100vw-48px)] rounded-2xl border border-border bg-surface p-5 shadow-menu"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <header className="mb-4 flex items-start justify-between gap-4">
              <div>
                <div className="text-[15px] font-semibold text-fg">
                  选择项目模板
                </div>
                <div className="mt-1 text-[11px] text-fg-subtle">
                  模板只生成画布结构，不会预置模型或素材
                </div>
              </div>
              <Button
                type="button"
                className="icon-btn settings-dialog__close"
                title="关闭"
                onClick={() => setTemplateOpen(false)}
                unstyled
              >
                <Icon name="close" size={14} />
              </Button>
            </header>

            <div className="grid grid-cols-2 gap-2.5">
              {PROJECT_TEMPLATES.map((template) => (
                <Button
                  key={template.id}
                  type="button"
                  variant="ghost"
                  size="none"
                  className="flex flex-col !items-start gap-1.5 rounded-xl border border-border bg-surface-hover p-3.5 !text-left transition-[border-color,background] duration-[120ms] hover:border-border-selected hover:bg-surface-raised"
                  onClick={() => {
                    setTemplateOpen(false)
                    void startNew(template.id)
                  }}
                >
                  <span className="text-sm text-fg">{template.name}</span>
                  <span className="text-[11px] leading-[1.6] text-fg-subtle">
                    {template.description}
                  </span>
                </Button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
