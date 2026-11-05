import { useEffect, useState } from 'react'
import {
  CAPABILITY_LABEL,
  MODEL_PRESETS,
  type ModelDef,
  type ProviderConfig,
  type ProviderInput
} from '@shared/provider-schema'
import { Icon, type IconName } from '../components/Icon'
import { useSettingsStore } from '../stores/settings'

type SectionId = 'models' | 'appearance' | 'shortcuts' | 'about'

interface SectionDef {
  id: SectionId
  label: string
  icon: IconName
}

const SECTIONS: SectionDef[] = [
  { id: 'models', label: '模型服务', icon: 'settings' },
  { id: 'appearance', label: '外观', icon: 'sun' },
  { id: 'shortcuts', label: '快捷键', icon: 'help' },
  { id: 'about', label: '关于', icon: 'logo' }
]

function emptyDraft(): ProviderInput {
  return {
    name: '',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    models: []
  }
}

function toDraft(provider: ProviderConfig): ProviderInput {
  return {
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    apiKey: '',
    models: provider.models
  }
}

function ModelsSection() {
  const providers = useSettingsStore((state) => state.providers)
  const load = useSettingsStore((state) => state.load)
  const save = useSettingsStore((state) => state.save)
  const remove = useSettingsStore((state) => state.remove)
  const test = useSettingsStore((state) => state.test)

  const [draft, setDraft] = useState<ProviderInput | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    void load()
  }, [load])

  const updateField = <K extends keyof ProviderInput>(
    key: K,
    value: ProviderInput[K]
  ): void => {
    setDraft((current) => (current ? { ...current, [key]: value } : current))
  }

  const addModel = (model: ModelDef): void => {
    setDraft((current) => {
      if (!current) return current
      if (current.models.some((item) => item.id === model.id)) return current
      return { ...current, models: [...current.models, model] }
    })
  }

  const removeModel = (id: string): void => {
    setDraft((current) =>
      current
        ? { ...current, models: current.models.filter((model) => model.id !== id) }
        : current
    )
  }

  const handleSave = async (): Promise<void> => {
    if (!draft) return
    if (!draft.name.trim() || !draft.baseUrl.trim()) {
      setMessage({ ok: false, text: '名称和 Base URL 不能为空' })
      return
    }

    setBusy(true)
    setMessage(null)
    try {
      await save(draft)
      setDraft(null)
      setMessage({ ok: true, text: '已保存' })
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
        baseUrl: draft.baseUrl,
        apiKey: draft.apiKey
      })
      setMessage({ ok: result.ok, text: result.message })
    } catch (error) {
      setMessage({ ok: false, text: String(error) })
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (id: string): Promise<void> => {
    setBusy(true)
    try {
      await remove(id)
    } finally {
      setBusy(false)
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
          <span>Base URL</span>
          <input
            value={draft.baseUrl}
            onChange={(event) => updateField('baseUrl', event.target.value)}
            placeholder="https://api.example.com/v1"
          />
        </label>

        <label className="field">
          <span>API Key{draft.id ? '（留空则不修改）' : ''}</span>
          <input
            type="password"
            value={draft.apiKey ?? ''}
            onChange={(event) => updateField('apiKey', event.target.value)}
            placeholder="sk-..."
          />
        </label>

        <div className="field">
          <span>模型</span>
          <div className="model-list">
            {draft.models.map((model) => (
              <div key={model.id} className="model-item">
                <div>
                  <div className="model-item__name">{model.name}</div>
                  <div className="model-item__meta">
                    {CAPABILITY_LABEL[model.capability]} · {model.remoteModel}
                  </div>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => removeModel(model.id)}
                >
                  <Icon name="close" size={12} />
                </button>
              </div>
            ))}
            {draft.models.length === 0 ? (
              <div className="model-list__empty">还没有添加模型</div>
            ) : null}
          </div>
        </div>

        <div className="field">
          <span>快速添加</span>
          <div className="preset-list">
            {MODEL_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="preset-chip"
                onClick={() => addModel(preset)}
                disabled={draft.models.some((model) => model.id === preset.id)}
              >
                {preset.name}
              </button>
            ))}
          </div>
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
      </div>
    )
  }

  return (
    <div className="settings-section">
      <div className="provider-list">
        {providers.map((provider) => (
          <div key={provider.id} className="provider-card">
            <div className="provider-card__main">
              <div className="provider-card__name">{provider.name}</div>
              <div className="provider-card__meta">{provider.baseUrl}</div>
              <div className="provider-card__meta">
                {provider.models.length} 个模型 ·{' '}
                {provider.hasKey ? 'Key 已保存' : '未设置 Key'}
              </div>
            </div>
            <div className="provider-card__actions">
              <button
                type="button"
                className="icon-btn"
                onClick={() => setDraft(toDraft(provider))}
              >
                <Icon name="settings" size={14} />
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={() => void handleDelete(provider.id)}
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
            添加一个 OpenAI 兼容接口即可开始。
          </div>
        ) : null}

        <button
          type="button"
          className="btn-primary btn-block"
          onClick={() => {
            setMessage(null)
            setDraft(emptyDraft())
          }}
        >
          + 添加供应商
        </button>
      </div>
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

function AboutSection() {
  return (
    <div className="settings-section">
      <div className="settings-group-title">CineLab</div>
      <p className="settings-placeholder">
        本地 AI 创作无限画布。模型完全自定义，数据存在你自己的硬盘上。
      </p>
      <div className="about-row">
        <span>版本</span>
        <code>0.1.0</code>
      </div>
      <div className="about-row">
        <span>仓库</span>
        <code>github.com/LAUFLO/CineLab</code>
      </div>
      <div className="about-row">
        <span>协议</span>
        <code>MIT</code>
      </div>
    </div>
  )
}

export function SettingsPanel() {
  const open = useSettingsStore((state) => state.panelOpen)
  const close = useSettingsStore((state) => state.closePanel)
  const [active, setActive] = useState<SectionId>('models')

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
                <Icon name={section.icon} size={15} />
                <span>{section.label}</span>
              </button>
            ))}
          </nav>

          <div className="settings-content">
            {active === 'models' ? <ModelsSection /> : null}
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
