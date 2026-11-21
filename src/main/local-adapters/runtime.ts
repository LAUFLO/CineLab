import type { ModelDef } from '@shared/provider-schema'
import type { VideoOperationOptions } from '@shared/generation'
import type {
  AdapterContext,
  ProviderOutput,
  ProviderRuntime
} from '../providers/openai-compat'
import type { LoadedRef } from '../providers/media'
import { localAdapterRecord } from './registry'

/**
 * 通过 utilityProcess 执行本地适配器。
 *
 * 所有媒体都以统一 LoadedRef 传入，适配器自己决定用 dataUrl 还是 base64。
 */
export async function generateWithLocalAdapter(
  model: ModelDef,
  provider: ProviderRuntime,
  prompt: string,
  params: Record<string, unknown>,
  refs: LoadedRef[],
  ctx: AdapterContext,
  video?: { dataUrl: string; mime: string },
  videoOptions?: VideoOperationOptions,
  mask?: string
): Promise<ProviderOutput[]> {
  const adapterId =
    model.localAdapter ?? model.adapter?.replace(/^local:/, '')
  if (!adapterId) throw new Error('本地适配器 ID 缺失')

  const record = localAdapterRecord(adapterId)
  if (!record) throw new Error(`找不到本地适配器：${adapterId}`)
  if (record.status !== 'ready' || !record.host) {
    throw new Error(
      `本地适配器 ${adapterId} 未就绪${record.error ? `：${record.error}` : ''}`
    )
  }

  const outputs = await record.host.generate(
    {
      model: {
        id: model.id,
        name: model.name,
        capability: model.capability,
        remoteModel: model.remoteModel,
        params: model.params
      },
      provider: {
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        secretKey: provider.secretKey,
        ...(provider.headers ? { headers: provider.headers } : {})
      },
      prompt,
      params,
      refs: refs.map((ref) => ({
        dataUrl: ref.dataUrl,
        base64: ref.base64,
        mime: ref.mime,
        role: ref.role,
        media: ref.media
      })),
      ...(video ? { video } : {}),
      ...(videoOptions ? { videoOptions } : {}),
      ...(mask ? { mask } : {})
    },
    {
      onProgress: (percent, message) => ctx.onProgress(percent, message),
      signal: ctx.signal
    }
  )

  return outputs.map((output) => ({
    data: output.data,
    mime: output.mime,
    ...(output.text ? { text: output.text } : {}),
    ...(output.layer
      ? { layer: output.layer as ProviderOutput['layer'] }
      : {}),
    ...(output.textRecognition
      ? {
          textRecognition:
            output.textRecognition as ProviderOutput['textRecognition']
        }
      : {})
  }))
}
