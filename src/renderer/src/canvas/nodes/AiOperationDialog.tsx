import { useEffect, useMemo, useRef, useState } from 'react'
import type { ModelDef } from '@shared/provider-schema'
import { modelInputs } from '@shared/provider-schema'
import { Icon } from '../../components/Icon'
import { useSettingsStore } from '../../stores/settings'
import { usePreferencesStore } from '../../stores/preferences'
import {
  Button,
  DIALOG_PANEL,
  Dialog,
  IconButton,
  Select,
  Textarea
} from '../../components/ui'

interface AiOperationDialogProps {
  open: boolean
  title: string
  initialPrompt: string
  busy: boolean
  masked?: boolean
  /** 生成结果会创建新节点，而不是写回当前节点版本栈 */
  createsNode?: boolean
  /** 选择图片模型还是支持图片输入的文本模型 */
  modelKind?: 'image' | 'text'
  /** 提示词保存键；同一操作/菜单项只保存一个版本 */
  operationKey?: string
  onClose: () => void
  onConfirm: (prompt: string, modelKey: string, model: ModelDef) => void
}

export function AiOperationDialog({
  open,
  title,
  initialPrompt,
  busy,
  masked = false,
  createsNode = false,
  modelKind = 'image',
  operationKey,
  onClose,
  onConfirm
}: AiOperationDialogProps) {
  const providers = useSettingsStore((state) => state.providers)
  const openSettings = useSettingsStore((state) => state.openPanel)
  const promptOverrides = usePreferencesStore(
    (state) => state.preferences.operationPrompts
  )
  const setOperationPrompt = usePreferencesStore(
    (state) => state.setOperationPrompt
  )
  const resetOperationPrompt = usePreferencesStore(
    (state) => state.resetOperationPrompt
  )
  const wantsText = modelKind === 'text'
  const savedPrompt = operationKey ? promptOverrides[operationKey] : undefined
  const savedPromptRef = useRef(savedPrompt)
  savedPromptRef.current = savedPrompt

  const models = useMemo(() => {
    return providers
      .flatMap((provider) =>
        provider.models
          .filter((model) => {
            if (wantsText) {
              return (
                model.capability === 'text.chat' &&
                modelInputs(model).includes('image')
              )
            }
            return (
              model.capability === 'image.i2i' ||
              model.capability === 'image.t2i'
            )
          })
          .map((model) => ({
            key: `${provider.id}/${model.id}`,
            providerName: provider.name,
            model
          }))
      )
      .sort((a, b) => {
        const rank = (item: { model: ModelDef }): number => {
          if (wantsText) {
            return modelInputs(item.model).includes('image') ? 0 : 10
          }
          return (
            (modelInputs(item.model).includes('image') ? 0 : 10) +
            (item.model.capability === 'image.i2i' ? 0 : 1)
          )
        }
        return rank(a) - rank(b)
      })
  }, [providers, wantsText])

  const firstModelKey =
    models.find((item) => modelInputs(item.model).includes('image'))?.key ??
    models[0]?.key ??
    ''
  const [prompt, setPrompt] = useState(initialPrompt)
  const [modelKey, setModelKey] = useState(firstModelKey)
  const [savedNotice, setSavedNotice] = useState(false)

  useEffect(() => {
    if (!open) return
    setPrompt(savedPromptRef.current ?? initialPrompt)
    setModelKey(firstModelKey)
    setSavedNotice(false)
  }, [open, initialPrompt, firstModelKey])

  if (!open) return null

  const active = models.find((item) => item.key === modelKey)
  const activeSupportsImage = active
    ? modelInputs(active.model).includes('image')
    : false
  const valid =
    Boolean(active) && activeSupportsImage && prompt.trim().length > 0
  const dirty = prompt.trim() !== (savedPrompt ?? initialPrompt).trim()

  return (
    <Dialog
      open={open}
      onClose={busy ? () => {} : onClose}
      bare
      ariaLabel={title}
      overlayClassName="fixed inset-0 z-[240] flex items-center justify-center bg-overlay px-6 py-12"
      panelClassName={`w-[520px] ${DIALOG_PANEL}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[15px] font-semibold">{title}</div>
          <div className="mt-1 text-xs text-fg-subtle">
            {masked
              ? '只修改涂抹区域，结果作为当前节点的新版本'
              : createsNode
                ? wantsText
                  ? '结果会创建一个文本节点，并自动连到当前节点'
                  : '结果会创建一个新节点，并自动连到当前节点'
                : '结果作为当前节点的新版本，保留原图'}
          </div>
        </div>
        <IconButton
          label="关闭"
          size="sm"
          className="disabled:!opacity-100"
          disabled={busy}
          onClick={onClose}
        >
          <Icon name="close" size={14} />
        </IconButton>
      </div>

      {models.length === 0 ? (
        <div className="mt-4 flex flex-col gap-2 rounded-card border border-border bg-surface-hover p-[14px] text-xs text-fg-muted">
          <p>{wantsText ? '还没有可用的文本模型。' : '还没有可用的图片模型。'}</p>
          <p>
            {wantsText
              ? '反推提示词需要支持图片输入的文本模型，请先在设置中添加。'
              : '该操作需要支持图生图的模型，请先在设置中添加。'}
          </p>
          <Button
            type="button"
            variant="primary"
            className="mt-1 self-start"
            onClick={() => {
              onClose()
              openSettings()
            }}
          >
            打开设置
          </Button>
        </div>
      ) : (
        <>
          <label className="flex flex-col gap-1.5 text-xs text-fg-muted">
            <span>使用模型</span>
            <Select
              value={modelKey}
              options={models.map((item) => ({
                value: item.key,
                label: `${item.providerName} · ${item.model.name}${
                  modelInputs(item.model).includes('image')
                    ? ''
                    : '（不支持参考图）'
                }`,
                disabled: !modelInputs(item.model).includes('image')
              }))}
              onChange={(next) => setModelKey(next)}
              disabled={busy}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-xs text-fg-muted">
            <span>提示词</span>
            <Textarea
              className="!min-h-[132px] !rounded-md !border-border-strong !bg-surface-hover !px-2 !py-2 !text-xs leading-[1.6] focus:!border-border-selected"
              rows={7}
              value={prompt}
              onChange={(event) => {
                setPrompt(event.target.value)
                setSavedNotice(false)
              }}
              disabled={busy}
            />
          </label>

          {operationKey ? (
            <div className="flex items-center justify-between gap-2 text-[11px] text-fg-subtle">
              <span className="truncate">
                {savedPrompt
                  ? savedNotice
                    ? '已保存'
                    : '已保存自定义提示词'
                  : '当前使用默认提示词'}
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                {savedPrompt ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="none"
                    className="!h-6 !rounded-md !px-1.5 !text-[11px] !font-normal"
                    disabled={busy}
                    onClick={() => {
                      if (!operationKey) return
                      setPrompt(initialPrompt)
                      setSavedNotice(false)
                      void resetOperationPrompt(operationKey)
                    }}
                  >
                    恢复默认
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="secondary"
                  size="none"
                  className="!h-6 !rounded-md !px-2 !text-[11px] !font-normal"
                  disabled={!dirty || busy || !prompt.trim()}
                  onClick={() => {
                    if (!operationKey) return
                    void setOperationPrompt(operationKey, prompt).then(() =>
                      setSavedNotice(true)
                    )
                  }}
                >
                  保存
                </Button>
              </div>
            </div>
          ) : null}

          <div className="mt-3 text-[11px] leading-[1.6] text-fg-subtle">
            {wantsText
              ? '建议选择支持图片输入的文本模型；提示词可以按需微调。'
              : '建议选择支持图生图的模型；提示词可以按需微调。'}
            {masked
              ? ' 当前操作会把蒙版一起提交，模型需要支持 /images/edits mask。'
              : ''}
          </div>
        </>
      )}

      <div className="mt-4 flex justify-end gap-2 border-t border-divider pt-3.5">
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={onClose}
        >
          取消
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={!valid || busy}
          onClick={() => {
            if (!active || !prompt.trim()) return
            onConfirm(prompt.trim(), modelKey, active.model)
          }}
        >
          {busy ? '提交中…' : wantsText ? '开始分析' : '开始生成'}
        </Button>
      </div>
    </Dialog>
  )
}
