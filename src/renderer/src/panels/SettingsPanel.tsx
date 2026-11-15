import { useEffect, useState } from 'react'
import {
  CAPABILITY_LABEL,
  MEDIA_INPUT_LABEL,
  modelInputs,
  modelModeIds,
  modelOperations,
  type ModelDef,
  type ModelFeature,
  type ProviderConfig,
  type ProviderInput
} from '@shared/provider-schema'
import { MODEL_MODE_LABEL } from '@shared/model-modes'
import { findProtocolTemplate } from '@shared/protocol-templates'
import type {
  ModelsConfigStatus,
  ModelsFileProvider
} from '@shared/models-file'
import { VIDEO_OPERATIONS } from '@shared/operation-schema'
import {
  HOT_PROVIDER_IDS,
  PROVIDER_PRESETS,
  recommendedModelsForPreset,
  type ProviderPreset
} from '@shared/provider-presets'
import type { UpdateStatus } from '@shared/update'
import { BrandIcon, BrandWordmark } from '../components/Brand'
import { Icon, type IconName } from '../components/Icon'

import { useSettingsStore } from '../stores/settings'
import { useLibraryStore } from '../stores/library'
import { useUIStore } from '../stores/ui'
import { useUpdateStore } from '../stores/update'
import { ComponentsSection } from './ComponentsSection'
import { GeneralSettingsSection } from './GeneralSettingsSection'
import { SkillsSection } from './SkillsSection'
import { ModelConfigDialog } from '../canvas/nodes/ModelConfigDialog'
import type { ModelConfigValue } from '../canvas/nodes/ModelConfigDialog'
import { Button, Dialog, IconButton, Input, Select } from '../components/ui'

type SectionId =
  | 'general'
  | 'models'
  | 'skills'
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

const FEATURE_LABEL: Record<ModelFeature, string> = {
  sequential: '组图',
  layer: '图层',
  ocr: 'OCR',
  rgba: '透明',
  audio: '音频',
  'last-frame': '尾帧',
  'multi-shot': '多镜头',
  mask: '蒙版'
}

const SECTIONS: SectionDef[] = [
  { id: 'general', label: '通用', icon: 'settings' },
  { id: 'models', label: '模型服务', icon: 'robot' },
  { id: 'skills', label: '技能', icon: 'sparkles' },
  { id: 'library', label: '资产库', icon: 'library' },
  { id: 'components', label: '组件', icon: 'layers' },
  { id: 'appearance', label: '外观', icon: 'sun' },
  { id: 'shortcuts', label: '快捷键', icon: 'help' },
  { id: 'about', label: '关于', icon: 'logo' }
]

function emptyDraft(preset?: ProviderPreset): ProviderInput {
  return {
    name: preset?.name ?? '',
    type: preset?.type ?? 'openai-compat',
    baseUrl: preset?.baseUrl ?? 'https://api.openai.com/v1',
    headers: {},
    apiKey: '',
    models: []
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
    /(video|veo|kling|seedance|sora|hailuo|vidu|cogvideo|wan2|runway)/.test(
      value
    )
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

interface PendingModelsState {
  file: string
  exists: boolean
  providers: ModelsFileProvider[]
  errors: string[]
  warnings: string[]
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
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null
  )
  const [config, setConfig] = useState<ModelsConfigStatus | null>(null)
  const [remoteModels, setRemoteModels] = useState<string[]>([])
  const [fetching, setFetching] = useState(false)
  const [manualModel, setManualModel] = useState('')
  const [headerRows, setHeaderRows] = useState<
    Array<{ key: string; value: string }>
  >([])
  const [configModel, setConfigModel] = useState<ModelDef | null>(null)
  const [skillDialogOpen, setSkillDialogOpen] = useState(false)
  const [skillPath, setSkillPath] = useState('')
  const [pending, setPending] = useState<PendingModelsState | null>(null)
  const [pendingOpen, setPendingOpen] = useState(false)

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
    void window.api.settings.pendingModels().then(setPending)
    return window.api.settings.onModelsPending(() => {
      void window.api.settings.pendingModels().then(setPending)
    })
  }, [])

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
    setRemoteModels([])
    setManualModel('')
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

  const handleDownloadSkill = async (): Promise<void> => {
    try {
      const result = await window.api.settings.downloadModelSkill()
      if (result.canceled || !result.path) return
      setSkillPath(result.path)
      setSkillDialogOpen(true)
    } catch (error) {
      setMessage({ ok: false, text: String(error) })
    }
  }

  const skillPrompt = skillPath
    ? `读取这份 SKILL.md：${skillPath}\n按里面的规则帮我在 CineLab 中配置模型。官方文档：<粘贴链接>\n配置写完后告诉我改了哪些模型、来源和需要确认的项。`
    : ''

  const copySkillPrompt = async (): Promise<void> => {
    try {
      await window.api.settings.copyText(skillPrompt)
      showToast('提示词已复制')
    } catch (error) {
      setMessage({ ok: false, text: String(error) })
    }
  }

  const handleApplyPending = async (): Promise<void> => {
    try {
      const result = await window.api.settings.applyPendingModels()
      if (!result.applied) {
        setMessage({ ok: false, text: result.message ?? '应用失败' })
        return
      }
      setPendingOpen(false)
      setPending(await window.api.settings.pendingModels())
      await load()
      setConfig(await window.api.settings.modelsConfig())
      showToast('模型配置已应用')
    } catch (error) {
      setMessage({ ok: false, text: String(error) })
    }
  }

  const handleDiscardPending = async (): Promise<void> => {
    try {
      await window.api.settings.discardPendingModels()
      setPendingOpen(false)
      setPending(await window.api.settings.pendingModels())
    } catch (error) {
      setMessage({ ok: false, text: String(error) })
    }
  }

  const activePreset = draft
    ? PROVIDER_PRESETS.find(
        (preset) =>
          preset.baseUrl.replace(/\/+$/, '') ===
          draft.baseUrl.trim().replace(/\/+$/, '')
      )
    : undefined
  const recommendedModels = activePreset
    ? recommendedModelsForPreset(activePreset.id)
    : []

  if (draft) {
    return (
      <div className="flex flex-col">
        <Button
          type="button"
          variant="ghost"
          size="none"
          className="sticky top-0 z-[8] -ml-2.5 mb-3.5 self-start rounded-lg bg-surface px-2.5 py-1.5 text-xs text-fg-muted hover:text-fg"
          onClick={() => setDraft(null)}
        >
          ← 返回列表
        </Button>

        <div className="-mt-1 mb-3 flex gap-3 text-[11px] text-fg-subtle">
          <span className="text-link">1 连接</span>
          <span className={draft.models.length > 0 ? 'text-link' : ''}>
            2 选模型
          </span>
          <span>3 保存</span>
        </div>

        <label className="mb-3.5 flex flex-col gap-1.5">
          <span className="text-xs text-fg-muted">名称</span>
          <Input
            value={draft.name}
            onChange={(event) => updateField('name', event.target.value)}
            placeholder="例如：我的中转站"
            className="!h-[34px] !rounded-lg border-border bg-surface-hover !px-2.5 !text-[13px] focus:border-border-strong"
          />
        </label>

        <label className="mb-3.5 flex flex-col gap-1.5">
          <span className="text-xs text-fg-muted">类型</span>
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

        <label className="mb-3.5 flex flex-col gap-1.5">
          <span className="text-xs text-fg-muted">Base URL</span>
          <Input
            value={draft.baseUrl}
            onChange={(event) => updateField('baseUrl', event.target.value)}
            placeholder="https://api.example.com/v1"
            className="!h-[34px] !rounded-lg border-border bg-surface-hover !px-2.5 !text-[13px] focus:border-border-strong"
          />
        </label>

        <label className="mb-3.5 flex flex-col gap-1.5">
          <span className="text-xs text-fg-muted">
            {draft.type === 'kling' ? 'Access Key / API Key' : 'API Key'}
            {draft.id ? '（留空则不修改）' : ''}
          </span>
          <Input
            type="password"
            value={draft.apiKey ?? ''}
            onChange={(event) => updateField('apiKey', event.target.value)}
            placeholder={
              draft.type === 'kling' ? 'Access Key 或 API Key' : 'sk-...'
            }
            className="!h-[34px] !rounded-lg border-border bg-surface-hover !px-2.5 !text-[13px] focus:border-border-strong"
          />
          {activePreset?.keyHelpUrl ? (
            <div className="text-[11px] leading-[1.6] text-fg-subtle">
              Key 获取地址：{activePreset.keyHelpUrl}
            </div>
          ) : null}
        </label>

        {draft.type === 'kling' ? (
          <label className="mb-3.5 flex flex-col gap-1.5">
            <span className="text-xs text-fg-muted">
              Secret Key（填了则生成 JWT，留空使用 API Key）
              {draft.id ? '（留空则不修改）' : ''}
            </span>
            <Input
              type="password"
              value={draft.secretKey ?? ''}
              onChange={(event) => updateField('secretKey', event.target.value)}
              placeholder="可灵 Secret Key"
              className="!h-[34px] !rounded-lg border-border bg-surface-hover !px-2.5 !text-[13px] focus:border-border-strong"
            />
          </label>
        ) : null}

        <div className="mb-3.5 flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-fg-muted">自定义请求头</span>
            <Button
              type="button"
              variant="secondary"
              size="xs"
              onClick={addHeaderRow}
            >
              + 添加
            </Button>
          </div>
          {headerRows.length === 0 ? (
            <div className="text-[11px] leading-[1.6] text-fg-subtle">
              可选。部分服务需要固定请求头；值支持 {'${ENV_NAME}'} 环境变量。
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {headerRows.map((row, index) => (
                <div className="flex items-center gap-1.5" key={index}>
                  <Input
                    value={row.key}
                    placeholder="Header 名称"
                    onChange={(event) =>
                      updateHeaderRow(index, { key: event.target.value })
                    }
                    className="!h-8 min-w-0 flex-1 !rounded-[7px] border-border-strong bg-surface-hover !px-2 !text-xs focus:border-border-selected"
                  />
                  <Input
                    value={row.value}
                    placeholder="值，支持 ${ENV_NAME}"
                    onChange={(event) =>
                      updateHeaderRow(index, { value: event.target.value })
                    }
                    className="!h-8 min-w-0 flex-1 !rounded-[7px] border-border-strong bg-surface-hover !px-2 !text-xs focus:border-border-selected"
                  />
                  <IconButton
                    label="删除请求头"
                    size="sm"
                    onClick={() => removeHeaderRow(index)}
                  >
                    <Icon name="close" size={12} />
                  </IconButton>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mb-3.5 flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-fg-muted">模型</span>
            <Button
              type="button"
              variant="secondary"
              size="xs"
              onClick={() => void handleFetchModels()}
              disabled={fetching || busy}
            >
              {fetching ? '获取中…' : '获取模型列表'}
            </Button>
          </div>
          <div className="flex flex-col gap-1.5">
            {draft.models.map((model) => (
              <div
                key={model.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-2"
              >
                <div>
                  <div className="text-[13px] text-fg">{model.name}</div>
                  <div className="mt-0.5 text-[11px] text-fg-subtle">
                    {modelModeIds(model)
                      .slice(0, 3)
                      .map((id) => MODEL_MODE_LABEL[id])
                      .join(' · ') || CAPABILITY_LABEL[model.capability]}{' '}
                    · 输入{' '}
                    {modelInputs(model)
                      .map((input) => MEDIA_INPUT_LABEL[input])
                      .join('/')}{' '}
                    · 接口 ID：{model.remoteModel}
                    {modelOperations(model).length > 0
                      ? ` · 操作 ${modelOperations(model)
                          .map(
                            (id) =>
                              VIDEO_OPERATIONS.find((op) => op.id === id)
                                ?.label ?? id
                          )
                          .join('/')}`
                      : ''}
                    {model.params.length > 0
                      ? ` · 参数 ${model.params
                          .slice(0, 3)
                          .map((param) => param.label)
                          .join(' · ')}${model.params.length > 3 ? ' 等' : ''}`
                      : ''}
                  </div>
                  <div className="mt-[5px] flex flex-wrap gap-1">
                    {model.features?.map((feature) => (
                      <span
                        className="rounded-full bg-surface px-1.5 py-px text-[10px] leading-4 text-fg-subtle"
                        key={feature}
                      >
                        {FEATURE_LABEL[feature]}
                      </span>
                    ))}
                    {findProtocolTemplate(model.protocol)?.status ? (
                      <span
                        className={`rounded-full px-1.5 py-px text-[10px] leading-4 ${
                          findProtocolTemplate(model.protocol)?.status ===
                          'requires-adapter'
                            ? 'border border-[color-mix(in_srgb,var(--danger)_40%,var(--border))] text-danger'
                            : findProtocolTemplate(model.protocol)?.status ===
                                'draft'
                              ? 'border border-border text-fg-muted'
                              : 'bg-surface text-fg-subtle'
                        }`}
                      >
                        {findProtocolTemplate(model.protocol)?.status === 'draft'
                          ? '未验证'
                          : findProtocolTemplate(model.protocol)?.status ===
                              'requires-adapter'
                            ? '需适配'
                            : '可用'}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-0.5">
                  <IconButton
                    label="模型配置"
                    size="sm"
                    onClick={() => setConfigModel(model)}
                  >
                    <Icon name="settings" size={13} />
                  </IconButton>
                  <IconButton
                    label="删除模型"
                    size="sm"
                    onClick={() => removeModel(model.id)}
                  >
                    <Icon name="close" size={12} />
                  </IconButton>
                </div>
              </div>
            ))}
            {draft.models.length === 0 ? (
              <div className="p-2 text-xs text-fg-subtle">
                还没有添加模型。填好 Key 后点「获取模型列表」，或点击下方推荐。
              </div>
            ) : null}
            {recommendedModels.length > 0 ? (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-fg-subtle">推荐</span>
                {recommendedModels.map((model) => {
                  const added = draft.models.some(
                    (item) => item.id === model.id
                  )
                  return (
                    <Button
                      key={model.id}
                      type="button"
                      variant="ghost"
                      size="none"
                      className={`h-[26px] rounded-full border border-border px-2.5 text-xs ${
                        added
                          ? 'cursor-default text-fg-muted opacity-45'
                          : 'text-fg-muted hover:border-border-strong hover:text-fg'
                      }`}
                      disabled={added}
                      title={added ? '已添加' : `添加 ${model.name}`}
                      onClick={() => addModel(model)}
                    >
                      {model.name}
                    </Button>
                  )
                })}
              </div>
            ) : null}
          </div>

          <div className="flex gap-2">
            <Input
              value={manualModel}
              placeholder="没有想要的模型？手动输入模型 ID"
              onChange={(event) => setManualModel(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  addManualModel()
                }
              }}
              className="!h-[34px] min-w-0 flex-1 !rounded-lg border-border bg-surface-hover !px-2.5 !text-[13px] focus:border-border-strong"
            />
            <Button
              type="button"
              variant="secondary"
              size="xs"
              className="!h-[34px] !px-4"
              onClick={addManualModel}
            >
              添加
            </Button>
          </div>

          {remoteModels.length > 0 ? (
            <div className="mt-0.5 flex max-h-[150px] flex-wrap gap-1.5 overflow-y-auto">
              {remoteModels.map((remote) => {
                const added = draft.models.some(
                  (model) => model.remoteModel === remote
                )
                return (
                  <Button
                    key={remote}
                    type="button"
                    variant="ghost"
                    size="none"
                    className={`h-[26px] rounded-full border border-border px-2.5 text-xs ${
                      added
                        ? 'cursor-default text-fg-muted opacity-45'
                        : 'text-fg-muted hover:border-border-strong hover:text-fg'
                    }`}
                    disabled={added}
                    title={added ? '已添加' : `添加 ${remote}`}
                    onClick={() => addRemoteModel(remote)}
                  >
                    {remote}
                  </Button>
                )
              })}
            </div>
          ) : null}
        </div>

        {message ? (
          <div
            className={`mb-3 break-all rounded-md px-2.5 py-2 text-xs leading-[1.6] ${
              message.ok
                ? 'bg-[rgba(34,197,94,0.08)] text-success'
                : 'bg-[rgba(239,68,68,0.08)] text-danger'
            }`}
          >
            {message.text}
          </div>
        ) : null}

        <div className="mt-2 flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => void handleTest()}
            disabled={busy}
          >
            测试连接
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => void handleSave()}
            disabled={busy}
          >
            保存
          </Button>
        </div>

        <ModelConfigDialog
          model={configModel}
          onCancel={() => setConfigModel(null)}
          onSave={(value: ModelConfigValue) => {
            if (!configModel) return
            setDraft((current) =>
              current
                ? {
                    ...current,
                    models: current.models.map((item) =>
                      item.id === configModel.id ? { ...item, ...value } : item
                    )
                  }
                : current
            )
            setConfigModel(null)
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {config ? (
        <div className="mb-3 rounded-[10px] border border-border bg-surface-raised p-3">
          <div className="flex items-start justify-between gap-2.5">
            <div>
              <div className="mb-[3px] text-[13px] text-fg">
                模型供应商配置
              </div>
              <div className="mt-[3px] text-[11px] text-fg-subtle">
                {config.providerCount} 个供应商 · {config.modelCount} 个模型
              </div>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void handleDownloadSkill()}
              >
                下载配置 Skill
              </Button>
              <details className="relative">
                <summary className="inline-flex h-7 cursor-pointer list-none items-center rounded-lg border border-border px-2.5 text-xs text-fg-muted [&::-webkit-details-marker]:hidden">
                  高级
                </summary>
                <div className="absolute right-0 top-[calc(100%+6px)] z-20 w-80 rounded-[10px] border border-border bg-surface p-2.5 shadow-menu">
                  <div
                    className="break-all text-[11px] leading-[1.5] text-fg-subtle"
                    title={config.activeFile ?? ''}
                  >
                    {config.activeFile ?? '未找到配置文件'}
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => void handleReload()}
                    >
                      重新加载
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => void handleOpenModelsFile()}
                    >
                      打开文件
                    </Button>
                  </div>
                </div>
              </details>
            </div>
          </div>
          {pending?.exists ? (
            <div className="mt-2.5 flex items-center justify-between gap-2.5 rounded-[10px] border border-[color-mix(in_srgb,var(--link)_35%,var(--border))] bg-[color-mix(in_srgb,var(--link)_8%,transparent)] px-3 py-2.5">
              <div>
                <div className="text-xs text-fg">发现新的模型配置</div>
                <div className="mt-0.5 text-[11px] text-fg-subtle">
                  {pending.providers.length} 个供应商 ·{' '}
                  {pending.providers.reduce(
                    (sum, provider) => sum + provider.models.length,
                    0
                  )}{' '}
                  个模型
                </div>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setPendingOpen(true)}
                >
                  预览并应用
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleDiscardPending()}
                >
                  忽略
                </Button>
              </div>
            </div>
          ) : null}
          {config.warnings.length > 0 ? (
            <div className="mt-2 break-all rounded-lg border border-border bg-surface px-2.5 py-2 text-[11px] leading-[1.6] text-fg-muted">
              {config.warnings.map((warning, index) => (
                <div key={index}>{warning}</div>
              ))}
            </div>
          ) : null}
          {config.errors.length > 0 ? (
            <div className="mt-2 break-all rounded-lg bg-[rgba(239,68,68,0.08)] px-2.5 py-2 text-[11px] leading-[1.6] text-danger">
              {config.errors.map((error, index) => (
                <div key={index}>{error}</div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div>
        {providers.map((provider) => (
          <div
            key={provider.id}
            className="mb-2.5 flex items-start justify-between gap-2 rounded-[10px] border border-border bg-surface-raised p-3"
          >
            <div>
              <div className="mb-1 text-[13px] text-fg">{provider.name}</div>
              <div className="break-all text-[11px] leading-[1.6] text-fg-subtle">
                {provider.baseUrl}
              </div>
              <div className="break-all text-[11px] leading-[1.6] text-fg-subtle">
                {provider.models.length} 个模型 ·{' '}
                {provider.hasKey ? 'Key 已保存' : '未设置 Key'}
                {provider.hasSecret ? ' · Secret 已保存' : ''}
                {provider.type === 'kling' ? ' · 可灵' : ''}
              </div>
            </div>
            <div className="flex shrink-0 gap-0.5">
              <IconButton
                label="编辑供应商"
                size="sm"
                onClick={() => openDraft(toDraft(provider))}
              >
                <Icon name="settings" size={14} />
              </IconButton>
              <IconButton
                label="删除供应商"
                size="sm"
                onClick={() => handleDelete(provider.id)}
                disabled={busy}
              >
                <Icon name="close" size={14} />
              </IconButton>
            </div>
          </div>
        ))}

        {providers.length === 0 ? (
          <div className="px-2 py-6 text-center text-xs leading-[1.8] text-fg-subtle">
            <div>第一次配置模型？按三步来：</div>
            <ol className="mt-2 list-decimal pl-[18px] text-left text-[11px] leading-[1.8] text-fg-subtle">
              <li>选一个热门供应商</li>
              <li>填 API Key（预设会显示获取地址）</li>
              <li>点「获取模型列表」，勾选要用的模型</li>
            </ol>
          </div>
        ) : null}

        <div className="mt-[18px] flex flex-col gap-2">
          <div className="text-[11px] text-fg-subtle">热门供应商</div>
          <div className="flex flex-wrap gap-1.5">
            {PROVIDER_PRESETS.filter((preset) =>
              HOT_PROVIDER_IDS.has(preset.id)
            ).map((preset) => (
              <Button
                key={preset.id}
                type="button"
                variant="ghost"
                size="none"
                className="h-7 rounded-full border border-border bg-surface-hover px-2.5 text-xs text-fg-muted hover:border-link hover:text-fg"
                title={preset.description}
                onClick={() => {
                  setMessage(null)
                  openDraft(emptyDraft(preset))
                }}
              >
                {preset.name}
              </Button>
            ))}
          </div>
          <details className="mt-0.5 text-[11px] text-fg-subtle">
            <summary className="cursor-pointer">更多供应商</summary>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PROVIDER_PRESETS.filter(
                (preset) => !HOT_PROVIDER_IDS.has(preset.id)
              ).map((preset) => (
                <Button
                  key={preset.id}
                  type="button"
                  variant="ghost"
                  size="none"
                  className="h-7 rounded-full border border-border bg-surface-hover px-2.5 text-xs text-fg-muted hover:border-link hover:text-fg"
                  title={preset.description}
                  onClick={() => {
                    setMessage(null)
                    openDraft(emptyDraft(preset))
                  }}
                >
                  {preset.name}
                </Button>
              ))}
            </div>
          </details>
        </div>

        <Button
          type="button"
          variant="primary"
          className="mt-2 w-full"
          onClick={() => {
            setMessage(null)
            openDraft(emptyDraft())
          }}
        >
          + 添加供应商
        </Button>
      </div>

      <Dialog
        open={pendingOpen}
        onClose={() => setPendingOpen(false)}
        title="预览新的模型配置"
        size="lg"
      >
        <div className="flex flex-col gap-2.5">
          {pending?.errors.length ? (
            <div className="break-all rounded-lg bg-[rgba(239,68,68,0.08)] px-2.5 py-2 text-[11px] leading-[1.6] text-danger">
              {pending.errors.map((error, index) => (
                <div key={index}>{error}</div>
              ))}
            </div>
          ) : null}
          {pending?.providers.map((provider) => (
            <div
              className="rounded-[10px] border border-border bg-surface-hover p-2.5"
              key={provider.id}
            >
              <div className="text-[13px] text-fg">{provider.name}</div>
              <div className="mt-0.5 text-[11px] text-fg-subtle">
                {provider.baseUrl}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {provider.models.map((model) => (
                  <span
                    className="rounded-full bg-surface px-2 py-0.5 text-[11px] text-fg-muted"
                    key={model.id}
                  >
                    {model.name ?? model.id}
                    {model.modes?.length
                      ? ` · ${model.modes.length} 个模式`
                      : ''}
                  </span>
                ))}
              </div>
            </div>
          ))}
          <div className="mt-1 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => void handleDiscardPending()}
            >
              忽略
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => void handleApplyPending()}
              disabled={Boolean(pending?.errors.length)}
            >
              应用配置
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={skillDialogOpen}
        onClose={() => setSkillDialogOpen(false)}
        title="配置 Skill 已下载"
        size="md"
        panelClassName="model-skill-dialog"
      >
        <div className="break-all rounded-lg bg-surface-hover px-2.5 py-2 text-[11px] text-fg-muted">
          {skillPath}
        </div>
        <ol className="my-3 list-decimal pl-[18px] text-xs leading-[1.9] text-fg-muted">
          <li>
            把文件交给任意 AI Agent（OpenCode / Claude Code / Cursor /
            ChatGPT）。
          </li>
          <li>附上下面的提示词，让 Agent 读文档并生成配置。</li>
          <li>回到 CineLab，模型配置会自动重新加载。</li>
        </ol>
        <pre className="m-0 max-h-[180px] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-hover px-3 py-2.5 font-[inherit] text-[11px] leading-[1.7] text-fg-muted">
          {skillPrompt}
        </pre>
        <div className="mt-3 flex justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={() => void copySkillPrompt()}
          >
            复制提示词
          </Button>
        </div>
      </Dialog>
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
    <div className="flex flex-col">
      <div className="mb-3 text-[13px] font-semibold text-fg">全局资产库</div>
      <p className="mt-2 text-xs leading-[1.7] text-fg-subtle">
        所有项目共用这个文件夹。删除项目不会删除资产库，图片、视频和提示词模板都可以跨项目使用。
        建议选择空目录，应用会自动创建「角色 / 场景 / 道具 / 风格 / 音频 /
        提示词」。
      </p>

      <div className="mt-3.5 overflow-hidden rounded-lg border border-border bg-surface-raised px-3 py-2.5">
        <code className="block overflow-hidden text-ellipsis whitespace-nowrap text-[11.5px] text-fg-muted">
          {root || '加载中…'}
        </code>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => void chooseRoot()}
        >
          选择文件夹
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void revealRoot()}
        >
          打开目录
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void resetRoot()}
          disabled={isDefault}
        >
          恢复默认
        </Button>
      </div>

      <p className="mt-2 text-xs leading-[1.7] text-fg-subtle">
        默认路径是「文档 / CineLab
        Assets」。可以直接在资源管理器里整理文件夹和文件，应用以磁盘内容为准。
      </p>
    </div>
  )
}

function AppearanceSection() {
  const [mode, setMode] = useState<'light' | 'dark' | 'system'>(() => {
    const saved = localStorage.getItem('cinelab.theme.v1')
    return saved === 'light' || saved === 'dark' || saved === 'system'
      ? saved
      : 'system'
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
    <div className="flex flex-col">
      <div className="mb-3 text-[13px] font-semibold text-fg">主题</div>
      <div className="flex flex-col gap-2">
        {[
          { id: 'dark', label: '深色', hint: '默认主题' },
          { id: 'light', label: '浅色', hint: '明亮环境使用' },
          { id: 'system', label: '跟随系统', hint: '随系统外观切换' }
        ].map((option) => (
          <Button
            key={option.id}
            type="button"
            variant="ghost"
            size="none"
            className={`flex-col !items-start gap-[3px] rounded-[10px] border bg-surface-raised px-3.5 py-3 !text-left hover:border-border-strong ${
              mode === option.id ? 'border-border-selected' : 'border-border'
            }`}
            onClick={() => apply(option.id as 'light' | 'dark' | 'system')}
          >
            <span className="text-[13px] text-fg">{option.label}</span>
            <span className="text-[11px] text-fg-subtle">{option.hint}</span>
          </Button>
        ))}
      </div>
    </div>
  )
}

function PlaceholderSection({
  title,
  description
}: {
  title: string
  description: string
}) {
  return (
    <div className="flex flex-col">
      <div className="mb-3 text-[13px] font-semibold text-fg">{title}</div>
      <p className="mb-4 mt-0 text-xs leading-[1.8] text-fg-subtle">{description}</p>
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
    <div className="flex flex-col">
      <BrandWordmark height={20} className="mb-3.5" />
      <p className="mb-4 mt-0 text-xs leading-[1.8] text-fg-subtle">
        本地 AI 创作无限画布。模型完全自定义，数据存在你自己的硬盘上。
      </p>
      <div className="flex h-[34px] items-center gap-3 text-xs text-fg-muted">
        <span className="w-14 text-fg-subtle">版本</span>
        <code className="font-[inherit] text-fg">{version}</code>
      </div>
      <div className="flex h-[34px] items-center gap-3 text-xs text-fg-muted">
        <span className="w-14 text-fg-subtle">仓库</span>
        <code className="font-[inherit] text-fg">github.com/LAUFLO/CineLab</code>
      </div>
      <div className="flex h-[34px] items-center gap-3 text-xs text-fg-muted">
        <span className="w-14 text-fg-subtle">协议</span>
        <code className="font-[inherit] text-fg">MIT</code>
      </div>
      <div className="flex h-[34px] items-center gap-3 text-xs text-fg-muted">
        <span className="w-14 text-fg-subtle">日志</span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => void window.api.app.openLogs()}
        >
          打开日志目录
        </Button>
      </div>

      <div className="mt-[18px] rounded-[10px] border border-border bg-surface-raised p-3.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-fg">软件更新</span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!canCheck || busy}
            onClick={() => void check()}
          >
            {status?.state === 'checking' ? '检查中…' : '检查更新'}
          </Button>
        </div>
        <div
          className={`mt-2 text-xs leading-relaxed ${
            status?.state === 'error' ? 'text-danger' : 'text-fg-muted'
          }`}
        >
          {updateLabel(status)}
        </div>
        {status?.state === 'downloading' ? (
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-hover">
            <div
              className="h-full bg-pick-bar transition-[width] duration-[160ms]"
              style={{ width: `${status.percent ?? 0}%` }}
            />
          </div>
        ) : null}
        {status?.state === 'available' ? (
          <Button
            type="button"
            variant="primary"
            size="sm"
            className="mt-2.5"
            onClick={() => void download()}
          >
            下载更新
          </Button>
        ) : null}
        {status?.state === 'downloaded' ? (
          <Button
            type="button"
            variant="primary"
            size="sm"
            className="mt-2.5"
            onClick={() => void install()}
          >
            重启并安装
          </Button>
        ) : null}
        {status?.releaseNotes ? (
          <div className="mt-2.5 max-h-[120px] overflow-y-auto whitespace-pre-wrap text-[11px] leading-relaxed text-fg-subtle">
            {status.releaseNotes}
          </div>
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
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 backdrop-blur-[2px] [-webkit-app-region:no-drag]"
      onPointerDown={close}
    >
      <div
        className="flex h-[660px] max-h-[calc(100vh-80px)] w-[920px] max-w-[calc(100vw-48px)] flex-col overflow-hidden rounded-panel border border-border bg-surface shadow-menu [-webkit-app-region:no-drag]"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-divider pl-5 pr-4 text-[15px] font-semibold">
          <span>设置</span>
          <IconButton label="关闭" size="sm" onClick={close}>
            <Icon name="close" size={14} />
          </IconButton>
        </header>

        <div className="flex min-h-0 flex-1">
          <nav className="flex w-[200px] shrink-0 flex-col gap-0.5 border-r border-divider bg-[color-mix(in_srgb,var(--surface-raised)_60%,transparent)] px-2 py-3">
            {SECTIONS.map((section) => (
              <Button
                key={section.id}
                type="button"
                variant="ghost"
                size="none"
                className={`h-9 !justify-start gap-[9px] rounded-lg px-2.5 text-[13px] !font-normal ${
                  active === section.id
                    ? 'bg-surface-raised text-fg shadow-[inset_0_0_0_1px_var(--border)]'
                    : ''
                }`}
                onClick={() => setActive(section.id)}
              >
                {section.id === 'about' ? (
                  <BrandIcon size={15} />
                ) : (
                  <Icon name={section.icon} size={15} />
                )}
                <span>{section.label}</span>
              </Button>
            ))}
          </nav>

          <div className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
            {active === 'general' ? <GeneralSettingsSection /> : null}
            {active === 'models' ? <ModelsSection /> : null}
            {active === 'skills' ? <SkillsSection /> : null}
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
