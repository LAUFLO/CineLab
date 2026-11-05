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
import { useCanvasStore } from '../../stores/canvas'
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
  const deleteAsset = useLibraryStore((state) => state.deleteAsset)
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
            <button
              type="button"
              className="icon-btn"
              title="在资源管理器中打开资产库"
              onClick={() => void revealRoot()}
            >
              <Icon name="folder" size={14} />
            </button>
            <button type="button" className="icon-btn" title="关闭" onClick={close}>
              <Icon name="close" size={14} />
            </button>
          </div>
        </header>

        <div className="library-window__body">
          <aside className="library-window__side">
            <FolderTree
              tree={tree}
              current={folder}
              onSelect={(path) => void setFolder(path)}
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
              <button type="button" onClick={() => void setFolder('')}>
                全部
              </button>
              {segments.map((segment, index) => {
                const path = segments.slice(0, index + 1).join('/')
                return (
                  <span key={path}>
                    <Icon name="chevron-right" size={10} />
                    <button type="button" onClick={() => void setFolder(path)}>
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
                onAddToCanvas={handleAddToCanvas}
                onExport={handleExport}
                onRename={(asset) =>
                  setNameDialog({ kind: 'rename-asset', asset })
                }
                onDelete={handleDeleteAsset}
                onReveal={(asset) => void reveal(asset.path)}
              />
            ) : null}
          </main>
        </div>

        <footer className="library-window__foot">
          <div className="library-window__foot-left">
            {mode === 'browse' ? (
              <button type="button" className="btn-secondary" onClick={handleImport}>
                <Icon name="plus" size={13} />
                上传
              </button>
            ) : null}
            <button
              type="button"
              className="btn-secondary"
              onClick={() => handleCreateFolder(folder)}
            >
              <Icon name="folder-plus" size={13} />
              新建文件夹
            </button>
            <span className="library-window__count">
              {assets.length} 个素材 · {templates.length} 个模板
            </span>
          </div>

          <div className="library-window__foot-right">
            {mode === 'pick' ? (
              <>
                <button type="button" className="btn-secondary" onClick={close}>
                  取消
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleConfirmAdd}
                  disabled={!folder || pendingAdds.length === 0}
                >
                  加入到这里
                </button>
              </>
            ) : (
              <button type="button" className="btn-secondary" onClick={close}>
                关闭
              </button>
            )}
          </div>
        </footer>
      </div>

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
