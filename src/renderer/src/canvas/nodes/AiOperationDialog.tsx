import { useEffect, useMemo, useState } from 'react'
import type { ModelDef } from '@shared/provider-schema'
import { modelInputs } from '@shared/provider-schema'
import { Icon } from '../../components/Icon'
import { useSettingsStore } from '../../stores/settings'
import {
  Button,
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
  onClose,
  onConfirm
}: AiOperationDialogProps) {
  const providers = useSettingsStore((state) => state.providers)
  const openSettings = useSettingsStore((state) => state.openPanel)

  const models = useMemo(() => {
    return providers
      .flatMap((provider) =>
        provider.models
          .filter(
            (model) =>
              model.capability === 'image.i2i' ||
              model.capability === 'image.t2i'
          )
          .map((model) => ({
            key: `${provider.id}/${model.id}`,
            providerName: provider.name,
            model
          }))
      )
      .sort((a, b) => {
        const rank = (item: { model: ModelDef }): number =>
          (modelInputs(item.model).includes('image') ? 0 : 10) +
          (item.model.capability === 'image.i2i' ? 0 : 1)
        return rank(a) - rank(b)
      })
  }, [providers])

  const firstModelKey =
    models.find((item) => modelInputs(item.model).includes('image'))?.key ??
    models[0]?.key ??
    ''
  const [prompt, setPrompt] = useState(initialPrompt)
  const [modelKey, setModelKey] = useState(firstModelKey)

  useEffect(() => {
    if (!open) return
    setPrompt(initialPrompt)
    setModelKey(firstModelKey)
  }, [open, initialPrompt, firstModelKey])

  if (!open) return null

  const active = models.find((item) => item.key === modelKey)
  const activeSupportsImage = active
    ? modelInputs(active.model).includes('image')
    : false
  const valid =
    Boolean(active) && activeSupportsImage && prompt.trim().length > 0

  return (
    <Dialog
      open={open}
      onClose={busy ? () => {} : onClose}
      bare
      ariaLabel={title}
      overlayClassName="fixed inset-0 z-[240] flex items-center justify-center bg-black/55 px-6 py-12"
      panelClassName="w-[520px] rounded-[14px] border border-border bg-surface p-[18px] text-fg shadow-menu"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[15px] font-semibold">{title}</div>
          <div className="mt-1 text-xs text-fg-subtle">
            {masked
              ? '只修改涂抹区域，结果作为当前节点的新版本'
              : createsNode
                ? '结果会创建一个新节点，并自动连到当前节点'
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
        <div className="mt-4 flex flex-col gap-2 rounded-[9px] border border-border bg-surface-hover p-[14px] text-xs text-fg-muted">
          <p>还没有可用的图片模型。</p>
          <p>P1 操作需要支持图生图的模型，请先在设置中添加。</p>
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
              className="!min-h-[132px] !rounded-[7px] !border-border-strong !bg-surface-hover !px-2 !py-2 !text-xs leading-[1.6] focus:!border-border-selected"
              rows={7}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              disabled={busy}
            />
          </label>

          <div className="mt-3 text-[11px] leading-[1.6] text-fg-subtle">
            建议选择支持图生图的模型；提示词可以按需微调。
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
          {busy ? '提交中…' : '开始生成'}
        </Button>
      </div>
    </Dialog>
  )
}
