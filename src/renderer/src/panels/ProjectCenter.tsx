import { useEffect, useState } from 'react'
import type { RecentProject } from '@shared/project-schema'
import { BrandWordmark } from '../components/Brand'
import { Icon } from '../components/Icon'
import { ProjectCard } from '../components/ProjectCard'
import { useProjectStore } from '../stores/project'

export function ProjectCenter() {
  const startNew = useProjectStore((state) => state.startNew)
  const openExisting = useProjectStore((state) => state.openExisting)
  const openPath = useProjectStore((state) => state.openPath)
  const error = useProjectStore((state) => state.error)

  const [recent, setRecent] = useState<RecentProject[]>([])
  const [loading, setLoading] = useState(true)

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
            onClick={() => void startNew()}
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
    </div>
  )
}
