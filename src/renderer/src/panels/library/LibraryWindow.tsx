import { useState } from 'react'
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
import { Button, Dialog, IconButton, Input } from '../../components/ui'
import { isGroupNode, useCanvasStore } from '../../stores/canvas'
import { useLibraryStore } from '../../stores/library'
import { useUIStore } from '../../stores/ui'
import { AssetGrid } from './AssetGrid'
import { FolderTree } from './FolderTree'
import { NameDialog } from './NameDialog'
import { TemplateDialog } from './TemplateDialog'
import { TemplateGrid } from './TemplateGrid'

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

function addAssetToCanvas(asset: LibraryAsset): void {
  const store = useCanvasStore.getState()
  const kind: NodeKind =
    asset.kind === 'video' ? 'video' : asset.kind === 'audio' ? 'audio' : 'image'
  const meta = NODE_META[kind]
  const { viewport } = store
  const center = {
    x: (window.innerWidth / 2 - viewport.x) / viewport.zoom,
    y: (window.innerHeight / 2 - viewport.y) / viewport.zoom
  }

  const id = store.addNode(kind, {
    x: center.x - meta.width / 2,
    y: center.y - (meta.height + TITLE_HEIGHT) / 2
  })

  const output = toOutput(asset)
  store.patchNodeData(id, {
    title: asset.name,
    status: 'done',
    outputs: [output],
    selectedOutputId: output.id
  })
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
    if (node.type === 'cine') store.patchNodeData(node.id, { outputs: nextOutputs })
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

  const applyPrompt = useUIStore((state) => state.applyPrompt)
  const showToast = useUIStore((state) => state.showToast)
  const requestConfirm = useUIStore((state) => state.requestConfirm)

  const [query, setQuery] = useState('')
  const [nameDialog, setNameDialog] = useState<NameDialogState>(null)
  const [templateDialog, setTemplateDialog] = useState<TemplateInput | null>(null)
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

  const selectedAssets = assets.filter((asset) =>
    selectedPaths.has(asset.path)
  )
  const selectedVideos = selectedAssets.filter(
    (asset) => asset.kind === 'video'
  )
  const canConcat =
    selectedVideos.length >= 2 &&
    selectedVideos.length === selectedAssets.length

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
        else if (!result.canceled) showToast(result.error ?? '导出失败', 'error')
      })
  }

  const handleAddToCanvas = (asset: LibraryAsset): void => {
    addAssetToCanvas(asset)
    showToast(`已添加到画布：${asset.name}`)
    close()
  }

  const handleImport = (): void => {
    void importAssets().then((imported) => {
      if (imported.length > 0) showToast(`已导入 ${imported.length} 个素材`)
    })
  }

  const handleUseTemplate = (template: PromptTemplate): void => {
    applyPrompt(template.prompt)
    showToast(`已套用模板：${template.name}`)
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
    <div className="library-layer" onPointerDown={close}>
      <div className="library-window" onPointerDown={(event) => event.stopPropagation()}>
        <header className="library-window__head">
          <div className="library-window__title">
            <Icon name="library" size={16} />
            <span>{mode === 'pick' ? '选择要加入的文件夹' : '资产库'}</span>
            {mode === 'pick' && pendingAdds.length > 0 ? (
              <span className="library-window__subject">
                ·{' '}
                {pendingAdds.length === 1
                  ? pendingAdds[0].name
                  : `${pendingAdds.length} 个素材`}
              </span>
            ) : null}
          </div>

          <div className="library-window__head-actions">
            <div className="library-search">
              <Icon name="search" size={13} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索当前文件夹"
              />
            </div>
            {mode === 'browse' && !isTemplateFolder ? (
              <Button
                variant="secondary"
                size="sm"
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

        <div className="library-window__body">
          <aside className="library-window__side">
            <FolderTree
              tree={tree}
              current={folder}
              onSelect={handleSelectFolder}
              onCreate={handleCreateFolder}
              onRename={(node) =>
                setNameDialog({ kind: 'rename-folder', node })
              }
              onDelete={handleDeleteFolder}
            />
            <div className="library-window__root" title={root}>
              {root}
            </div>
          </aside>

          <main className="library-window__main">
            <div className="library-breadcrumb">
              <button type="button" onClick={() => handleSelectFolder('')}>
                全部
              </button>
              {segments.map((segment, index) => {
                const path = segments.slice(0, index + 1).join('/')
                return (
                  <span key={path}>
                    <Icon name="chevron-right" size={10} />
                    <button type="button" onClick={() => handleSelectFolder(path)}>
                      {segment}
                    </button>
                  </span>
                )
              })}
            </div>

            {error ? <div className="form-message is-error">{error}</div> : null}
            {loading ? <div className="library-loading">加载中…</div> : null}

            {!loading && isTemplateFolder ? (
              <TemplateGrid
                templates={templates}
                query={query}
                onUse={handleUseTemplate}
                onEdit={(template) => setTemplateDialog(template)}
                onDelete={handleDeleteTemplate}
                onCreate={() =>
                  setTemplateDialog({ name: '', kind: 'image', prompt: '' })
                }
              />
            ) : null}

            {!loading && !isTemplateFolder ? (
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

        <footer className="library-window__foot">
          <div className="library-window__foot-left">
            {selectionMode ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setSelectedPaths(new Set(assets.map((asset) => asset.path)))
                  }
                >
                  全选
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setSelectedPaths(new Set())}
                >
                  清空
                </Button>
                <span className="library-window__count">
                  已选 {selectedAssets.length} 个
                </span>
              </>
            ) : (
              <>
                {mode === 'browse' ? (
                  <Button variant="secondary" onClick={handleImport}>
                    <Icon name="plus" size={13} />
                    上传
                  </Button>
                ) : null}
                <Button
                  variant="secondary"
                  onClick={() => handleCreateFolder(folder)}
                >
                  <Icon name="folder-plus" size={13} />
                  新建文件夹
                </Button>
                <span className="library-window__count">
                  {assets.length} 个素材 · {templates.length} 个模板
                </span>
              </>
            )}
          </div>

          <div className="library-window__foot-right">
            {selectionMode ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
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
                  size="sm"
                  disabled={!canConcat}
                  onClick={() => setConcatOpen(true)}
                >
                  合成视频
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={selectedAssets.length === 0}
                  onClick={handleBatchDelete}
                >
                  删除
                </Button>
                <Button
                  variant="primary"
                  size="sm"
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
                <Button variant="secondary" onClick={close}>
                  取消
                </Button>
                <Button
                  variant="primary"
                  onClick={handleConfirmAdd}
                  disabled={!folder || pendingAdds.length === 0}
                >
                  加入到这里
                </Button>
              </>
            ) : (
              <Button variant="secondary" onClick={close}>
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
          title={
            moveTargets.length === 1
              ? `移动「${moveTargets[0].name}」到`
              : `移动 ${moveTargets.length} 个素材到`
          }
          size="md"
          footer={
            <>
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
            </>
          }
        >
          <div className="library-move-tree">
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
        </Dialog>
      ) : null}

      {concatOpen ? (
        <Dialog
          open
          onClose={() => setConcatOpen(false)}
          title="合成视频"
          size="lg"
          footer={
            <>
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
            </>
          }
        >
          <div className="concat-form">
              <div className="concat-form__row">
                <span>分辨率</span>
                <div className="concat-form__options">
                  {(['720p', '1080p'] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={concatResolution === value ? 'is-active' : ''}
                      onClick={() => setConcatResolution(value)}
                    >
                      {value === '720p' ? '720P' : '1080P'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="concat-form__row">
                <span>画质</span>
                <div className="concat-form__options">
                  {(
                    [
                      ['standard', '标准'],
                      ['high', '高画质']
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={concatQuality === value ? 'is-active' : ''}
                      onClick={() => setConcatQuality(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="concat-form__row">
                <span>字幕</span>
                <div className="concat-form__file">
                  <button
                    type="button"
                    onClick={() =>
                      void window.api.export
                        .pickFile('subtitle')
                        .then((path) => path && setConcatSubtitle(path))
                    }
                  >
                    {concatSubtitle ? '更换 SRT' : '选择 SRT'}
                  </button>
                  <span title={concatSubtitle ?? ''}>
                    {concatSubtitle
                      ? concatSubtitle.split(/[\\/]/).pop()
                      : '无（可选）'}
                  </span>
                  {concatSubtitle ? (
                    <button
                      type="button"
                      onClick={() => setConcatSubtitle(null)}
                    >
                      清除
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="concat-form__row">
                <span>背景音乐</span>
                <div className="concat-form__file">
                  <button
                    type="button"
                    onClick={() =>
                      void window.api.export
                        .pickFile('audio')
                        .then((path) => path && setConcatBgm(path))
                    }
                  >
                    {concatBgm ? '更换音频' : '选择音频'}
                  </button>
                  <span title={concatBgm ?? ''}>
                    {concatBgm
                      ? concatBgm.split(/[\\/]/).pop()
                      : '无（可选）'}
                  </span>
                  {concatBgm ? (
                    <button type="button" onClick={() => setConcatBgm(null)}>
                      清除
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="concat-form__row">
                <span>旁白</span>
                <div className="concat-form__file">
                  <button
                    type="button"
                    onClick={() =>
                      void window.api.export
                        .pickFile('audio')
                        .then((path) => path && setConcatNarration(path))
                    }
                  >
                    {concatNarration ? '更换音频' : '选择音频'}
                  </button>
                  <span title={concatNarration ?? ''}>
                    {concatNarration
                      ? concatNarration.split(/[\\/]/).pop()
                      : '无（可选）'}
                  </span>
                  {concatNarration ? (
                    <button
                      type="button"
                      onClick={() => setConcatNarration(null)}
                    >
                      清除
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="concat-form__row">
                <span>音量</span>
                <div className="concat-form__volumes">
                  <label>
                    原声
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={concatOriginalVolume}
                      onChange={(event) =>
                        setConcatOriginalVolume(Number(event.target.value))
                      }
                    />
                    <em>{concatOriginalVolume}%</em>
                  </label>
                  <label>
                    BGM
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={concatBgmVolume}
                      onChange={(event) =>
                        setConcatBgmVolume(Number(event.target.value))
                      }
                    />
                    <em>{concatBgmVolume}%</em>
                  </label>
                  <label>
                    旁白
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={concatNarrationVolume}
                      onChange={(event) =>
                        setConcatNarrationVolume(Number(event.target.value))
                      }
                    />
                    <em>{concatNarrationVolume}%</em>
                  </label>
                </div>
              </div>

              <div className="concat-form__hint">
                按资产列表顺序拼接 {selectedVideos.length} 段视频，统一为 H.264 /
                AAC，输出 MP4
                {concatBgm ? '；背景音乐循环' : ''}
                {concatNarration ? '；旁白混入' : ''}
                {concatSubtitle ? '；字幕烧录进画面' : ''}。
              </div>
          </div>
        </Dialog>
      ) : null}

      {tagTarget ? (
        <Dialog
          open
          onClose={() => setTagTarget(null)}
          title={`标签「${tagTarget.name}」`}
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setTagTarget(null)}>
                取消
              </Button>
              <Button variant="primary" onClick={() => void handleSaveTags()}>
                保存标签
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3">
            <Input
              value={tagDraft}
              placeholder="多个标签用逗号分隔，例如：人物, 夜景"
              autoFocus
              onChange={(event) => setTagDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void handleSaveTags()
              }}
            />

            <div className="tag-hint">
              标签保存在资产库根目录的 .tags.json，不修改原文件。
            </div>
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
