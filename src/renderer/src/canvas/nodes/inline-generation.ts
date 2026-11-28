import type { ModelDef, ProviderConfig } from '@shared/provider-schema'
import { modelInputs } from '@shared/provider-schema'
import type { OutputRef } from '@shared/canvas-schema'
import { absolutePosition, nodeSize, useCanvasStore } from '../../stores/canvas'
import { useGenerationStore } from '../../stores/generation'

export interface ImageModelOption {
  key: string
  providerName: string
  model: ModelDef
  disabled: boolean
  reason?: string
}

export function listImageModels(
  providers: ProviderConfig[]
): ImageModelOption[] {
  return providers
    .flatMap((provider) =>
      provider.models
        .filter(
          (model) =>
            model.capability === 'image.i2i' ||
            model.capability === 'image.t2i'
        )
        .map((model) => {
          let reason: string | undefined
          if (!provider.hasKey) reason = '未配置 API Key'
          else if (!modelInputs(model).includes('image')) {
            reason = '不支持参考图'
          }
          return {
            key: `${provider.id}/${model.id}`,
            providerName: provider.name,
            model,
            disabled: Boolean(reason),
            ...(reason ? { reason } : {})
          }
        })
    )
    .sort((a, b) => {
      if (a.disabled !== b.disabled) return a.disabled ? 1 : -1
      const rank = (item: ImageModelOption): number =>
        (modelInputs(item.model).includes('image') ? 0 : 10) +
        (item.model.capability === 'image.i2i' ? 0 : 1)
      return rank(a) - rank(b)
    })
}

export function defaultParams(model: ModelDef): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const param of model.params) {
    if (param.defaultValue !== undefined) values[param.key] = param.defaultValue
  }
  return values
}

export function createOperationNode(
  nodeId: string,
  label: string,
  kind: 'image' | 'video' = 'image'
): string | null {
  const nodes = useCanvasStore.getState().nodes
  const found = nodes.find((entry) => entry.id === nodeId)
  if (!found || found.type !== 'cine') return null
  const width = nodeSize(found).width
  const base = absolutePosition(found, nodes)
  return (
    useCanvasStore
      .getState()
      .addPendingNodes(
        kind,
        { x: base.x + width + 48, y: base.y },
        1,
        `${found.data.title} · ${label}`,
        nodeId
      )[0] ?? null
  )
}

export interface RunImageOperationInput {
  nodeId: string
  current: OutputRef
  opId: string
  label: string
  prompt: string
  modelKey: string
  model: ModelDef
  mask?: string
  params?: Record<string, unknown>
}

/** 提交一次图片生成操作，返回新建的结果节点 ID。 */
export function runImageOperation(input: RunImageOperationInput): string | null {
  const targetId = createOperationNode(input.nodeId, input.label)
  if (!targetId) return null
  useGenerationStore.getState().run({
    nodeId: targetId,
    modelKey: input.modelKey,
    prompt: input.prompt,
    params: {
      ...defaultParams(input.model),
      watermark: false,
      ...input.params
    },
    refs: [
      {
        path: input.current.path,
        role: 'reference',
        ...(input.current.scope ? { scope: input.current.scope } : {})
      }
    ],
    ...(input.mask ? { mask: input.mask } : {}),
    op: input.opId
  })
  return targetId
}
