import { useEffect, useRef, useState } from 'react'
import type { ExportResult } from '@shared/ipc-contract'
import type { RecentProject } from '@shared/project-schema'
import { BrandWordmark } from '../components/Brand'
import { Icon } from '../components/Icon'
import { ProjectCard } from '../components/ProjectCard'
import { Toast, Button, Input } from '../components/ui'
import { useProjectStore } from '../stores/project'
import { useUIStore } from '../stores/ui'
import { useSettingsStore } from '../stores/settings'
import { useUpdateStore } from '../stores/update'
import { studioOpen } from '../studio/scope'

export function TopBar() {
  const name = useProjectStore((state) => state.name)
  const saving = useProjectStore((state) => state.saving)
  const lastSavedAt = useProjectStore((state) => state.lastSavedAt)
  const canvasId = useProjectStore((state) => state.canvasId)
  const canvasName = useProjectStore((state) => state.canvasName)
  const canvases = useProjectStore((state) => state.canvases)
  const startNew = useProjectStore((state) => state.startNew)
  const openExisting = useProjectStore((state) => state.openExisting)
  const openPath = useProjectStore((state) => state.openPath)
  const projectPath = useProjectStore((state) => state.path)
  const renameProject = useProjectStore((state) => state.renameProject)
  const createCanvas = useProjectStore((state) => state.createCanvas)
  const switchCanvas = useProjectStore((state) => state.switchCanvas)
  const renameCanvas = useProjectStore((state) => state.renameCanvas)
  const deleteCanvas = useProjectStore((state) => state.deleteCanvas)
  const deleteProject = useProjectStore((state) => state.deleteProject)
  const requestConfirm = useUIStore((state) => state.requestConfirm)
  const updateStatus = useUpdateStore((state) => state.status)
  const openSettings = useSettingsStore((state) => state.openPanel)

  const [projectMenuOpen, setProjectMenuOpen] = useState(false)
  const [canvasMenuOpen, setCanvasMenuOpen] = useState(false)
  const [projectsOpen, setProjectsOpen] = useState(false)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [exportNotice, setExportNotice] = useState<string | null>(null)
  const [recent, setRecent] = useState<RecentProject[]>([])
  const [editingProject, setEditingProject] = useState(false)
  const [projectDraft, setProjectDraft] = useState(name)
  const [editingCanvasId, setEditingCanvasId] = useState<string | null>(null)
  const [canvasDraft, setCanvasDraft] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const exportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!projectMenuOpen && !canvasMenuOpen && !exportMenuOpen) return

    const onPointerDown = (event: PointerEvent): void => {
      if (!(event.target instanceof Node)) return

      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setProjectMenuOpen(false)
        setCanvasMenuOpen(false)
      }
      if (exportRef.current && !exportRef.current.contains(event.target)) {
        setExportMenuOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (studioOpen()) return
      if (event.key === 'Escape') {
        setProjectMenuOpen(false)
        setCanvasMenuOpen(false)
        setExportMenuOpen(false)
        setProjectsOpen(false)
      }
    }

    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [projectMenuOpen, canvasMenuOpen, exportMenuOpen])

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

  const refreshRecent = (): void => {
    void window.api.project.recent().then(setRecent)
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

  const showExportResult = (
    result: ExportResult,
    successText: string
  ): void => {
    if (result.ok) {
      setExportNotice(`${successText}：${result.path ?? ''}`)
    } else if (!result.canceled) {
      setExportNotice(result.error ?? '导出失败')
    } else {
      return
    }
    window.setTimeout(() => setExportNotice(null), 3600)
  }

  const exportProject = async (): Promise<void> => {
    setExportMenuOpen(false)
    showExportResult(await window.api.export.project(name), '项目已导出')
  }

  const exportCanvas = async (): Promise<void> => {
    setExportMenuOpen(false)
    document.body.classList.add('is-exporting')
    try {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
      showExportResult(
        await window.api.export.canvasPng(name, canvasName),
        '画布已导出'
      )
    } finally {
      document.body.classList.remove('is-exporting')
    }
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar__group" ref={menuRef}>
          <div className="topbar__workspace">
            <Button
              type="button"
              className="topbar__brand"
              onClick={() => {
                setProjectMenuOpen((open) => !open)
                setCanvasMenuOpen(false)
                setProjectsOpen(false)
              }}
              unstyled
            >
              <BrandWordmark height={16} />
              <Icon name="chevron-down" size={12} />
            </Button>

            <span className="topbar__divider" />

            {editingProject ? (
              <Input
                className="topbar__name-input"
                value={projectDraft}
                autoFocus
                onChange={(event) => setProjectDraft(event.target.value)}
                onBlur={() => void submitProjectName()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void submitProjectName()
                  if (event.key === 'Escape') setEditingProject(false)
                }}
                unstyled
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
                <Button
                  type="button"
                  className="add-menu__item"
                  onClick={() => void openProjects()}
                  unstyled
                >
                  <Icon name="folder" size={16} />
                  <span>全部项目</span>
                </Button>
                <Button
                  type="button"
                  className="add-menu__item"
                  onClick={() => {
                    closeAll()
                    void startNew()
                  }}
                  unstyled
                >
                  <Icon name="plus" size={16} />
                  <span>创建新项目</span>
                </Button>
                <div className="add-menu__divider" />
                <Button
                  type="button"
                  className="add-menu__item"
                  onClick={() => {
                    setProjectDraft(name)
                    setEditingProject(true)
                    setProjectMenuOpen(false)
                  }}
                  unstyled
                >
                  <Icon name="text" size={16} />
                  <span>重命名项目</span>
                </Button>
                <Button
                  type="button"
                  className="add-menu__item"
                  onClick={() => void handleDeleteProject()}
                  unstyled
                >
                  <Icon name="close" size={16} />
                  <span>删除项目</span>
                </Button>
              </div>
            ) : null}

            <div className="topbar__canvas">
              <Button
                type="button"
                className="topbar__canvas-trigger"
                onClick={() => {
                  setCanvasMenuOpen((open) => !open)
                  setProjectMenuOpen(false)
                  setProjectsOpen(false)
                }}
                unstyled
              >
                {canvasName}
                <Icon name="chevron-down" size={12} />
              </Button>

              {canvasMenuOpen ? (
                <div className="project-menu canvas-menu">
                  {canvases.map((canvas) => (
                    <div key={canvas.id} className="canvas-menu__row">
                      {editingCanvasId === canvas.id ? (
                        <Input
                          className="topbar__name-input"
                          value={canvasDraft}
                          autoFocus
                          onChange={(event) =>
                            setCanvasDraft(event.target.value)
                          }
                          onBlur={() => void submitCanvasName(canvas.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter')
                              void submitCanvasName(canvas.id)
                            if (event.key === 'Escape') setEditingCanvasId(null)
                          }}
                          unstyled
                        />
                      ) : (
                        <Button
                          type="button"
                          className={`add-menu__item canvas-menu__item ${
                            canvas.id === canvasId ? 'is-active' : ''
                          }`}
                          onClick={() => {
                            closeAll()
                            void switchCanvas(canvas.id)
                          }}
                          unstyled
                        >
                          <Icon name="grid" size={15} />
                          <span>{canvas.name}</span>
                        </Button>
                      )}
                      <Button
                        type="button"
                        className="icon-btn"
                        title="重命名画布"
                        onClick={() => {
                          setEditingCanvasId(canvas.id)
                          setCanvasDraft(canvas.name)
                        }}
                        unstyled
                      >
                        <Icon name="text" size={12} />
                      </Button>
                      <Button
                        type="button"
                        className="icon-btn"
                        title="删除画布"
                        disabled={canvases.length <= 1}
                        onClick={() => void deleteCanvas(canvas.id)}
                        unstyled
                      >
                        <Icon name="close" size={12} />
                      </Button>
                    </div>
                  ))}

                  <div className="add-menu__divider" />
                  <Button
                    type="button"
                    className="add-menu__item"
                    onClick={() => {
                      closeAll()
                      void createCanvas()
                    }}
                    unstyled
                  >
                    <Icon name="plus" size={16} />
                    <span>新建画布</span>
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="topbar__group">
          <span className="topbar__save">{saveLabel}</span>
          {updateStatus?.state === 'available' ||
          updateStatus?.state === 'downloaded' ? (
            <Button
              type="button"
              className="icon-btn topbar__update"
              title={
                updateStatus.state === 'downloaded'
                  ? '新版本已下载，点击打开更新'
                  : `发现新版本 ${updateStatus.latestVersion ?? ''}`
              }
              onClick={() => openSettings('about')}
              unstyled
            >
              <Icon name="download" />
              <span className="topbar__update-dot" />
            </Button>
          ) : null}
          <div className="export-wrap" ref={exportRef}>
            <Button
              className="icon-btn"
              title="导出"
              onClick={() => setExportMenuOpen((open) => !open)}
              unstyled
            >
              <Icon name="download" />
            </Button>
            {exportMenuOpen ? (
              <div className="export-menu">
                <Button
                  type="button"
                  className="add-menu__item"
                  onClick={() => void exportProject()}
                  unstyled
                >
                  <Icon name="folder" size={16} />
                  <span>导出项目（.zip）</span>
                </Button>
                <Button
                  type="button"
                  className="add-menu__item"
                  onClick={() => void exportCanvas()}
                  unstyled
                >
                  <Icon name="image" size={16} />
                  <span>导出当前画布 PNG</span>
                </Button>
              </div>
            ) : null}
          </div>
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
              <Button
                type="button"
                className="icon-btn"
                onClick={() => setProjectsOpen(false)}
                unstyled
              >
                <Icon name="close" size={14} />
              </Button>
            </header>

            <div className="projects-dialog__body">
              {recent.length > 0 ? (
                <div className="projects-dialog__grid">
                  {recent.map((item) => (
                    <ProjectCard
                      key={item.path}
                      project={item}
                      onOpen={(path) => {
                        setProjectsOpen(false)
                        void openPath(path)
                      }}
                      onChanged={refreshRecent}
                      canPickCanvas={item.path === projectPath}
                    />
                  ))}
                </div>
              ) : (
                <div className="projects-dialog__empty">还没有项目</div>
              )}
            </div>

            <footer className="projects-dialog__footer">
              <Button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setProjectsOpen(false)
                  void startNew()
                }}
                unstyled
              >
                新建项目
              </Button>
              <Button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setProjectsOpen(false)
                  void openExisting()
                }}
                unstyled
              >
                打开已有项目
              </Button>
            </footer>
          </div>
        </div>
      ) : null}

      {exportNotice ? (
        <Toast unstyled className="export-toast">
          {exportNotice}
        </Toast>
      ) : null}
    </>
  )
}
