import { useEffect, useState } from 'react'
import type { RecentProject } from '@shared/project-schema'
import { BrandWordmark } from '../components/Brand'
import { Icon } from '../components/Icon'
import { ProjectCard } from '../components/ProjectCard'
import { PROJECT_TEMPLATES } from '@shared/project-templates'
import { useProjectStore } from '../stores/project'
import { useSettingsStore } from '../stores/settings'

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
    <div className="welcome-screen">
      <div className={`project-center${recent.length > 0 ? ' project-center--has-recent' : ''}`}>
        <div className="project-center__brand">
          <BrandWordmark height={64} />
        </div>
        <p className="project-center__hint">
          本地 AI 创作画布 · 数据存在你自己的硬盘上
        </p>

        <div className="project-center__actions">
          <button
            type="button"
            className="project-center__new"
            onClick={() => setTemplateOpen(true)}
          >
            <Icon name="plus" size={20} />
            新建项目
          </button>
          <button
            type="button"
            className="project-center__open"
            onClick={() => void openExisting()}
          >
            打开已有项目
          </button>
        </div>

        {settingsLoaded && !hasUsableModel ? (
          <button
            type="button"
            className="project-center__model-hint"
            onClick={() => openSettings('models')}
          >
            <Icon name="settings" size={16} />
            <span className="project-center__model-copy">
              <strong>还没有配置模型</strong>
              <small>添加一个模型供应商后即可开始生成</small>
            </span>
            <span className="project-center__model-action">配置模型 →</span>
          </button>
        ) : null}

        {error ? <div className="form-message is-error">{error}</div> : null}

        {recent.length > 0 ? (
          <div className="project-center__recent">
            <div className="project-center__grid">
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
          <div className="project-center__empty is-loading">正在读取最近项目…</div>
        ) : (
          <div className="project-center__empty">还没有项目，新建一个开始创作</div>
        )}
      </div>

      {templateOpen ? (
        <div
          className="settings-overlay"
          onPointerDown={() => setTemplateOpen(false)}
        >
          <div
            className="template-picker"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <header className="template-picker__head">
              <div>
                <div className="template-picker__title">选择项目模板</div>
                <div className="template-picker__subtitle">
                  模板只生成画布结构，不会预置模型或素材
                </div>
              </div>
              <button
                type="button"
                className="icon-btn settings-dialog__close"
                title="关闭"
                onClick={() => setTemplateOpen(false)}
              >
                <Icon name="close" size={14} />
              </button>
            </header>

            <div className="template-picker__grid">
              {PROJECT_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className="template-picker__card"
                  onClick={() => {
                    setTemplateOpen(false)
                    void startNew(template.id)
                  }}
                >
                  <span className="template-picker__name">{template.name}</span>
                  <span className="template-picker__desc">
                    {template.description}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
