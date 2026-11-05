import { useState } from 'react'
import {
  NODE_KINDS,
  NODE_META,
  TITLE_HEIGHT,
  type NodeKind,
  type OutputRef
} from '@shared/canvas-schema'
import type {
  CharacterCard,
  LibraryMaterial,
  PromptTemplate,
  TemplateInput
} from '@shared/library-schema'
import { Icon } from '../components/Icon'
import { useCanvasStore } from '../stores/canvas'
import { useLibraryStore } from '../stores/library'
import { useUIStore } from '../stores/ui'

function assetUrl(path?: string): string | undefined {
  return path ? `cinelab-asset://local/${path}` : undefined
}

function addAssetToCanvas(kind: NodeKind, title: string, asset?: OutputRef): void {
  const store = useCanvasStore.getState()
  const meta = NODE_META[kind]
  const viewport = store.viewport

  const center = {
    x: (window.innerWidth / 2 - viewport.x) / viewport.zoom,
    y: (window.innerHeight / 2 - viewport.y) / viewport.zoom
  }

  const id = store.addNode(kind, {
    x: center.x - meta.width / 2,
    y: center.y - (meta.height + TITLE_HEIGHT) / 2
  })

  store.patchNodeData(id, {
    title,
    ...(asset
      ? {
          status: 'done' as const,
          outputs: [asset],
          selectedOutputId: asset.id
        }
      : {})
  })
}

function characterAsset(card: CharacterCard): OutputRef | undefined {
  const path = card.avatarPath ?? card.referencePaths[0]
  if (!path) return undefined

  return {
    id: `${card.id}-ref-0`,
    path,
    kind: 'image',
    createdAt: card.createdAt,
    model: '角色库'
  }
}

function materialAsset(material: LibraryMaterial): OutputRef {
  return {
    id: material.id,
    path: material.path,
    kind: material.kind,
    createdAt: material.createdAt,
    model: '素材库'
  }
}

interface Draft {
  id?: string
  name: string
  description: string
  referencePaths: string[]
}

export function LibraryPanel() {
  const open = useLibraryStore((state) => state.panelOpen)
  const tab = useLibraryStore((state) => state.tab)
  const characters = useLibraryStore((state) => state.characters)
  const materials = useLibraryStore((state) => state.materials)
  const templates = useLibraryStore((state) => state.templates)
  const loading = useLibraryStore((state) => state.loading)
  const error = useLibraryStore((state) => state.error)
  const close = useLibraryStore((state) => state.closePanel)
  const setTab = useLibraryStore((state) => state.setTab)
  const saveCharacter = useLibraryStore((state) => state.saveCharacter)
  const deleteCharacter = useLibraryStore((state) => state.deleteCharacter)
  const pickImages = useLibraryStore((state) => state.pickCharacterImages)
  const importMaterials = useLibraryStore((state) => state.importMaterials)
  const deleteMaterial = useLibraryStore((state) => state.deleteMaterial)
  const saveTemplate = useLibraryStore((state) => state.saveTemplate)
  const deleteTemplate = useLibraryStore((state) => state.deleteTemplate)
  const applyPrompt = useUIStore((state) => state.applyPrompt)
  const showToast = useUIStore((state) => state.showToast)

  const [draft, setDraft] = useState<Draft | null>(null)
  const [templateDraft, setTemplateDraft] = useState<TemplateInput | null>(null)
  const [templateMessage, setTemplateMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!open) return null

  const addReferences = async (): Promise<void> => {
    if (!draft) return
    setBusy(true)
    const paths = await pickImages()
    setBusy(false)

    if (paths.length > 0) {
      setDraft({
        ...draft,
        referencePaths: [...draft.referencePaths, ...paths]
      })
    }
  }

  const handleSave = async (): Promise<void> => {
    if (!draft) return
    setBusy(true)
    await saveCharacter(draft)
    setBusy(false)
    setDraft(null)
  }

  const handleSaveTemplate = async (): Promise<void> => {
    if (!templateDraft) return
    setBusy(true)
    await saveTemplate(templateDraft)
    setBusy(false)
    setTemplateDraft(null)
  }

  const useTemplate = (template: PromptTemplate): void => {
    const selected = useCanvasStore.getState().nodes.find((node) => node.selected)
    if (!selected) {
      setTemplateMessage('请先在画布中选中一个节点')
      return
    }

    setTemplateMessage(null)
    applyPrompt(template.prompt)
    close()
  }

  const exportMaterial = async (id: string): Promise<void> => {
    const material = materials.find((item) => item.id === id)
    if (!material) return

    const result = await window.api.export.asset(material.path, material.name)
    if (result.ok) {
      showToast(`已导出：${result.path ?? ''}`)
    } else if (!result.canceled) {
      showToast(result.error ?? '导出失败', 'error')
    }
  }

  return (
    <aside
      className="library-panel"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <header className="library-panel__head">
        <span>资产库</span>
        <button type="button" className="icon-btn" onClick={close}>
          <Icon name="close" size={14} />
        </button>
      </header>

        <div className="library-tabs">
          <button
            type="button"
            className={`library-tab ${tab === 'characters' ? 'is-active' : ''}`}
            onClick={() => setTab('characters')}
          >
            角色
          </button>
          <button
            type="button"
            className={`library-tab ${tab === 'materials' ? 'is-active' : ''}`}
            onClick={() => setTab('materials')}
          >
            素材
          </button>
          <button
            type="button"
            className={`library-tab ${tab === 'templates' ? 'is-active' : ''}`}
            onClick={() => setTab('templates')}
          >
            模板
          </button>
        </div>

        <div className="library-panel__body">
          {error ? <div className="form-message is-error">{error}</div> : null}
          {loading ? <div className="provider-list__empty">加载中…</div> : null}

          {tab === 'characters' ? (
            draft ? (
              <div className="provider-form">
                <button
                  type="button"
                  className="provider-form__back"
                  onClick={() => setDraft(null)}
                >
                  ← 返回角色列表
                </button>

                <label className="field">
                  <span>名称</span>
                  <input
                    value={draft.name}
                    onChange={(event) =>
                      setDraft({ ...draft, name: event.target.value })
                    }
                    placeholder="例如：林小雨"
                  />
                </label>

                <label className="field">
                  <span>描述</span>
                  <textarea
                    className="library-textarea"
                    value={draft.description}
                    onChange={(event) =>
                      setDraft({ ...draft, description: event.target.value })
                    }
                    placeholder="外貌、服装、性格等"
                    rows={3}
                  />
                </label>

                <div className="field">
                  <span>参考图</span>
                  <div className="library-refs">
                    {draft.referencePaths.map((path) => (
                      <div key={path} className="library-ref">
                        <img src={assetUrl(path)} alt="" />
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() =>
                            setDraft({
                              ...draft,
                              referencePaths: draft.referencePaths.filter(
                                (item) => item !== path
                              )
                            })
                          }
                        >
                          <Icon name="close" size={10} />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="library-ref-add"
                      onClick={() => void addReferences()}
                      disabled={busy}
                    >
                      <Icon name="plus" size={14} />
                      添加图片
                    </button>
                  </div>
                </div>

                <div className="provider-form__actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setDraft(null)}
                    disabled={busy}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => void handleSave()}
                    disabled={busy}
                  >
                    保存
                  </button>
                </div>
              </div>
            ) : (
              <div className="character-list">
                {characters.map((card) => (
                  <div key={card.id} className="character-card">
                    <div className="character-card__avatar">
                      {card.avatarPath ? (
                        <img src={assetUrl(card.avatarPath)} alt="" />
                      ) : (
                        <Icon name="text" size={18} />
                      )}
                    </div>

                    <div className="character-card__main">
                      <div className="character-card__name">{card.name}</div>
                      <div className="character-card__desc">
                        {card.description || '暂无描述'}
                      </div>
                      <div className="character-card__meta">
                        {card.referencePaths.length} 张参考图
                      </div>
                    </div>

                    <div className="character-card__actions">
                      <button
                        type="button"
                        className="icon-btn"
                        title="添加到画布"
                        onClick={() =>
                          addAssetToCanvas('image', card.name, characterAsset(card))
                        }
                      >
                        <Icon name="plus" size={14} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        title="编辑"
                        onClick={() =>
                          setDraft({
                            id: card.id,
                            name: card.name,
                            description: card.description,
                            referencePaths: card.referencePaths
                          })
                        }
                      >
                        <Icon name="settings" size={14} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        title="删除"
                        onClick={() => void deleteCharacter(card.id)}
                      >
                        <Icon name="close" size={14} />
                      </button>
                    </div>
                  </div>
                ))}

                {characters.length === 0 ? (
                  <div className="library-empty">
                    <Icon name="text" size={26} />
                    <div className="library-empty__title">还没有角色卡</div>
                    <div className="library-empty__desc">
                      创建一个角色，保存参考图，之后可直接添加到画布使用。
                    </div>
                  </div>
                ) : null}

                <button
                  type="button"
                  className="library-add-btn"
                  onClick={() =>
                    setDraft({ name: '', description: '', referencePaths: [] })
                  }
                >
                  <Icon name="plus" size={14} />
                  新建角色
                </button>
              </div>
            )
          ) : tab === 'materials' ? (
            <div className="material-grid">
              {materials.map((material) => (
                <div key={material.id} className="material-card">
                  <div className="material-card__preview">
                    {material.kind === 'image' ? (
                      <img src={assetUrl(material.path)} alt="" />
                    ) : (
                      <Icon name={material.kind} size={22} />
                    )}
                  </div>
                  <div className="material-card__name" title={material.name}>
                    {material.name}
                  </div>
                  <div className="material-card__actions">
                    <button
                      type="button"
                      className="icon-btn"
                      title="添加到画布"
                      onClick={() =>
                        addAssetToCanvas(
                          material.kind,
                          material.name,
                          materialAsset(material)
                        )
                      }
                    >
                      <Icon name="plus" size={13} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      title="导出素材"
                      onClick={() => void exportMaterial(material.id)}
                    >
                      <Icon name="download" size={13} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      title="删除"
                      onClick={() => void deleteMaterial(material.id)}
                    >
                      <Icon name="close" size={13} />
                    </button>
                  </div>
                </div>
              ))}

              {materials.length === 0 ? (
                <div className="library-empty">
                  <Icon name="image" size={26} />
                  <div className="library-empty__title">还没有素材</div>
                  <div className="library-empty__desc">
                    导入图片、视频或音频后会显示在这里。
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                className="library-add-btn"
                onClick={() => void importMaterials()}
              >
                <Icon name="plus" size={14} />
                导入素材
              </button>
            </div>
          ) : (
            <div className="template-pane">
              {templateMessage ? (
                <div className="form-message is-error">{templateMessage}</div>
              ) : null}

              {templateDraft ? (
                <div className="provider-form">
                  <button
                    type="button"
                    className="provider-form__back"
                    onClick={() => setTemplateDraft(null)}
                  >
                    ← 返回模板列表
                  </button>

                  <label className="field">
                    <span>名称</span>
                    <input
                      value={templateDraft.name}
                      onChange={(event) =>
                        setTemplateDraft({
                          ...templateDraft,
                          name: event.target.value
                        })
                      }
                      placeholder="例如：雪夜电影感"
                    />
                  </label>

                  <label className="field">
                    <span>节点类型</span>
                    <select
                      className="library-select"
                      value={templateDraft.kind}
                      onChange={(event) =>
                        setTemplateDraft({
                          ...templateDraft,
                          kind: event.target.value as NodeKind
                        })
                      }
                    >
                      {NODE_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {NODE_META[kind].label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span>提示词</span>
                    <textarea
                      className="library-textarea"
                      rows={5}
                      value={templateDraft.prompt}
                      onChange={(event) =>
                        setTemplateDraft({
                          ...templateDraft,
                          prompt: event.target.value
                        })
                      }
                      placeholder="模板会直接填入 prompt bar"
                    />
                  </label>

                  <div className="provider-form__actions">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setTemplateDraft(null)}
                      disabled={busy}
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => void handleSaveTemplate()}
                      disabled={busy}
                    >
                      保存
                    </button>
                  </div>
                </div>
              ) : (
                <div className="template-list">
                  {templates.map((template) => (
                    <div key={template.id} className="template-card">
                      <div className="template-card__main">
                        <div className="template-card__name">
                          {template.name}
                          <span className="template-card__kind">
                            {NODE_META[template.kind].label}
                          </span>
                        </div>
                        <div className="template-card__prompt">
                          {template.prompt || '暂无提示词'}
                        </div>
                      </div>
                      <div className="template-card__actions">
                        <button
                          type="button"
                          className="icon-btn"
                          title="使用"
                          onClick={() => useTemplate(template)}
                        >
                          <Icon name="arrow-up" size={13} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          title="编辑"
                          onClick={() =>
                            setTemplateDraft({
                              id: template.id,
                              name: template.name,
                              kind: template.kind,
                              prompt: template.prompt
                            })
                          }
                        >
                          <Icon name="settings" size={13} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          title="删除"
                          onClick={() => void deleteTemplate(template.id)}
                        >
                          <Icon name="close" size={13} />
                        </button>
                      </div>
                    </div>
                  ))}

                  {templates.length === 0 ? (
                    <div className="library-empty">
                      <Icon name="text" size={26} />
                      <div className="library-empty__title">还没有模板</div>
                      <div className="library-empty__desc">
                        把常用提示词存成模板，选中节点后一键填入。
                      </div>
                    </div>
                  ) : null}

                  <button
                    type="button"
                    className="library-add-btn"
                    onClick={() => {
                      setTemplateMessage(null)
                      setTemplateDraft({ name: '', kind: 'image', prompt: '' })
                    }}
                  >
                    <Icon name="plus" size={14} />
                    新建模板
                  </button>
                </div>
              )}
            </div>
          )}
      </div>
    </aside>
  )
}
