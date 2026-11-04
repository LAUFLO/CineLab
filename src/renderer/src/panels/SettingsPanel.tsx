import { useEffect, useState } from 'react'
import {
  CAPABILITY_LABEL,
  MODEL_PRESETS,
  type ModelDef,
  type ProviderConfig,
  type ProviderInput
} from '@shared/provider-schema'
import { Icon } from '../components/Icon'
import { useSettingsStore } from '../stores/settings'

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

export function SettingsPanel() {
  const open = useSettingsStore((state) => state.panelOpen)
  const close = useSettingsStore((state) => state.closePanel)
  const providers = useSettingsStore((state) => state.providers)
  const load = useSettingsStore((state) => state.load)
  const save = useSettingsStore((state) => state.save)
  const remove = useSettingsStore((state) => state.remove)
  const test = useSettingsStore((state) => state.test)

  const [draft, setDraft] = useState<ProviderInput | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  if (!open) return null

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

  return (
    <div className="settings-overlay" onPointerDown={close}>
      <aside
        className="settings-panel"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="settings-panel__head">
          <span>设置</span>
          <button type="button" className="icon-btn" onClick={close}>
            <Icon name="close" size={14} />
          </button>
        </header>

        <div className="settings-panel__body">
          {draft ? (
            <div className="provider-form">
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
          ) : (
            <div className="provider-list">
              {providers.map((provider) => (
                <div key={provider.id} className="provider-card">
                  <div className="provider-card__main">
                    <div className="provider-card__name">{provider.name}</div>
                    <div className="provider-card__meta">{provider.baseUrl}</div>
                    <div className="provider-card__meta">
                      {provider.models.length} 个模型 · {provider.hasKey ? 'Key 已保存' : '未设置 Key'}
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
          )}
        </div>
      </aside>
    </div>
  )
}
