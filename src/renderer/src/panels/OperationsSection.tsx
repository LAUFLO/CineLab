import { useEffect, useMemo, useState } from 'react'
import { VIDEO_OPERATIONS } from '@shared/operation-schema'
import { Select } from '../components/Select'
import { useSettingsStore } from '../stores/settings'

export function OperationsSection() {
  const providers = useSettingsStore((state) => state.providers)
  const bindings = useSettingsStore((state) => state.operationBindings)
  const save = useSettingsStore((state) => state.saveOperationBindings)

  const [draft, setDraft] = useState<Record<string, string>>(bindings)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setDraft(bindings)
  }, [bindings])

  const models = useMemo(
    () =>
      providers.flatMap((provider) =>
        provider.models
          .filter((model) => model.capability === 'video.t2v')
          .map((model) => ({
            key: `${provider.id}/${model.id}`,
            label: `${provider.name} · ${model.name}`,
            hasTemplate: model.adapter === 'http-template' && Boolean(model.template),
            adapter: model.adapter
          }))
      ),
    [providers]
  )

  const hasChanges = JSON.stringify(draft) !== JSON.stringify(bindings)

  const update = (id: string, value: string): void => {
    setMessage(null)
    setDraft((current) => {
      const next = { ...current }
      if (value) next[id] = value
      else delete next[id]
      return next
    })
  }

  const onSave = async (): Promise<void> => {
    setBusy(true)
    try {
      await save(draft)
      setMessage('已保存，节点工具栏会使用绑定的接口')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="settings-section">
      <div className="settings-group-title">操作模型</div>
      <p className="settings-hint">
        为视频节点工具栏的专用操作绑定一个视频模型。只建议绑定使用
        http-template 且支持视频输入的模型；未绑定的操作会提示先配置。
      </p>

      {models.length === 0 ? (
        <div className="settings-empty">
          还没有视频模型。请先在「模型服务」中添加一个视频模型，并在模型模板中配置视频输入。
        </div>
      ) : null}

      <div className="operation-bindings">
        {VIDEO_OPERATIONS.map((operation) => {
          const selected = draft[operation.id] ?? ''
          const model = models.find((item) => item.key === selected)
          return (
            <div className="operation-binding" key={operation.id}>
              <div className="operation-binding__info">
                <div className="operation-binding__name">{operation.label}</div>
                <div className="operation-binding__desc">{operation.description}</div>
                {model && !model.hasTemplate ? (
                  <div className="operation-binding__warn">
                    当前模型没有配置 http-template，无法提交视频输入。
                  </div>
                ) : null}
              </div>
              <Select
                value={selected}
                options={[
                  { value: '', label: '未绑定' },
                  ...models.map((item) => ({
                    value: item.key,
                    label: item.label
                  }))
                ]}
                onChange={(value) => update(operation.id, value)}
              />
            </div>
          )
        })}
      </div>

      <div className="operation-bindings__footer">
        <button
          type="button"
          className="btn-primary"
          disabled={busy || !hasChanges}
          onClick={() => void onSave()}
        >
          {busy ? '保存中…' : '保存绑定'}
        </button>
        {message ? <span className="settings-inline-message">{message}</span> : null}
      </div>
    </div>
  )
}
