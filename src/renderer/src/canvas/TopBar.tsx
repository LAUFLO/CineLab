import { useRef, useState } from 'react'
import type { ExportResult } from '@shared/ipc-contract'
import type { RecentProject } from '@shared/project-schema'
import { BrandWordmark } from '../components/Brand'
import { Icon } from '../components/Icon'
import { ProjectCard } from '../components/ProjectCard'
import {
  Toast,
  Button,
  DIALOG_SURFACE,
  Dialog,
  Input,
  Popover
} from '../components/ui'
import { useProjectStore } from '../stores/project'
import { useUIStore } from '../stores/ui'
import { useSettingsStore } from '../stores/settings'
import { useUpdateStore } from '../stores/update'

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
  const closeProject = useProjectStore((state) => state.closeProject)
  const requestConfirm = useUIStore((state) => state.requestConfirm)
  const updateStatus = useUpdateStore((state) => state.status)
  const openSettings = useSettingsStore((state) => state.openPanel)
  const openWorkflowSave = useUIStore((state) => state.openWorkflowSave)

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
  const toolbarCardRef = useRef<HTMLDivElement>(null)
  const projectTriggerRef = useRef<HTMLButtonElement>(null)
  const canvasTriggerRef = useRef<HTMLButtonElement>(null)
  const exportTriggerRef = useRef<HTMLButtonElement>(null)
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
    document.body.dataset.exporting = ''
    try {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
      showExportResult(
        await window.api.export.canvasPng(name, canvasName),
        '画布已导出'
      )
    } finally {
      delete document.body.dataset.exporting
    }
  }

  return (
    <>
      <header data-slot="topbar" className="pointer-events-none absolute inset-x-0 top-0 z-20 flex h-14 items-start justify-between px-3 [-webkit-app-region:drag]">
        <div
          className="pointer-events-auto ml-1 flex items-center gap-1 pt-4 [-webkit-app-region:no-drag] [[data-platform='darwin']_&]:pl-[68px]"
        >
          <div
            ref={toolbarCardRef}
            className="relative flex h-10 items-center rounded-card border border-border bg-surface px-1.5 py-1 shadow-float"
          >
            <Button
              type="button"
              variant="ghost"
              size="none"
              className="h-[30px] gap-1.5 rounded-md px-2 text-[13px] !font-normal !text-fg"
              ref={projectTriggerRef}
              onClick={() => {
                setProjectMenuOpen((open) => !open)
                setCanvasMenuOpen(false)
                setProjectsOpen(false)
              }}
            >
              <BrandWordmark height={16} />
              <Icon name="chevron-down" size={12} />
            </Button>

            <span className="mx-2 h-[18px] w-px bg-divider" />

            {editingProject ? (
              <Input
                className="!h-[30px] !w-[140px] !rounded-md !border-border-strong !bg-surface-hover !px-2 !text-[13px] !text-fg"
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
                className="max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap text-[13px] text-fg"
                title="双击重命名"
                onDoubleClick={() => {
                  setProjectDraft(name)
                  setEditingProject(true)
                }}
              >
                {name}
              </span>
            )}

            <span className="mx-2 h-[18px] w-px bg-divider" />

            {projectMenuOpen ? (
              <Popover
                open={projectMenuOpen}
                onClose={() => setProjectMenuOpen(false)}
                anchorRef={toolbarCardRef}
                align="start"
                width={280}
                className="!p-1.5"
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="none"
                  className="!flex h-[42px] w-full !justify-start rounded-md px-3 text-[15px] !font-normal"
                  onClick={() => void openProjects()}
                >
                  <Icon name="folder" size={16} />
                  <span>全部项目</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="none"
                  className="!flex h-[42px] w-full !justify-start rounded-md px-3 text-[15px] !font-normal"
                  onClick={() => {
                    closeAll()
                    void closeProject()
                  }}
                >
                  <Icon name="chevron-left" size={16} />
                  <span>关闭项目</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="none"
                  className="!flex h-[42px] w-full !justify-start rounded-md px-3 text-[15px] !font-normal"
                  onClick={() => {
                    closeAll()
                    void startNew()
                  }}
                >
                  <Icon name="plus" size={16} />
                  <span>创建新项目</span>
                </Button>
                <div className="mx-1.5 my-1 h-px bg-divider" />
                <Button
                  type="button"
                  variant="ghost"
                  size="none"
                  className="!flex h-[42px] w-full !justify-start rounded-md px-3 text-[15px] !font-normal"
                  onClick={() => {
                    setProjectDraft(name)
                    setEditingProject(true)
                    setProjectMenuOpen(false)
                  }}
                >
                  <Icon name="text" size={16} />
                  <span>重命名项目</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="none"
                  className="!flex h-[42px] w-full !justify-start rounded-md px-3 text-[15px] !font-normal"
                  onClick={() => {
                    closeAll()
                    openWorkflowSave()
                  }}
                >
                  <Icon name="folder-plus" size={16} />
                  <span>保存当前画布为工作流</span>
                </Button>
                <div className="mx-1.5 my-1 h-px bg-divider" />
                <Button
                  type="button"
                  variant="ghost"
                  size="none"
                  className="!flex h-[42px] w-full !justify-start rounded-md px-3 text-[15px] !font-normal"
                  onClick={() => void handleDeleteProject()}
                >
                  <Icon name="close" size={16} />
                  <span>删除项目</span>
                </Button>
              </Popover>
            ) : null}

            <div className="relative">
              <Button
                type="button"
                variant="ghost"
                size="none"
                className="h-[30px] gap-1 rounded-md px-2 text-[13px] !font-normal"
                ref={canvasTriggerRef}
                onClick={() => {
                  setCanvasMenuOpen((open) => !open)
                  setProjectMenuOpen(false)
                  setProjectsOpen(false)
                }}
              >
                {canvasName}
                <Icon name="chevron-down" size={12} />
              </Button>

              {canvasMenuOpen ? (
                <Popover
                  open={canvasMenuOpen}
                  onClose={() => setCanvasMenuOpen(false)}
                  anchorRef={canvasTriggerRef}
                  align="start"
                  width={240}
                  className="!p-1.5"
                >
                  {canvases.map((canvas) => (
                    <div key={canvas.id} className="flex items-center gap-0.5">
                      {editingCanvasId === canvas.id ? (
                        <Input
                          className="!h-[30px] !w-auto min-w-0 flex-1 !rounded-md !border-border-strong !bg-surface-hover !px-2 !text-[13px] !text-fg"
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
                        />
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="none"
                          className={`h-8 min-w-0 flex-1 !justify-start !rounded-md px-2 text-[13px] !font-normal ${
                            canvas.id === canvasId ? 'bg-surface-hover !text-fg' : ''
                          }`}
                          onClick={() => {
                            closeAll()
                            void switchCanvas(canvas.id)
                          }}
                        >
                          <Icon name="grid" size={15} />
                          <span>{canvas.name}</span>
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="none"
                        className="h-7 w-7 shrink-0 rounded-md p-0"
                        title="重命名画布"
                        onClick={() => {
                          setEditingCanvasId(canvas.id)
                          setCanvasDraft(canvas.name)
                        }}
                      >
                        <Icon name="text" size={12} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="none"
                        className="h-7 w-7 shrink-0 rounded-md p-0"
                        title="删除画布"
                        disabled={canvases.length <= 1}
                        onClick={() => void deleteCanvas(canvas.id)}
                      >
                        <Icon name="close" size={12} />
                      </Button>
                    </div>
                  ))}

                  <div className="mx-1.5 my-1 h-px bg-divider" />
                  <Button
                    type="button"
                    variant="ghost"
                    size="none"
                    className="!flex h-[42px] w-full !justify-start rounded-md px-3 text-[15px] !font-normal"
                    onClick={() => {
                      closeAll()
                      void createCanvas()
                    }}
                  >
                    <Icon name="plus" size={16} />
                    <span>新建画布</span>
                  </Button>
                </Popover>
              ) : null}
            </div>
          </div>
        </div>

        <div className="pointer-events-auto flex items-center gap-1 pr-48 pt-1.5 [-webkit-app-region:no-drag] [[data-platform='darwin']_&]:pr-3">
          <span className="whitespace-nowrap px-1 text-[11px] text-fg-subtle">{saveLabel}</span>
          {updateStatus?.state === 'available' ||
          updateStatus?.state === 'downloaded' ? (
            <Button
              type="button"
              variant="ghost"
              size="none"
              className="relative h-7 w-7 rounded-md p-0"
              title={
                updateStatus.state === 'downloaded'
                  ? '新版本已下载，点击打开更新'
                  : `发现新版本 ${updateStatus.latestVersion ?? ''}`
              }
              onClick={() => openSettings('about')}
            >
              <Icon name="refresh" />
              <span className="absolute right-[5px] top-[5px] h-1.5 w-1.5 rounded-full bg-pick-bar" />
            </Button>
          ) : null}
          <div className="relative">
            <Button
              type="button"
              variant="ghost"
              size="none"
              className="h-7 w-7 rounded-md p-0"
              title="导出"
              ref={exportTriggerRef}
              onClick={() => setExportMenuOpen((open) => !open)}
            >
              <Icon name="download" />
            </Button>
            {exportMenuOpen ? (
              <Popover
                open={exportMenuOpen}
                onClose={() => setExportMenuOpen(false)}
                anchorRef={exportTriggerRef}
                align="end"
                width={216}
                className="!p-1.5"
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="none"
                  className="!flex h-[38px] w-full !justify-start rounded-md px-2.5 text-[13px] !font-normal"
                  onClick={() => void exportProject()}
                >
                  <Icon name="folder" size={16} />
                  <span>导出项目（.zip）</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="none"
                  className="!flex h-[38px] w-full !justify-start rounded-md px-2.5 text-[13px] !font-normal"
                  onClick={() => void exportCanvas()}
                >
                  <Icon name="image" size={16} />
                  <span>导出当前画布 PNG</span>
                </Button>
              </Popover>
            ) : null}
          </div>
        </div>
      </header>

      {projectsOpen ? (
        <Dialog
          open
          onClose={() => setProjectsOpen(false)}
          bare
          ariaLabel="全部项目"
          overlayClassName="fixed inset-0 z-[160] flex items-center justify-center bg-overlay p-8 [-webkit-app-region:no-drag]"
          panelClassName={`flex h-[min(800px,100%)] w-[min(1600px,100%)] flex-col overflow-hidden ${DIALOG_SURFACE}`}
        >
            <header className="flex h-14 shrink-0 items-center justify-between border-b border-divider px-5 text-[15px] text-fg">
              <span>全部项目</span>
              <Button
                type="button"
                variant="ghost"
                size="none"
                className="h-7 w-7 rounded-md p-0"
                onClick={() => setProjectsOpen(false)}
              >
                <Icon name="close" size={14} />
              </Button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {recent.length > 0 ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-2.5 [&>div]:rounded-card [&>div]:p-2.5">
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
                <div className="px-2 py-12 text-center text-[13px] text-fg-subtle">还没有项目</div>
              )}
            </div>

            <footer className="flex shrink-0 justify-end gap-2 border-t border-divider px-5 py-3.5">
              <Button
                type="button"
                variant="secondary"
                size="none"
                className="h-[34px] rounded-md px-4 text-[13px] !font-normal"
                onClick={() => {
                  setProjectsOpen(false)
                  void startNew()
                }}
              >
                新建项目
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="none"
                className="h-[34px] rounded-md px-4 text-[13px] !font-normal"
                onClick={() => {
                  setProjectsOpen(false)
                  void openExisting()
                }}
              >
                打开已有项目
              </Button>
            </footer>
        </Dialog>
      ) : null}

      {exportNotice ? (
        <Toast className="!bottom-[72px] !z-[320] max-w-[560px] !rounded-card border-border !bg-surface !px-3.5 !py-2 !text-xs text-fg">
          {exportNotice}
        </Toast>
      ) : null}
    </>
  )
}
