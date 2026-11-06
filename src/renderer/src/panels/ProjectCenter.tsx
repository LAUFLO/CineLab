import { useEffect, useState } from 'react'
import type { RecentProject } from '@shared/project-schema'
import { BrandWordmark } from '../components/Brand'
import { Icon } from '../components/Icon'
import { useProjectStore } from '../stores/project'

export function ProjectCenter() {
  const startNew = useProjectStore((state) => state.startNew)
  const openExisting = useProjectStore((state) => state.openExisting)
  const openPath = useProjectStore((state) => state.openPath)
  const error = useProjectStore((state) => state.error)

  const [recent, setRecent] = useState<RecentProject[]>([])
  const [loading, setLoading] = useState(true)

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
      <div className="project-center">
        <div className="project-center__brand">
          <BrandWordmark height={30} />
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
            <div className="project-center__section-title">最近项目</div>
            <div className="project-center__grid">
              {recent.map((project) => (
                <button
                  key={project.path}
                  type="button"
                  className="project-center__card"
                  onClick={() => void openPath(project.path)}
                >
                  <div className="project-center__cover">
                    <Icon name="folder" size={22} />
                  </div>
                  <div className="project-center__card-name">{project.name}</div>
                  <div className="project-center__card-path" title={project.path}>
                    {project.path}
                  </div>
                  <div className="project-center__card-time">
                    {new Date(project.lastOpenedAt).toLocaleString('zh-CN')}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : !loading ? (
          <div className="project-center__empty">
            还没有项目。新建一个，或打开已有的 <code>.cinelab</code> 项目。
          </div>
        ) : null}
      </div>
    </div>
  )
}
