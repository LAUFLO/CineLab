import { useEffect, useRef, useState } from 'react'
import type { RecentProject } from '@shared/project-schema'
import { Icon } from '../components/Icon'
import { useProjectStore } from '../stores/project'
import { useSettingsStore } from '../stores/settings'
import { useUIStore } from '../stores/ui'

interface TopBarProps {
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

export function TopBar({ theme, onToggleTheme }: TopBarProps) {
  const name = useProjectStore((state) => state.name)
  const saving = useProjectStore((state) => state.saving)
  const lastSavedAt = useProjectStore((state) => state.lastSavedAt)
  const canvasId = useProjectStore((state) => state.canvasId)
  const canvasName = useProjectStore((state) => state.canvasName)
  const canvases = useProjectStore((state) => state.canvases)
  const startNew = useProjectStore((state) => state.startNew)
  const openExisting = useProjectStore((state) => state.openExisting)
  const openPath = useProjectStore((state) => state.openPath)
  const renameProject = useProjectStore((state) => state.renameProject)
  const createCanvas = useProjectStore((state) => state.createCanvas)
  const switchCanvas = useProjectStore((state) => state.switchCanvas)
  const renameCanvas = useProjectStore((state) => state.renameCanvas)
  const deleteCanvas = useProjectStore((state) => state.deleteCanvas)
  const deleteProject = useProjectStore((state) => state.deleteProject)
  const openSettings = useSettingsStore((state) => state.openPanel)
  const requestConfirm = useUIStore((state) => state.requestConfirm)

  const [projectMenuOpen, setProjectMenuOpen] = useState(false)
  const [canvasMenuOpen, setCanvasMenuOpen] = useState(false)
  const [projectsOpen, setProjectsOpen] = useState(false)
  const [recent, setRecent] = useState<RecentProject[]>([])
  const [editingProject, setEditingProject] = useState(false)
  const [projectDraft, setProjectDraft] = useState(name)
  const [editingCanvasId, setEditingCanvasId] = useState<string | null>(null)
  const [canvasDraft, setCanvasDraft] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!projectMenuOpen && !canvasMenuOpen) return

    const onPointerDown = (event: PointerEvent): void => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setProjectMenuOpen(false)
        setCanvasMenuOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setProjectMenuOpen(false)
        setCanvasMenuOpen(false)
        setProjectsOpen(false)
      }
    }

    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [projectMenuOpen, canvasMenuOpen])

  const saveLabel = saving ? '保存中…' : lastSavedAt ? '已自动保存' : '就绪'

  const closeAll = (): void => {
    setProjectMenuOpen(false)
    setCanvasMenuOpen(false)
    setProjectsOpen(false)
  }

  const openProjects = async (): Promise<void> => {
    const list = await window.api.project.recent()
    setRecent(list)
    setProjectMenuOpen(false)
    setProjectsOpen(true)
  }

  const submitProjectName = async (): Promise<void> => {
    const next = projectDraft.trim()
    setEditingProject(false)
    if (next && next !== name) await renameProject(next)
  }

  const submitCanvasName = async (id: string): Promise<void> => {
    const next = canvasDraft.trim()
    setEditingCanvasId(null)
    if (next) await renameCanvas(id, next)
  }

  const handleDeleteProject = (): void => {
    closeAll()
    requestConfirm({
      title: '删除当前项目？',
      message:
        '项目文件夹及其中所有画布和资产会被永久删除，无法恢复。删除后将打开其他最近项目，或回到项目中心。',
      confirmLabel: '删除',
      danger: true,
      onConfirm: async () => {
        await deleteProject()
      }
    })
  }

  return (
    <>
    <header className="topbar">
      <div className="topbar__group" ref={menuRef}>
        <div className="topbar__workspace">
          <button
            type="button"
            className="topbar__brand"
            onClick={() => {
              setProjectMenuOpen((open) => !open)
              setCanvasMenuOpen(false)
              setProjectsOpen(false)
            }}
          >
            <Icon name="logo" size={18} />
            <Icon name="chevron-down" size={12} />
          </button>

          <span className="topbar__divider" />

          {editingProject ? (
            <input
              className="topbar__name-input"
              value={projectDraft}
              autoFocus
              onChange={(event) => setProjectDraft(event.target.value)}
              onBlur={() => void submitProjectName()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submitProjectName()
                if (event.key === 'Escape') setEditingProject(false)
              }}
            />
          ) : (
            <span
              className="topbar__project-name"
              title="双击重命名"
              onDoubleClick={() => {
                setProjectDraft(name)
                setEditingProject(true)
              }}
            >
              {name}
            </span>
          )}

          <span className="topbar__divider" />

          {projectMenuOpen ? (
            <div className="project-menu">
              <button
                type="button"
                className="add-menu__item"
                onClick={() => void openProjects()}
              >
                <Icon name="folder" size={16} />
                <span>全部项目</span>
              </button>
              <button
                type="button"
                className="add-menu__item"
                onClick={() => {
                  closeAll()
                  void startNew()
                }}
              >
                <Icon name="plus" size={16} />
                <span>创建新项目</span>
              </button>
              <div className="add-menu__divider" />
              <button
                type="button"
                className="add-menu__item"
                onClick={() => {
                  setProjectDraft(name)
                  setEditingProject(true)
                  setProjectMenuOpen(false)
                }}
              >
                <Icon name="text" size={16} />
                <span>重命名项目</span>
              </button>
              <button
                type="button"
                className="add-menu__item"
                onClick={() => void handleDeleteProject()}
              >
                <Icon name="close" size={16} />
                <span>删除项目</span>
              </button>
            </div>
          ) : null}



        <div className="topbar__canvas">
          <button
            type="button"
            className="topbar__canvas-trigger"
            onClick={() => {
              setCanvasMenuOpen((open) => !open)
              setProjectMenuOpen(false)
              setProjectsOpen(false)
            }}
          >
            {canvasName}
            <Icon name="chevron-down" size={12} />
          </button>

          {canvasMenuOpen ? (
            <div className="project-menu canvas-menu">
              {canvases.map((canvas) => (
                <div key={canvas.id} className="canvas-menu__row">
                  {editingCanvasId === canvas.id ? (
                    <input
                      className="topbar__name-input"
                      value={canvasDraft}
                      autoFocus
                      onChange={(event) => setCanvasDraft(event.target.value)}
                      onBlur={() => void submitCanvasName(canvas.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void submitCanvasName(canvas.id)
                        if (event.key === 'Escape') setEditingCanvasId(null)
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className={`add-menu__item canvas-menu__item ${
                        canvas.id === canvasId ? 'is-active' : ''
                      }`}
                      onClick={() => {
                        closeAll()
                        void switchCanvas(canvas.id)
                      }}
                    >
                      <Icon name="grid" size={15} />
                      <span>{canvas.name}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="icon-btn"
                    title="重命名画布"
                    onClick={() => {
                      setEditingCanvasId(canvas.id)
                      setCanvasDraft(canvas.name)
                    }}
                  >
                    <Icon name="text" size={12} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title="删除画布"
                    disabled={canvases.length <= 1}
                    onClick={() => void deleteCanvas(canvas.id)}
                  >
                    <Icon name="close" size={12} />
                  </button>
                </div>
              ))}

              <div className="add-menu__divider" />
              <button
                type="button"
                className="add-menu__item"
                onClick={() => {
                  closeAll()
                  void createCanvas()
                }}
              >
                <Icon name="plus" size={16} />
                <span>新建画布</span>
              </button>
            </div>
          ) : null}
        </div>
        </div>

      </div>

      <div className="topbar__group">
        <span className="topbar__save">{saveLabel}</span>
        <button className="icon-btn" title="导出">
          <Icon name="download" />
        </button>
        <button className="icon-btn" title="切换主题" onClick={onToggleTheme}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
        </button>
        <button className="icon-btn" title="设置" onClick={openSettings}>
          <Icon name="settings" />
        </button>

        <div className="bottombar__divider" />

        <button
          className="icon-btn icon-btn--window"
          title="最小化"
          onClick={() => window.api.app.minimize()}
        >
          <Icon name="minimize" size={14} />
        </button>
        <button
          className="icon-btn icon-btn--window"
          title="最大化"
          onClick={() => window.api.app.maximize()}
        >
          <Icon name="maximize" size={12} />
        </button>
        <button
          className="icon-btn icon-btn--window icon-btn--close"
          title="关闭"
          onClick={() => window.api.app.close()}
        >
          <Icon name="close" size={14} />
        </button>
      </div>

    </header>

    {projectsOpen ? (
      <div
        className="projects-overlay"
        onPointerDown={() => setProjectsOpen(false)}
      >
          <div
            className="projects-dialog"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <header className="projects-dialog__head">
              <span>全部项目</span>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setProjectsOpen(false)}
              >
                <Icon name="close" size={14} />
              </button>
            </header>

            <div className="projects-dialog__body">
              {recent.length > 0 ? (
                <div className="projects-dialog__grid">
                  {recent.map((item) => (
                    <button
                      key={item.path}
                      type="button"
                      className="project-center__card"
                      onClick={() => {
                        setProjectsOpen(false)
                        void openPath(item.path)
                      }}
                    >
                      <div className="project-center__cover">
                        <Icon name="folder" size={16} />
                      </div>
                      <div className="project-center__card-name">{item.name}</div>
                      <div className="project-center__card-path" title={item.path}>
                        {item.path}
                      </div>
                      <div className="project-center__card-time">
                        {new Date(item.lastOpenedAt).toLocaleString('zh-CN')}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="projects-dialog__empty">还没有项目</div>
              )}
            </div>

            <footer className="projects-dialog__footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setProjectsOpen(false)
                  void startNew()
                }}
              >
                新建项目
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setProjectsOpen(false)
                  void openExisting()
                }}
              >
                打开已有项目
              </button>
            </footer>
          </div>
        </div>
      ) : null}
  </>
)
}
