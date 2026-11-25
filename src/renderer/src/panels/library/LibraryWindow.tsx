import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  NODE_META,
  TITLE_HEIGHT,
  type NodeKind,
  type OutputRef
} from '@shared/canvas-schema'
import type {
  LibraryAsset,
  LibraryFolderNode,
  PromptTemplate,
  TemplateInput
} from '@shared/library-schema'
import { PROMPT_FOLDER } from '@shared/library-schema'
import { Icon } from '../../components/Icon'
import {
  Button,
  DIALOG_PANEL,
  Dialog,
  IconButton,
  Input
} from '../../components/ui'
import { isGroupNode, useCanvasStore } from '../../stores/canvas'
import { fitNodeToMedia, probeMediaSize } from '../../canvas/media-size'
import { useLibraryStore } from '../../stores/library'
import { useUIStore } from '../../stores/ui'
import { AssetGrid } from './AssetGrid'
import { FolderTree } from './FolderTree'
import { NameDialog } from './NameDialog'
import { StyleFolderGrid, filterStyles } from './StyleFolderGrid'
import { TemplateDialog } from './TemplateDialog'
import { TemplateGrid } from './TemplateGrid'
import { WorkflowGrid } from './WorkflowGrid'
import { useProjectStore } from '../../stores/project'

type NameDialogState =
  | { kind: 'create-folder'; parent: string }
  | { kind: 'rename-folder'; node: LibraryFolderNode }
  | { kind: 'rename-asset'; asset: LibraryAsset }
  | null

function toOutput(asset: LibraryAsset): OutputRef {
  return {
    id: asset.path,
    path: asset.path,
    scope: 'global',
    kind: asset.kind === 'template' ? 'image' : asset.kind,
    createdAt: asset.modifiedAt,
    model: '资产库'
  }
}

function withSpecialCounts(
  nodes: LibraryFolderNode[],
  styleCount: number,
  templateCount: number
): LibraryFolderNode[] {
  return nodes
    .filter((node) => !node.path.startsWith('风格/'))
    .map((node) => ({
      ...node,
      assetCount:
        node.path === '风格'
          ? styleCount
          : node.path === '提示词'
            ? templateCount
            : node.assetCount,
      children: withSpecialCounts(node.children, styleCount, templateCount)
    }))
}

async function addAssetToCanvas(asset: LibraryAsset): Promise<void> {
  const store = useCanvasStore.getState()
  const kind: NodeKind =
    asset.kind === 'video'
      ? 'video'
      : asset.kind === 'audio'
        ? 'audio'
        : 'image'
  const meta = NODE_META[kind]
  const { viewport } = store
  const center = {
    x: (window.innerWidth / 2 - viewport.x) / viewport.zoom,
    y: (window.innerHeight / 2 - viewport.y) / viewport.zoom
  }

  const output = toOutput(asset)
  const size = await probeMediaSize(output.path)
  const id = store.addNode(kind, {
    x: center.x - meta.width / 2,
    y: center.y - (meta.height + TITLE_HEIGHT) / 2
  })

  store.patchNodeData(id, {
    title: asset.name,
    status: 'done',
    assetOnly: true,
    outputs: [{ ...output, width: size?.width, height: size?.height }],
    selectedOutputId: output.id
  })
  fitNodeToMedia(id, size)
}

/**
 * 移动资产后同步当前画布中的全局引用，避免节点断图。
 * 其他项目里的旧引用无法自动跟随。
 */
function syncCanvasAssetPath(oldPath: string, nextPath: string): void {
  const store = useCanvasStore.getState()

  for (const node of store.nodes) {
    if (isGroupNode(node)) continue
    if (
      node.type !== 'cine' &&
      node.type !== 'film' &&
      node.type !== 'studio'
    ) {
      continue
    }
    const outputs = node.data.outputs
    if (!outputs) continue

    let changed = false
    const nextOutputs = outputs.map((output) => {
      if (output.scope !== 'global' || output.path !== oldPath) return output
      changed = true
      return { ...output, path: nextPath }
    })

    if (!changed) continue
    if (node.type === 'cine')
      store.patchNodeData(node.id, { outputs: nextOutputs })
    else if (node.type === 'studio') {
      store.patchStudioNode(node.id, { outputs: nextOutputs })
    }
  }
}

export function LibraryWindow() {
  const open = useLibraryStore((state) => state.panelOpen)
  const mode = useLibraryStore((state) => state.mode)
  const root = useLibraryStore((state) => state.root)
  const tree = useLibraryStore((state) => state.tree)
  const folder = useLibraryStore((state) => state.folder)
  const assets = useLibraryStore((state) => state.assets)
  const templates = useLibraryStore((state) => state.templates)
  const styles = useLibraryStore((state) => state.styles)
  const loadStyles = useLibraryStore((state) => state.loadStyles)
  const loading = useLibraryStore((state) => state.loading)
  const error = useLibraryStore((state) => state.error)
  const pendingAdds = useLibraryStore((state) => state.pendingAdds)
  const close = useLibraryStore((state) => state.closePanel)
  const setFolder = useLibraryStore((state) => state.setFolder)
  const createFolder = useLibraryStore((state) => state.createFolder)
  const renameFolder = useLibraryStore((state) => state.renameFolder)
  const deleteFolder = useLibraryStore((state) => state.deleteFolder)
  const importAssets = useLibraryStore((state) => state.importAssets)
  const confirmAdd = useLibraryStore((state) => state.confirmAdd)
  const renameAsset = useLibraryStore((state) => state.renameAsset)
  const moveAsset = useLibraryStore((state) => state.moveAsset)
  const deleteAsset = useLibraryStore((state) => state.deleteAsset)
  const setAssetTags = useLibraryStore((state) => state.setAssetTags)
  const reveal = useLibraryStore((state) => state.reveal)
  const revealRoot = useLibraryStore((state) => state.revealRoot)
  const saveTemplate = useLibraryStore((state) => state.saveTemplate)
  const deleteTemplate = useLibraryStore((state) => state.deleteTemplate)
  const workflows = useLibraryStore((state) => state.workflows)
  const loadWorkflows = useLibraryStore((state) => state.loadWorkflows)
  const renameWorkflow = useLibraryStore((state) => state.renameWorkflow)
  const deleteWorkflow = useLibraryStore((state) => state.deleteWorkflow)

  const insertPrompt = useUIStore((state) => state.insertPrompt)
  const showToast = useUIStore((state) => state.showToast)
  const requestConfirm = useUIStore((state) => state.requestConfirm)

  const [query, setQuery] = useState('')
  const [nameDialog, setNameDialog] = useState<NameDialogState>(null)
  const [templateDialog, setTemplateDialog] = useState<TemplateInput | null>(
    null
  )
  const [moveTargets, setMoveTargets] = useState<LibraryAsset[]>([])
  const [moveFolder, setMoveFolder] = useState('')
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [concatOpen, setConcatOpen] = useState(false)
  const [concatResolution, setConcatResolution] = useState<'720p' | '1080p'>(
    '720p'
  )
  const [concatQuality, setConcatQuality] = useState<'standard' | 'high'>(
    'standard'
  )
  const [concatBusy, setConcatBusy] = useState(false)
  const [concatSubtitle, setConcatSubtitle] = useState<string | null>(null)
  const [concatBgm, setConcatBgm] = useState<string | null>(null)
  const [concatNarration, setConcatNarration] = useState<string | null>(null)
  const [concatOriginalVolume, setConcatOriginalVolume] = useState(100)
  const [concatBgmVolume, setConcatBgmVolume] = useState(25)
  const [concatNarrationVolume, setConcatNarrationVolume] = useState(100)
  const [tagTarget, setTagTarget] = useState<LibraryAsset | null>(null)
  const [tagDraft, setTagDraft] = useState('')

  const isStyleFolder = folder === '风格'
  const isWorkflowFolder = folder === '工作流'
  const filteredStyles = useMemo(
    () => filterStyles(styles, query),
    [styles, query]
  )
  const displayTree = useMemo(() => {
    const nodes = withSpecialCounts(tree, styles.length, templates.length)
    if (workflows.length === 0) return nodes
    return [
      {
        path: '工作流',
        name: '工作流',
        children: [],
        assetCount: workflows.length
      },
      ...nodes
    ]
  }, [tree, styles.length, templates.length, workflows.length])

  useEffect(() => {
    if (!open || !isStyleFolder) return
    void loadStyles()
  }, [open, isStyleFolder, loadStyles])

  useEffect(() => {
    if (!open || !isWorkflowFolder) return
    void loadWorkflows()
  }, [open, isWorkflowFolder, loadWorkflows])

  if (!open) return null

  const handleCreateFolder = (parent: string): void => {
    setNameDialog({ kind: 'create-folder', parent })
  }

  const handleConfirmName = (value: string): void => {
    if (!nameDialog) return

    if (nameDialog.kind === 'create-folder') {
      const parent = nameDialog.parent
      void createFolder(parent, value).then((node) => {
        if (node) void setFolder(node.path)
      })
    } else if (nameDialog.kind === 'rename-folder') {
      void renameFolder(nameDialog.node.path, value)
    } else {
      void renameAsset(nameDialog.asset.path, value)
    }

    setNameDialog(null)
  }

  const handleDeleteFolder = (node: LibraryFolderNode): void => {
    requestConfirm({
      title: '删除文件夹',
      message: `确定删除空文件夹「${node.name}」吗？文件夹内有文件时无法删除。`,
      confirmLabel: '删除',
      danger: true,
      onConfirm: () => void deleteFolder(node.path)
    })
  }

  const handleDeleteAsset = (asset: LibraryAsset): void => {
    requestConfirm({
      title: '删除素材',
      message: `确定从资产库删除「${asset.name}」吗？画布中已引用它的节点会显示为缺失。`,
      confirmLabel: '删除',
      danger: true,
      onConfirm: () => void deleteAsset(asset.path)
    })
  }

  const handleMove = (asset: LibraryAsset): void => {
    setMoveTargets([asset])
    setMoveFolder('')
  }

  const handleConfirmMove = async (): Promise<void> => {
    if (moveTargets.length === 0 || !moveFolder) return

    const targets = [...moveTargets]
    for (const asset of targets) {
      const next = await moveAsset(asset.path, moveFolder)
      if (next) syncCanvasAssetPath(asset.path, next)
    }

    setMoveTargets([])
    setMoveFolder('')
    setSelectedPaths(new Set())
    showToast(`已移动 ${targets.length} 个素材到 ${moveFolder}`)
  }

  const selectedAssets = assets.filter((asset) => selectedPaths.has(asset.path))
  const selectedVideos = selectedAssets.filter(
    (asset) => asset.kind === 'video'
  )
  const canConcat =
    selectedVideos.length >= 2 &&
    selectedVideos.length === selectedAssets.length

  const addWorkflowToCanvas = async (
    workflow: (typeof workflows)[number]
  ): Promise<void> => {
    const store = useCanvasStore.getState()
    const { viewport } = store
    const offset = {
      x: (window.innerWidth / 2 - viewport.x) / viewport.zoom - 300,
      y: (window.innerHeight / 2 - viewport.y) / viewport.zoom - 200
    }

    try {
      const result = await window.api.workflow.apply(workflow.slug, offset)
      store.loadCanvas(
        result.canvas.nodes as never,
        result.canvas.edges as never,
        result.canvas.viewport
      )
      useCanvasStore.getState().onNodesChange(
        result.nodeIds.map((id) => ({
          id,
          type: 'select' as const,
          selected: true
        }))
      )
      showToast(`已添加工作流「${workflow.name}」`)
      useUIStore.getState().requestFitView()
      if (result.warnings.length > 0) {
        showToast(result.warnings[0], 'error')
      }
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : String(error),
        'error'
      )
    }
  }

  const handleSelectFolder = (path: string): void => {
    setSelectedPaths(new Set())
    setSelectionMode(false)
    void setFolder(path)
  }

  const toggleSelect = (asset: LibraryAsset): void => {
    setSelectedPaths((current) => {
      const next = new Set(current)
      if (next.has(asset.path)) next.delete(asset.path)
      else next.add(asset.path)
      return next
    })
  }

  const handleBatchDelete = (): void => {
    if (selectedAssets.length === 0) return
    const targets = [...selectedAssets]

    requestConfirm({
      title: '删除素材',
      message: `确定删除选中的 ${targets.length} 个素材吗？画布中已引用它们的节点会显示为缺失。`,
      confirmLabel: '删除',
      danger: true,
      onConfirm: async () => {
        for (const asset of targets) {
          await deleteAsset(asset.path)
        }
        setSelectedPaths(new Set())
        showToast(`已删除 ${targets.length} 个素材`)
      }
    })
  }

  const handleConcat = async (): Promise<void> => {
    if (!canConcat) return

    setConcatBusy(true)
    try {
      const result = await window.api.export.concatVideos(
        selectedVideos.map((asset) => asset.path),
        {
          resolution: concatResolution,
          quality: concatQuality,
          ...(concatSubtitle ? { subtitlePath: concatSubtitle } : {}),
          ...(concatBgm ? { bgmPath: concatBgm } : {}),
          ...(concatNarration ? { narrationPath: concatNarration } : {}),
          originalVolume: concatOriginalVolume / 100,
          bgmVolume: concatBgmVolume / 100,
          narrationVolume: concatNarrationVolume / 100
        }
      )

      if (result.ok) {
        showToast(`已合成：${result.path ?? ''}`)
        setConcatOpen(false)
        setSelectionMode(false)
        setSelectedPaths(new Set())
        setConcatSubtitle(null)
        setConcatBgm(null)
        setConcatNarration(null)
        setConcatOriginalVolume(100)
        setConcatBgmVolume(25)
        setConcatNarrationVolume(100)
      } else if (!result.canceled) {
        showToast(result.error ?? '合成失败', 'error')
      }
    } finally {
      setConcatBusy(false)
    }
  }

  const handleSaveTags = async (): Promise<void> => {
    if (!tagTarget) return

    const tags = tagDraft
      .split(/[,，]/)
      .map((tag) => tag.trim())
      .filter(Boolean)

    await setAssetTags(tagTarget.path, tags)
    setTagTarget(null)
    setTagDraft('')
    showToast(tags.length > 0 ? `已保存 ${tags.length} 个标签` : '已清空标签')
  }

  const handleExport = (asset: LibraryAsset): void => {
    void window.api.export
      .asset(asset.path, asset.name, 'global')
      .then((result) => {
        if (result.ok) showToast(`已导出：${result.path ?? ''}`)
        else if (!result.canceled)
          showToast(result.error ?? '导出失败', 'error')
      })
  }

  const handleAddToCanvas = (asset: LibraryAsset): void => {
    void addAssetToCanvas(asset)
    showToast(`已添加到画布：${asset.name}`)
    close()
  }

  const handleImport = (): void => {
    void importAssets().then((imported) => {
      if (imported.length > 0) showToast(`已导入 ${imported.length} 个素材`)
    })
  }

  const handleUseTemplate = (template: PromptTemplate): void => {
    insertPrompt(template.prompt)
    showToast(`已插入模板：${template.name}`)
    close()
  }

  const handleSaveTemplate = (input: TemplateInput): void => {
    void saveTemplate(input).then((ok) => {
      if (!ok) {
        showToast('模板保存失败，请查看窗口内提示', 'error')
        return
      }
      setTemplateDialog(null)
      showToast('模板已保存')
    })
  }

  const handleDeleteTemplate = (template: PromptTemplate): void => {
    requestConfirm({
      title: '删除模板',
      message: `确定删除模板「${template.name}」吗？`,
      confirmLabel: '删除',
      danger: true,
      onConfirm: () => void deleteTemplate(template.id)
    })
  }

  const handleConfirmAdd = (): void => {
    if (!folder) {
      showToast('请选择一个具体文件夹', 'error')
      return
    }

    void confirmAdd(folder).then((saved) => {
      if (saved.length === 1) {
        showToast(`已加入资产库：${saved[0].path}`)
      } else if (saved.length > 1) {
        showToast(`已加入 ${saved.length} 个素材到资产库`)
      }
    })
  }

  const segments = folder ? folder.split('/') : []
  const isTemplateFolder = folder === PROMPT_FOLDER

  return createPortal(
    <div
      className="fixed inset-0 z-[250] flex items-center justify-center bg-overlay"
      onPointerDown={close}
    >
      <div
        data-testid="library-window"
        className="flex h-[min(720px,calc(100vh-80px))] w-[min(1120px,calc(100vw-64px))] flex-col overflow-hidden rounded-panel border border-border bg-surface-raised shadow-float"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="flex h-[52px] shrink-0 items-center justify-between gap-4 border-b border-divider pl-[18px] pr-3">
          <div className="flex min-w-0 items-center gap-2 text-sm text-fg">
            <Icon name="library" size={16} />
            <span>{mode === 'pick' ? '选择要加入的文件夹' : '资产库'}</span>
            {mode === 'pick' && pendingAdds.length > 0 ? (
              <span className="max-w-[320px] truncate text-xs text-fg-muted">
                ·{' '}
                {pendingAdds.length === 1
                  ? pendingAdds[0].name
                  : `${pendingAdds.length} 个素材`}
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-1.5">
            <div className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-surface-raised px-[9px] text-fg-subtle focus-within:border-border-strong">
              <Icon name="search" size={13} />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={isStyleFolder ? '搜索风格' : '搜索当前文件夹'}
                className="!h-auto !w-[180px] !rounded-none !border-0 !bg-transparent !p-0 !text-xs focus:!border-0"
              />
            </div>
            {mode === 'browse' && !isTemplateFolder && !isStyleFolder && !isWorkflowFolder ? (
              <Button
                variant="secondary"
                size="xs"
                onClick={() => {
                  setSelectionMode((current) => !current)
                  setSelectedPaths(new Set())
                }}
              >
                {selectionMode ? '退出选择' : '选择'}
              </Button>
            ) : null}
            <IconButton
              label="在资源管理器中打开资产库"
              size="sm"
              onClick={() => void revealRoot()}
            >
              <Icon name="folder" size={14} />
            </IconButton>
            <IconButton label="关闭" size="sm" onClick={close}>
              <Icon name="close" size={14} />
            </IconButton>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="flex w-[248px] shrink-0 flex-col border-r border-divider bg-surface-raised">
            <FolderTree
              tree={displayTree}
              current={folder}
              readOnly={isStyleFolder}
              onSelect={handleSelectFolder}
              onCreate={handleCreateFolder}
              onRename={(node) =>
                setNameDialog({ kind: 'rename-folder', node })
              }
              onDelete={handleDeleteFolder}
            />
            <div
              className="shrink-0 truncate border-t border-divider px-3 py-[9px] text-[10.5px] text-fg-subtle"
              title={root}
            >
              {root}
            </div>
          </aside>

          <main className="min-w-0 flex-1 overflow-y-auto px-[18px] pb-5 pt-[14px]">
            <div className="mb-[14px] flex items-center gap-0.5 text-xs text-fg-subtle">
              <Button
                type="button"
                variant="ghost"
                size="none"
                className="cursor-pointer rounded-md px-1 py-0.5 text-xs text-fg-muted"
                onClick={() => handleSelectFolder('')}
              >
                全部
              </Button>
              {segments.map((segment, index) => {
                const path = segments.slice(0, index + 1).join('/')
                return (
                  <span key={path} className="flex items-center gap-0.5">
                    <Icon name="chevron-right" size={10} />
                    <Button
                      type="button"
                      variant="ghost"
                      size="none"
                      className="cursor-pointer rounded-md px-1 py-0.5 text-xs text-fg-muted"
                      onClick={() => handleSelectFolder(path)}
                    >
                      {segment}
                    </Button>
                  </span>
                )
              })}
              {isTemplateFolder ? (
                <>
                  <div className="flex-1" />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="shrink-0 whitespace-nowrap"
                    onClick={() =>
                      setTemplateDialog({ name: '', kind: 'image', prompt: '' })
                    }
                  >
                    <Icon name="plus" size={12} />
                    新建提示词
                  </Button>
                </>
              ) : null}
            </div>

            {error ? (
              <div className="mb-3 break-all rounded-md bg-danger/8 px-2.5 py-2 text-xs leading-[1.6] text-danger">
                {error}
              </div>
            ) : null}
            {loading ? (
              <div className="py-10 text-center text-xs text-fg-subtle">
                加载中…
              </div>
            ) : null}

            {!loading && isTemplateFolder ? (
              <TemplateGrid
                templates={templates}
                query={query}
                onUse={handleUseTemplate}
                onEdit={(template) => setTemplateDialog(template)}
                onDelete={handleDeleteTemplate}
              />
            ) : null}

            {!loading && isWorkflowFolder ? (
              <WorkflowGrid
                workflows={workflows}
                query={query}
                onAddToCanvas={(workflow) => void addWorkflowToCanvas(workflow)}
                onRename={(slug, name) => void renameWorkflow(slug, name)}
                onDelete={(workflow) =>
                  requestConfirm({
                    title: '删除工作流？',
                    message: `「${workflow.name}」会从资产库永久删除，已用它创建的项目不受影响。`,
                    confirmLabel: '删除',
                    danger: true,
                    onConfirm: () => void deleteWorkflow(workflow.slug)
                  })
                }
                onExport={(workflow) => {
                  void window.api.workflow
                    .export(workflow.slug)
                    .then((result) => {
                      if (result.ok) showToast('工作流已导出')
                      else if (!result.canceled)
                        showToast(result.error ?? '导出失败', 'error')
                    })
                }}
                onCreateProject={(workflow) => {
                  close()
                  void useProjectStore.getState().startNew(workflow.slug)
                }}
              />
            ) : null}

            {!loading && isStyleFolder ? (
              <>
                <div className="mb-3 text-[11px] text-fg-subtle">
                  与画布风格库同源；官方风格只读，自定义风格请在画布提示条中管理。
                </div>
                <StyleFolderGrid styles={styles} query={query} />
              </>
            ) : null}

            {!loading && !isTemplateFolder && !isStyleFolder && !isWorkflowFolder ? (
              <AssetGrid
                assets={assets}
                query={query}
                selectionMode={selectionMode}
                selectedPaths={selectedPaths}
                onToggleSelect={toggleSelect}
                onAddToCanvas={handleAddToCanvas}
                onExport={handleExport}
                onMove={handleMove}
                onRename={(asset) =>
                  setNameDialog({ kind: 'rename-asset', asset })
                }
                onEditTags={(asset) => {
                  setTagTarget(asset)
                  setTagDraft((asset.tags ?? []).join(', '))
                }}
                onDelete={handleDeleteAsset}
                onReveal={(asset) => void reveal(asset.path)}
              />
            ) : null}
          </main>
        </div>

        <footer className="flex h-14 shrink-0 items-center justify-between gap-3 border-t border-divider px-[18px]">
          <div className="flex min-w-0 items-center gap-2">
            {selectionMode ? (
              <>
                <Button
                  variant="secondary"
                  size="xs"
                  className="shrink-0 whitespace-nowrap"
                  onClick={() =>
                    setSelectedPaths(new Set(assets.map((asset) => asset.path)))
                  }
                >
                  全选
                </Button>
                <Button
                  variant="secondary"
                  size="xs"
                  className="shrink-0 whitespace-nowrap"
                  onClick={() => setSelectedPaths(new Set())}
                >
                  清空
                </Button>
                <span className="ml-1 min-w-0 truncate text-[11px] text-fg-subtle">
                  已选 {selectedAssets.length} 个
                </span>
              </>
            ) : (
              <>
                {mode === 'browse' && !isStyleFolder ? (
                  <Button
                    variant="secondary"
                    className="shrink-0 whitespace-nowrap"
                    onClick={handleImport}
                  >
                    <Icon name="plus" size={13} />
                    上传
                  </Button>
                ) : null}
                {!isStyleFolder ? (
                  <Button
                    variant="secondary"
                    className="shrink-0 whitespace-nowrap"
                    onClick={() => handleCreateFolder(folder)}
                  >
                    <Icon name="folder-plus" size={13} />
                    新建文件夹
                  </Button>
                ) : null}
                <span className="ml-1 min-w-0 truncate text-[11px] text-fg-subtle">
                  {isStyleFolder
                    ? `${filteredStyles.length} 个风格 · 官方 ${styles.filter((style) => style.source === 'official').length} · 自定义 ${styles.filter((style) => style.source === 'user').length}`
                    : `${assets.length} 个素材 · ${templates.length} 个模板`}
                </span>
              </>
            )}
          </div>

          <div className="flex min-w-0 items-center gap-2">
            {selectionMode ? (
              <>
                <Button
                  variant="secondary"
                  size="xs"
                  className="shrink-0 whitespace-nowrap"
                  disabled={selectedAssets.length === 0}
                  onClick={() => {
                    setMoveTargets(selectedAssets)
                    setMoveFolder('')
                  }}
                >
                  移动到
                </Button>
                <Button
                  variant="secondary"
                  size="xs"
                  className="shrink-0 whitespace-nowrap"
                  disabled={!canConcat}
                  onClick={() => setConcatOpen(true)}
                >
                  合成视频
                </Button>
                <Button
                  variant="secondary"
                  size="xs"
                  className="shrink-0 whitespace-nowrap !px-3.5 !text-danger hover:!text-danger"
                  disabled={selectedAssets.length === 0}
                  onClick={handleBatchDelete}
                >
                  删除
                </Button>
                <Button
                  variant="primary"
                  size="xs"
                  className="shrink-0 whitespace-nowrap"
                  onClick={() => {
                    setSelectionMode(false)
                    setSelectedPaths(new Set())
                  }}
                >
                  完成
                </Button>
              </>
            ) : mode === 'pick' ? (
              <>
                <Button
                  variant="secondary"
                  className="shrink-0 whitespace-nowrap"
                  onClick={close}
                >
                  取消
                </Button>
                <Button
                  variant="primary"
                  className="shrink-0 whitespace-nowrap"
                  onClick={handleConfirmAdd}
                  disabled={!folder || pendingAdds.length === 0 || isStyleFolder}
                >
                  加入到这里
                </Button>
              </>
            ) : (
              <Button
                variant="secondary"
                className="shrink-0 whitespace-nowrap"
                onClick={close}
              >
                关闭
              </Button>
            )}
          </div>
        </footer>
      </div>

      {moveTargets.length > 0 ? (
        <Dialog
          open
          onClose={() => setMoveTargets([])}
          bare
          ariaLabel="移动素材"
          overlayClassName="fixed inset-0 z-[260] flex items-center justify-center bg-overlay"
          panelClassName={`w-[420px] ${DIALOG_PANEL}`}
        >
          <div className="mb-[14px] text-sm text-fg">
            {moveTargets.length === 1
              ? `移动「${moveTargets[0].name}」到`
              : `移动 ${moveTargets.length} 个素材到`}
          </div>
          <div className="mt-3 max-h-[340px] overflow-y-auto rounded-card border border-border bg-surface-raised p-1.5">
            <FolderTree
              tree={tree}
              current={moveFolder}
              onSelect={(path) => setMoveFolder(path)}
              onCreate={() => {}}
              onRename={() => {}}
              onDelete={() => {}}
              readOnly
            />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setMoveTargets([])}>
              取消
            </Button>
            <Button
              variant="primary"
              onClick={() => void handleConfirmMove()}
              disabled={!moveFolder}
            >
              移动到此处
            </Button>
          </div>
        </Dialog>
      ) : null}

      {concatOpen ? (
        <Dialog
          open
          onClose={() => setConcatOpen(false)}
          bare
          ariaLabel="合成视频"
          overlayClassName="fixed inset-0 z-[260] flex items-center justify-center bg-overlay"
          panelClassName={`w-[560px] ${DIALOG_PANEL}`}
        >
          <div className="mb-[14px] text-sm text-fg">合成视频</div>
          <div className="mb-5 mt-4 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4 text-xs text-fg-muted">
              <span>分辨率</span>
              <div className="flex gap-2">
                {(['720p', '1080p'] as const).map((value) => (
                  <Button
                    key={value}
                    type="button"
                    variant="secondary"
                    size="none"
                    className={`h-[34px] min-w-20 rounded-md bg-surface-hover px-[14px] text-xs ${
                      concatResolution === value
                        ? '!border-border-selected !bg-surface-raised !text-fg'
                        : ''
                    }`}
                    onClick={() => setConcatResolution(value)}
                  >
                    {value === '720p' ? '720P' : '1080P'}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 text-xs text-fg-muted">
              <span>画质</span>
              <div className="flex gap-2">
                {(
                  [
                    ['standard', '标准'],
                    ['high', '高画质']
                  ] as const
                ).map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    variant="secondary"
                    size="none"
                    className={`h-[34px] min-w-20 rounded-md bg-surface-hover px-[14px] text-xs ${
                      concatQuality === value
                        ? '!border-border-selected !bg-surface-raised !text-fg'
                        : ''
                    }`}
                    onClick={() => setConcatQuality(value)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 text-xs text-fg-muted">
              <span>字幕</span>
              <div className="flex min-w-0 items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="none"
                  className="h-[30px] shrink-0 rounded-md bg-surface-hover px-[10px] text-[11px] text-fg"
                  onClick={() =>
                    void window.api.export
                      .pickFile('subtitle')
                      .then((path) => path && setConcatSubtitle(path))
                  }
                >
                  {concatSubtitle ? '更换 SRT' : '选择 SRT'}
                </Button>
                <span
                  className="max-w-[220px] truncate text-[11px] text-fg-subtle"
                  title={concatSubtitle ?? ''}
                >
                  {concatSubtitle
                    ? concatSubtitle.split(/[\\/]/).pop()
                    : '无（可选）'}
                </span>
                {concatSubtitle ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="none"
                    className="h-[30px] shrink-0 rounded-md bg-surface-hover px-[10px] text-[11px] text-fg"
                    onClick={() => setConcatSubtitle(null)}
                  >
                    清除
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 text-xs text-fg-muted">
              <span>背景音乐</span>
              <div className="flex min-w-0 items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="none"
                  className="h-[30px] shrink-0 rounded-md bg-surface-hover px-[10px] text-[11px] text-fg"
                  onClick={() =>
                    void window.api.export
                      .pickFile('audio')
                      .then((path) => path && setConcatBgm(path))
                  }
                >
                  {concatBgm ? '更换音频' : '选择音频'}
                </Button>
                <span
                  className="max-w-[220px] truncate text-[11px] text-fg-subtle"
                  title={concatBgm ?? ''}
                >
                  {concatBgm ? concatBgm.split(/[\\/]/).pop() : '无（可选）'}
                </span>
                {concatBgm ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="none"
                    className="h-[30px] shrink-0 rounded-md bg-surface-hover px-[10px] text-[11px] text-fg"
                    onClick={() => setConcatBgm(null)}
                  >
                    清除
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 text-xs text-fg-muted">
              <span>旁白</span>
              <div className="flex min-w-0 items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="none"
                  className="h-[30px] shrink-0 rounded-md bg-surface-hover px-[10px] text-[11px] text-fg"
                  onClick={() =>
                    void window.api.export
                      .pickFile('audio')
                      .then((path) => path && setConcatNarration(path))
                  }
                >
                  {concatNarration ? '更换音频' : '选择音频'}
                </Button>
                <span
                  className="max-w-[220px] truncate text-[11px] text-fg-subtle"
                  title={concatNarration ?? ''}
                >
                  {concatNarration
                    ? concatNarration.split(/[\\/]/).pop()
                    : '无（可选）'}
                </span>
                {concatNarration ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="none"
                    className="h-[30px] shrink-0 rounded-md bg-surface-hover px-[10px] text-[11px] text-fg"
                    onClick={() => setConcatNarration(null)}
                  >
                    清除
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 text-xs text-fg-muted">
              <span>音量</span>
              <div className="flex min-w-[260px] flex-col gap-1.5">
                <label className="grid grid-cols-[36px_1fr_40px] items-center gap-2 text-[11px] text-fg-subtle">
                  原声
                  <Input
                    type="range"
                    min={0}
                    max={100}
                    value={concatOriginalVolume}
                    onChange={(event) =>
                      setConcatOriginalVolume(Number(event.target.value))
                    }
                    className="!h-auto !rounded-none !border-0 !bg-transparent !p-0"
                  />
                  <em className="text-right not-italic">
                    {concatOriginalVolume}%
                  </em>
                </label>
                <label className="grid grid-cols-[36px_1fr_40px] items-center gap-2 text-[11px] text-fg-subtle">
                  BGM
                  <Input
                    type="range"
                    min={0}
                    max={100}
                    value={concatBgmVolume}
                    onChange={(event) =>
                      setConcatBgmVolume(Number(event.target.value))
                    }
                    className="!h-auto !rounded-none !border-0 !bg-transparent !p-0"
                  />
                  <em className="text-right not-italic">{concatBgmVolume}%</em>
                </label>
                <label className="grid grid-cols-[36px_1fr_40px] items-center gap-2 text-[11px] text-fg-subtle">
                  旁白
                  <Input
                    type="range"
                    min={0}
                    max={100}
                    value={concatNarrationVolume}
                    onChange={(event) =>
                      setConcatNarrationVolume(Number(event.target.value))
                    }
                    className="!h-auto !rounded-none !border-0 !bg-transparent !p-0"
                  />
                  <em className="text-right not-italic">
                    {concatNarrationVolume}%
                  </em>
                </label>
              </div>
            </div>

            <div className="text-[11px] leading-[1.6] text-fg-subtle">
              按资产列表顺序拼接 {selectedVideos.length} 段视频，统一为 H.264 /
              AAC，输出 MP4
              {concatBgm ? '；背景音乐循环' : ''}
              {concatNarration ? '；旁白混入' : ''}
              {concatSubtitle ? '；字幕烧录进画面' : ''}。
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="secondary"
              disabled={concatBusy}
              onClick={() => setConcatOpen(false)}
            >
              取消
            </Button>
            <Button
              variant="primary"
              disabled={concatBusy}
              onClick={() => void handleConcat()}
            >
              {concatBusy ? '合成中…' : '选择位置并合成'}
            </Button>
          </div>
        </Dialog>
      ) : null}

      {tagTarget ? (
        <Dialog
          open
          onClose={() => setTagTarget(null)}
          bare
          ariaLabel={`标签「${tagTarget.name}」`}
          overlayClassName="fixed inset-0 z-[260] flex items-center justify-center bg-overlay"
          panelClassName={`w-[420px] ${DIALOG_PANEL}`}
        >
          <div className="mb-[14px] text-sm text-fg">
            标签「{tagTarget.name}」
          </div>
          <Input
            className="!mt-[14px] !h-[38px] !rounded-card !border-border-strong !bg-surface-hover !px-2.5 !text-[13px] focus:!border-border-selected"
            value={tagDraft}
            placeholder="多个标签用逗号分隔，例如：人物, 夜景"
            autoFocus
            onChange={(event) => setTagDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void handleSaveTags()
            }}
          />

          <div className="mt-2 text-[11px] leading-[1.6] text-fg-subtle">
            标签保存在资产库根目录的 .tags.json，不修改原文件。
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setTagTarget(null)}>
              取消
            </Button>
            <Button variant="primary" onClick={() => void handleSaveTags()}>
              保存标签
            </Button>
          </div>
        </Dialog>
      ) : null}

      {nameDialog ? (
        <NameDialog
          title={
            nameDialog.kind === 'create-folder'
              ? '新建文件夹'
              : nameDialog.kind === 'rename-folder'
                ? '重命名文件夹'
                : '重命名素材'
          }
          label="名称"
          initial={
            nameDialog.kind === 'create-folder'
              ? ''
              : nameDialog.kind === 'rename-folder'
                ? nameDialog.node.name
                : nameDialog.asset.name
          }
          confirmLabel={nameDialog.kind === 'create-folder' ? '创建' : '保存'}
          onCancel={() => setNameDialog(null)}
          onConfirm={handleConfirmName}
        />
      ) : null}

      {templateDialog ? (
        <TemplateDialog
          initial={templateDialog.name ? templateDialog : null}
          onCancel={() => setTemplateDialog(null)}
          onSave={handleSaveTemplate}
        />
      ) : null}
    </div>,
    document.body
  )
}
