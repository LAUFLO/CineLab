import { useEffect, useState } from 'react'
import {
  CAPABILITY_LABEL,
  MEDIA_INPUT_LABEL,
  modelInputs,
  type MediaInput,
  type ModelDef,
  type ProviderConfig,
  type ProviderInput
} from '@shared/provider-schema'
import type { ModelsConfigStatus } from '@shared/models-file'
import { PROVIDER_PRESETS, providerPresetModels } from '@shared/provider-presets'
import type { UpdateStatus } from '@shared/update'
import { BrandIcon, BrandWordmark } from '../components/Brand'
import { Icon, type IconName } from '../components/Icon'
import { Select } from '../components/Select'
import { useSettingsStore } from '../stores/settings'
import { useLibraryStore } from '../stores/library'
import { useUIStore } from '../stores/ui'
import { useUpdateStore } from '../stores/update'
import { ComponentsSection } from './ComponentsSection'
import { GeneralSettingsSection } from './GeneralSettingsSection'
import { OperationsSection } from './OperationsSection'
import { ModelParamsDialog } from '../canvas/nodes/ModelParamsDialog'
import { ModelInputsDialog } from '../canvas/nodes/ModelInputsDialog'

type SectionId =
  | 'general'
  | 'models'
  | 'operations'
  | 'library'
  | 'components'
  | 'appearance'
  | 'shortcuts'
  | 'about'

interface SectionDef {
  id: SectionId
  label: string
  icon: IconName
}

const SECTIONS: SectionDef[] = [
  { id: 'general', label: '通用', icon: 'settings' },
  { id: 'models', label: '模型服务', icon: 'robot' },
  { id: 'operations', label: '操作模型', icon: 'film' },
  { id: 'library', label: '资产库', icon: 'library' },
  { id: 'components', label: '组件', icon: 'layers' },
  { id: 'appearance', label: '外观', icon: 'sun' },
  { id: 'shortcuts', label: '快捷键', icon: 'help' },
  { id: 'about', label: '关于', icon: 'logo' }
]

function emptyDraft(
  preset?: (typeof PROVIDER_PRESETS)[number]
): ProviderInput {
  return {
    name: preset?.name ?? '',
    type: preset?.type ?? 'openai-compat',
    baseUrl: preset?.baseUrl ?? 'https://api.openai.com/v1',
    headers: {},
    apiKey: '',
    models: preset ? providerPresetModels(preset) : []
  }
}

function toDraft(provider: ProviderConfig): ProviderInput {
  return {
    id: provider.id,
    type: provider.type,
    name: provider.name,
    baseUrl: provider.baseUrl,
    headers: provider.headers ?? {},
    apiKey: '',
    models: provider.models
  }
}

function inferCapability(remoteModel: string): ModelDef['capability'] {
  const value = remoteModel.toLowerCase()
  if (/(tts|audio|music|speech|voice)/.test(value)) return 'audio.tts'
  if (
    /(video|veo|kling|seedance|sora|hailuo|vidu|cogvideo|wan2|runway)/.test(value)
  ) {
    return 'video.t2v'
  }
  if (
    /(image|dall-e|dalle|flux|stable-diffusion|midjourney|imagen|seedream|gpt-image|moss)/.test(
      value
    )
  ) {
    return 'image.t2i'
  }
  return 'text.chat'
}

function remoteModelId(remoteModel: string): string {
  const slug = remoteModel
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `remote_${slug || 'model'}`
}

function ModelsSection() {
  const providers = useSettingsStore((state) => state.providers)
  const load = useSettingsStore((state) => state.load)
  const save = useSettingsStore((state) => state.save)
  const remove = useSettingsStore((state) => state.remove)
  const test = useSettingsStore((state) => state.test)
  const requestConfirm = useUIStore((state) => state.requestConfirm)
  const showToast = useUIStore((state) => state.showToast)

  const [draft, setDraft] = useState<ProviderInput | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [config, setConfig] = useState<ModelsConfigStatus | null>(null)
  const [remoteModels, setRemoteModels] = useState<string[]>([])
  const [fetching, setFetching] = useState(false)
  const [manualModel, setManualModel] = useState('')
  const [headerRows, setHeaderRows] = useState<
    Array<{ key: string; value: string }>
  >([])
  const [paramModel, setParamModel] = useState<ModelDef | null>(null)
  const [inputsModel, setInputsModel] = useState<ModelDef | null>(null)

  useEffect(() => {
    void load()
    void window.api.settings.modelsConfig().then(setConfig)
  }, [load])

  useEffect(() => {
    return window.api.settings.onModelsChanged(() => {
      void load()
      void window.api.settings.modelsConfig().then(setConfig)
    })
  }, [load])

  useEffect(() => {
    setRemoteModels([])
  }, [draft?.id])

  const updateField = <K extends keyof ProviderInput>(
    key: K,
    value: ProviderInput[K]
  ): void => {
    setDraft((current) => (current ? { ...current, [key]: value } : current))
  }

  const openDraft = (next: ProviderInput | null): void => {
    setDraft(next)
    setHeaderRows(
      next
        ? Object.entries(next.headers ?? {}).map(([key, value]) => ({
            key,
            value
          }))
        : []
    )
  }

  const rowsToHeaders = (
    rows: Array<{ key: string; value: string }>
  ): Record<string, string> =>
    Object.fromEntries(
      rows
        .map((row) => [row.key.trim(), row.value] as const)
        .filter(([key]) => key.length > 0)
    )

  const updateHeaderRow = (
    index: number,
    patch: Partial<{ key: string; value: string }>
  ): void => {
    const next = headerRows.map((row, rowIndex) =>
      rowIndex === index ? { ...row, ...patch } : row
    )
    setHeaderRows(next)
    updateField('headers', rowsToHeaders(next))
  }

  const addHeaderRow = (): void => {
    setHeaderRows((current) => [...current, { key: '', value: '' }])
  }

  const removeHeaderRow = (index: number): void => {
    const next = headerRows.filter((_, rowIndex) => rowIndex !== index)
    setHeaderRows(next)
    updateField('headers', rowsToHeaders(next))
  }

  const addModel = (model: ModelDef): void => {
    setDraft((current) => {
      if (!current) return current
      if (current.models.some((item) => item.id === model.id)) return current
      return { ...current, models: [...current.models, model] }
    })
  }

  const removeModel = (id: string): void => {
    const model = draft?.models.find((item) => item.id === id)
    if (!model) return

    requestConfirm({
      title: '删除模型',
      message: `确定从「${draft?.name || '当前供应商'}」移除「${model.name}」吗？保存后生效。`,
      confirmLabel: '删除',
      danger: true,
      onConfirm: () => {
        setDraft((current) =>
          current
            ? {
                ...current,
                models: current.models.filter((item) => item.id !== id)
              }
            : current
        )
      }
    })
  }

  const addRemoteModel = (remoteModel: string): void => {
    const model: ModelDef = {
      id: remoteModelId(remoteModel),
      name: remoteModel,
      remoteModel,
      capability: inferCapability(remoteModel),
      params: []
    }
    addModel(model)
  }

  const addManualModel = (): void => {
    const value = manualModel.trim()
    if (!value) return
    addRemoteModel(value)
    setManualModel('')
  }

  const handleFetchModels = async (): Promise<void> => {
    if (!draft) return
    if (!draft.baseUrl.trim()) {
      setMessage({ ok: false, text: '请先填写 Base URL' })
      return
    }
    if (!draft.apiKey?.trim() && !draft.id) {
      setMessage({ ok: false, text: '请先填写 API Key' })
      return
    }

    setFetching(true)
    setMessage(null)
    try {
      const result = await window.api.settings.fetchModels({
        id: draft.id,
        type: draft.type,
        baseUrl: draft.baseUrl,
        headers: draft.headers,
        apiKey: draft.apiKey,
        secretKey: draft.secretKey
      })
      setRemoteModels(result.models)
      setMessage({ ok: result.ok, text: result.message })
    } catch (error) {
      setMessage({ ok: false, text: String(error) })
    } finally {
      setFetching(false)
    }
  }

  const handleSave = async (): Promise<void> => {
    if (!draft) return
    if (!draft.name.trim() || !draft.baseUrl.trim()) {
      setMessage({ ok: false, text: '名称和 Base URL 不能为空' })
      return
    }

    const firstProvider = providers.length === 0
    setBusy(true)
    setMessage(null)
    try {
      await save(draft)
      setConfig(await window.api.settings.modelsConfig())
      openDraft(null)
      setMessage({ ok: true, text: '已保存' })
      if (firstProvider) {
        showToast('模型配置完成，回到画布开始创作')
      }
    } catch (error) {
      setMessage({ ok: false, text: String(error) })
    } finally {
      setBusy(false)
    }
  }

  const handleTest = async (): Promise<void> => {
    if (!draft) return
    setBusy(true)
    setMessage(null)
    try {
      const result = await test({
        id: draft.id,
        type: draft.type,
        baseUrl: draft.baseUrl,
        headers: draft.headers,
        apiKey: draft.apiKey,
        secretKey: draft.secretKey
      })
      setMessage({ ok: result.ok, text: result.message })
    } catch (error) {
      setMessage({ ok: false, text: String(error) })
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = (id: string): void => {
    const provider = providers.find((item) => item.id === id)
    if (!provider) return

    requestConfirm({
      title: '删除供应商',
      message: `确定删除「${provider.name}」吗？该供应商下的 ${provider.models.length} 个模型会一起移除，此操作不可撤销。`,
      confirmLabel: '删除',
      danger: true,
      onConfirm: async () => {
        setBusy(true)
        try {
          await remove(id)
          setConfig(await window.api.settings.modelsConfig())
        } finally {
          setBusy(false)
        }
      }
    })
  }

  const handleOpenModelsFile = async (): Promise<void> => {
    try {
      const file = await window.api.settings.openModelsFile()
      setConfig(await window.api.settings.modelsConfig())
      setMessage({ ok: true, text: `已打开 ${file}` })
    } catch (error) {
      setMessage({ ok: false, text: String(error) })
    }
  }

  const handleReload = async (): Promise<void> => {
    try {
      await load()
      setConfig(await window.api.settings.modelsConfig())
      setMessage({ ok: true, text: '已重新加载模型配置' })
    } catch (error) {
      setMessage({ ok: false, text: String(error) })
    }
  }

  if (draft) {
    return (
      <div className="settings-section">
        <button
          type="button"
          className="provider-form__back"
          onClick={() => setDraft(null)}
        >
          ← 返回列表
        </button>

        <label className="field">
          <span>名称</span>
          <input
            value={draft.name}
            onChange={(event) => updateField('name', event.target.value)}
            placeholder="例如：我的中转站"
          />
        </label>

        <label className="field">
          <span>类型</span>
          <Select
            value={draft.type ?? 'openai-compat'}
            options={[
              { value: 'openai-compat', label: 'OpenAI 兼容' },
              { value: 'kling', label: '可灵' }
            ]}
            onChange={(next) => updateField('type', next)}
            disabled={Boolean(draft.id)}
          />
        </label>

        <label className="field">
          <span>Base URL</span>
          <input
            value={draft.baseUrl}
            onChange={(event) => updateField('baseUrl', event.target.value)}
            placeholder="https://api.example.com/v1"
          />
        </label>

        <label className="field">
          <span>
            {draft.type === 'kling' ? 'Access Key / API Key' : 'API Key'}
            {draft.id ? '（留空则不修改）' : ''}
          </span>
          <input
            type="password"
            value={draft.apiKey ?? ''}
            onChange={(event) => updateField('apiKey', event.target.value)}
            placeholder={draft.type === 'kling' ? 'Access Key 或 API Key' : 'sk-...'}
          />
        </label>

        {draft.type === 'kling' ? (
          <label className="field">
            <span>
              Secret Key（填了则生成 JWT，留空使用 API Key）
              {draft.id ? '（留空则不修改）' : ''}
            </span>
            <input
              type="password"
              value={draft.secretKey ?? ''}
              onChange={(event) => updateField('secretKey', event.target.value)}
              placeholder="可灵 Secret Key"
            />
          </label>
        ) : null}

        <div className="field">
          <div className="field__head">
            <span>自定义请求头</span>
            <button
              type="button"
              className="btn-secondary btn-small"
              onClick={addHeaderRow}
            >
              + 添加
            </button>
          </div>
          {headerRows.length === 0 ? (
            <div className="field__hint">
              可选。部分服务需要固定请求头；值支持 {'${ENV_NAME}'} 环境变量。
            </div>
          ) : (
            <div className="header-list">
              {headerRows.map((row, index) => (
                <div className="header-row" key={index}>
                  <input
                    value={row.key}
                    placeholder="Header 名称"
                    onChange={(event) =>
                      updateHeaderRow(index, { key: event.target.value })
                    }
                  />
                  <input
                    value={row.value}
                    placeholder="值，支持 ${ENV_NAME}"
                    onChange={(event) =>
                      updateHeaderRow(index, { value: event.target.value })
                    }
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    title="删除请求头"
                    onClick={() => removeHeaderRow(index)}
                  >
                    <Icon name="close" size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="field">
          <div className="field__head">
            <span>模型</span>
            <button
              type="button"
              className="btn-secondary btn-small"
              onClick={() => void handleFetchModels()}
              disabled={fetching || busy}
            >
              {fetching ? '获取中…' : '获取模型列表'}
            </button>
          </div>
          <div className="model-list">
            {draft.models.map((model) => (
              <div key={model.id} className="model-item">
                <div>
                  <div className="model-item__name">{model.name}</div>
                  <div className="model-item__meta">
                    {CAPABILITY_LABEL[model.capability]} · 输入{' '}
                    {modelInputs(model)
                      .map((input) => MEDIA_INPUT_LABEL[input])
                      .join('/')}{' '}
                    · {model.remoteModel}
                    {model.params.length > 0
                      ? ` · ${model.params.length} 个参数`
                      : ''}
                  </div>
                </div>
                <div className="model-item__actions">
                  <button
                    type="button"
                    className="icon-btn"
                    title="输入能力"
                    onClick={() => setInputsModel(model)}
                  >
                    <Icon name="layers" size={13} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title="配置参数"
                    onClick={() => setParamModel(model)}
                  >
                    <Icon name="settings" size={13} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title="删除模型"
                    onClick={() => removeModel(model.id)}
                  >
                    <Icon name="close" size={12} />
                  </button>
                </div>
              </div>
            ))}
            {draft.models.length === 0 ? (
              <div className="model-list__empty">还没有添加模型</div>
            ) : null}
          </div>

          <div className="manual-model">
            <input
              value={manualModel}
              placeholder="没有想要的模型？手动输入模型 ID"
              onChange={(event) => setManualModel(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  addManualModel()
                }
              }}
            />
            <button
              type="button"
              className="btn-secondary btn-small"
              onClick={addManualModel}
            >
              添加
            </button>
          </div>

          {remoteModels.length > 0 ? (
            <div className="remote-models">
              {remoteModels.map((remote) => {
                const added = draft.models.some(
                  (model) => model.remoteModel === remote
                )
                return (
                  <button
                    key={remote}
                    type="button"
                    className={`remote-model-chip ${added ? 'is-added' : ''}`}
                    disabled={added}
                    title={added ? '已添加' : `添加 ${remote}`}
                    onClick={() => addRemoteModel(remote)}
                  >
                    {remote}
                  </button>
                )
              })}
            </div>
          ) : null}
        </div>

        {message ? (
          <div className={`form-message ${message.ok ? 'is-ok' : 'is-error'}`}>
            {message.text}
          </div>
        ) : null}

        <div className="provider-form__actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void handleTest()}
            disabled={busy}
          >
            测试连接
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

        <ModelParamsDialog
          model={paramModel}
          onCancel={() => setParamModel(null)}
          onSave={(params) => {
            if (!paramModel) return
            setDraft((current) =>
              current
                ? {
                    ...current,
                    models: current.models.map((item) =>
                      item.id === paramModel.id
                        ? { ...item, params }
                        : item
                    )
                  }
                : current
            )
            setParamModel(null)
          }}
        />

        <ModelInputsDialog
          model={inputsModel}
          onCancel={() => setInputsModel(null)}
          onSave={(inputs: MediaInput[]) => {
            if (!inputsModel) return
            setDraft((current) =>
              current
                ? {
                    ...current,
                    models: current.models.map((item) =>
                      item.id === inputsModel.id
                        ? { ...item, inputs }
                        : item
                    )
                  }
                : current
            )
            setInputsModel(null)
          }}
        />
      </div>
    )
  }

  return (
    <div className="settings-section">
      {config ? (
        <div className="models-config">
          <div className="models-config__head">
            <div>
              <div className="models-config__title">模型供应商配置</div>
              <div
                className="models-config__path"
                title={config.activeFile ?? ''}
              >
                {config.activeFile ?? '未找到配置文件'}
              </div>
            </div>
            <div className="models-config__actions">
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => void handleReload()}
              >
                重新加载
              </button>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => void handleOpenModelsFile()}
              >
                打开文件
              </button>
            </div>
          </div>
          <div className="models-config__meta">
            {config.providerCount} 个供应商 · {config.modelCount} 个模型
          </div>
          {config.warnings.length > 0 ? (
            <div className="models-config__warnings">
              {config.warnings.map((warning, index) => (
                <div key={index}>{warning}</div>
              ))}
            </div>
          ) : null}
          {config.errors.length > 0 ? (
            <div className="models-config__errors">
              {config.errors.map((error, index) => (
                <div key={index}>{error}</div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="provider-list">
        {providers.map((provider) => (
          <div key={provider.id} className="provider-card">
            <div className="provider-card__main">
              <div className="provider-card__name">{provider.name}</div>
              <div className="provider-card__meta">{provider.baseUrl}</div>
              <div className="provider-card__meta">
                {provider.models.length} 个模型 ·{' '}
                {provider.hasKey ? 'Key 已保存' : '未设置 Key'}
                {provider.hasSecret ? ' · Secret 已保存' : ''}
                {provider.type === 'kling' ? ' · 可灵' : ''}
              </div>
            </div>
            <div className="provider-card__actions">
              <button
                type="button"
                className="icon-btn"
                onClick={() => openDraft(toDraft(provider))}
              >
                <Icon name="settings" size={14} />
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={() => handleDelete(provider.id)}
                disabled={busy}
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          </div>
        ))}

        {providers.length === 0 ? (
          <div className="provider-list__empty">
            还没有配置模型供应商。
            <br />
            可以从下方快速预设开始，或手动添加。
          </div>
        ) : null}

        <div className="provider-presets">
          <div className="provider-presets__label">快速预设</div>
          <div className="provider-presets__grid">
            {PROVIDER_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="provider-preset"
                onClick={() => {
                  setMessage(null)
                  openDraft(emptyDraft(preset))
                }}
              >
                <span className="provider-preset__name">{preset.name}</span>
                <span className="provider-preset__desc">{preset.description}</span>
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="btn-primary btn-block"
          onClick={() => {
            setMessage(null)
            openDraft(emptyDraft())
          }}
        >
          + 添加供应商
        </button>
      </div>
    </div>
  )
}

function LibrarySection() {
  const root = useLibraryStore((state) => state.root)
  const isDefault = useLibraryStore((state) => state.isDefault)
  const chooseRoot = useLibraryStore((state) => state.chooseRoot)
  const resetRoot = useLibraryStore((state) => state.resetRoot)
  const revealRoot = useLibraryStore((state) => state.revealRoot)
  const refresh = useLibraryStore((state) => state.refresh)

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <div className="settings-section">
      <div className="settings-group-title">全局资产库</div>
      <p className="settings-hint">
        所有项目共用这个文件夹。删除项目不会删除资产库，图片、视频和提示词模板都可以跨项目使用。
        建议选择空目录，应用会自动创建「角色 / 场景 / 道具 / 风格 / 音频 / 提示词」。
      </p>

      <div className="library-root-card">
        <code>{root || '加载中…'}</code>
      </div>

      <div className="settings-actions">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => void chooseRoot()}
        >
          选择文件夹
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => void revealRoot()}
        >
          打开目录
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => void resetRoot()}
          disabled={isDefault}
        >
          恢复默认
        </button>
      </div>

      <p className="settings-hint">
        默认路径是「文档 / CineLab Assets」。可以直接在资源管理器里整理文件夹和文件，应用以磁盘内容为准。
      </p>
    </div>
  )
}

function AppearanceSection() {
  const [mode, setMode] = useState<'light' | 'dark' | 'system'>(() => {
    const saved = localStorage.getItem('cinelab.theme.v1')
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'dark'
  })

  const apply = (next: 'light' | 'dark' | 'system'): void => {
    setMode(next)
    localStorage.setItem('cinelab.theme.v1', next)

    const resolved =
      next === 'system'
        ? window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark'
        : next

    document.documentElement.dataset.theme = resolved
    void window.api.app.setTheme(next)
  }

  return (
    <div className="settings-section">
      <div className="settings-group-title">主题</div>
      <div className="theme-options">
        {[
          { id: 'dark', label: '深色', hint: '默认主题' },
          { id: 'light', label: '浅色', hint: '明亮环境使用' },
          { id: 'system', label: '跟随系统', hint: '随系统外观切换' }
        ].map((option) => (
          <button
            key={option.id}
            type="button"
            className={`theme-option ${mode === option.id ? 'is-active' : ''}`}
            onClick={() => apply(option.id as 'light' | 'dark' | 'system')}
          >
            <span className="theme-option__label">{option.label}</span>
            <span className="theme-option__hint">{option.hint}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function PlaceholderSection({ title, description }: { title: string; description: string }) {
  return (
    <div className="settings-section">
      <div className="settings-group-title">{title}</div>
      <p className="settings-placeholder">{description}</p>
    </div>
  )
}

function updateLabel(status: UpdateStatus | null): string {
  if (!status) return '正在读取更新状态…'
  switch (status.state) {
    case 'checking':
      return '正在检查更新…'
    case 'not-available':
      return '已是最新版本'
    case 'available':
      return `发现新版本 ${status.latestVersion ?? ''}`
    case 'downloading':
      return `正在下载 ${status.percent ?? 0}%`
    case 'downloaded':
      return `新版本 ${status.latestVersion ?? ''} 已下载`
    case 'error':
      return status.error ?? '检查更新失败'
    case 'unsupported':
      return '当前构建不支持自动更新'
    default:
      return '尚未检查更新'
  }
}

function AboutSection() {
  const [version, setVersion] = useState('—')
  const status = useUpdateStore((state) => state.status)
  const check = useUpdateStore((state) => state.check)
  const download = useUpdateStore((state) => state.download)
  const install = useUpdateStore((state) => state.install)

  useEffect(() => {
    void window.api.app.getInfo().then((info) => setVersion(info.version))
  }, [])

  const busy = status?.state === 'checking' || status?.state === 'downloading'
  const canCheck = status?.canCheck ?? false

  return (
    <div className="settings-section">
      <BrandWordmark height={20} className="settings-about__wordmark" />
      <p className="settings-placeholder">
        本地 AI 创作无限画布。模型完全自定义，数据存在你自己的硬盘上。
      </p>
      <div className="about-row">
        <span>版本</span>
        <code>{version}</code>
      </div>
      <div className="about-row">
        <span>仓库</span>
        <code>github.com/LAUFLO/CineLab</code>
      </div>
      <div className="about-row">
        <span>协议</span>
        <code>MIT</code>
      </div>
      <div className="about-row">
        <span>日志</span>
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={() => void window.api.app.openLogs()}
        >
          打开日志目录
        </button>
      </div>

      <div className="update-card">
        <div className="update-card__head">
          <span className="update-card__title">软件更新</span>
          <button
            type="button"
            className="btn-secondary btn-sm"
            disabled={!canCheck || busy}
            onClick={() => void check()}
          >
            {status?.state === 'checking' ? '检查中…' : '检查更新'}
          </button>
        </div>
        <div
          className={`update-card__status ${
            status?.state === 'error' ? 'is-error' : ''
          }`}
        >
          {updateLabel(status)}
        </div>
        {status?.state === 'downloading' ? (
          <div className="update-card__bar">
            <div
              className="update-card__bar-fill"
              style={{ width: `${status.percent ?? 0}%` }}
            />
          </div>
        ) : null}
        {status?.state === 'available' ? (
          <button
            type="button"
            className="btn-primary btn-sm update-card__action"
            onClick={() => void download()}
          >
            下载更新
          </button>
        ) : null}
        {status?.state === 'downloaded' ? (
          <button
            type="button"
            className="btn-primary btn-sm update-card__action"
            onClick={() => void install()}
          >
            重启并安装
          </button>
        ) : null}
        {status?.releaseNotes ? (
          <div className="update-card__notes">{status.releaseNotes}</div>
        ) : null}
      </div>
    </div>
  )
}

export function SettingsPanel() {
  const open = useSettingsStore((state) => state.panelOpen)
  const close = useSettingsStore((state) => state.closePanel)
  const [active, setActive] = useState<SectionId>('general')
  const panelSection = useSettingsStore((state) => state.panelSection)

  useEffect(() => {
    if (panelSection) setActive(panelSection as SectionId)
  }, [panelSection])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, close])

  if (!open) return null

  return (
    <div className="settings-overlay" onPointerDown={close}>
      <div
        className="settings-dialog"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="settings-dialog__head">
          <span>设置</span>
          <button
            type="button"
            className="icon-btn settings-dialog__close"
            onClick={close}
            title="关闭"
          >
            <Icon name="close" size={14} />
          </button>
        </header>

        <div className="settings-dialog__body">
          <nav className="settings-nav">
            {SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                className={`settings-nav__item ${
                  active === section.id ? 'is-active' : ''
                }`}
                onClick={() => setActive(section.id)}
              >
                {section.id === 'about' ? (
                  <BrandIcon size={15} />
                ) : (
                  <Icon name={section.icon} size={15} />
                )}
                <span>{section.label}</span>
              </button>
            ))}
          </nav>

          <div className="settings-content">
            {active === 'general' ? <GeneralSettingsSection /> : null}
            {active === 'models' ? <ModelsSection /> : null}
            {active === 'operations' ? <OperationsSection /> : null}
            {active === 'library' ? <LibrarySection /> : null}
            {active === 'components' ? <ComponentsSection /> : null}
            {active === 'appearance' ? <AppearanceSection /> : null}
            {active === 'shortcuts' ? (
              <PlaceholderSection
                title="快捷键"
                description="V 选择工具，F 框选，Delete 删除，Ctrl+Z 撤销，Ctrl+S 保存，Esc 取消。更多快捷键说明将在后续版本补充。"
              />
            ) : null}
            {active === 'about' ? <AboutSection /> : null}
          </div>
        </div>
      </div>
    </div>
  )
}
