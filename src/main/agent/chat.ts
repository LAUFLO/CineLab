import type { AgentChatRequest, AgentChatResult } from '@shared/agent'
import type { ModelDef } from '@shared/provider-schema'
import { chatCompletion, type ChatMessage } from '../providers/openai-compat'
import { resolveProvider, type ResolvedProvider } from '../settings/store'
import { loadModelsConfig, resolveModels } from '../settings/models-config'

const PROFILE_PROMPT: Record<string, string> = {
  clip: `你是 CineLab 剪辑室的剪辑助手。你只能输出一个 JSON 对象，不要输出 Markdown、代码围栏或额外解释。

可用 intent：
- remove_silence：删除时间线中的静音区间
- split_by_shots：按镜头切分选中的视频片段
- beat_markers：在选中的音频/视频片段上生成节拍标记
- beat_split：按节拍切分选中的视频（未选中视频时切主轨）
- answer：回答、澄清或说明为什么不能执行
- unsupported：无法执行

输出格式：
{"reply":"给用户看的中文说明","intent":"remove_silence","args":{},"needsConfirm":true}

规则：
- 用户说"删掉静音"用 remove_silence；"按镜头切"用 split_by_shots；"标记节拍/打节拍"用 beat_markers；"跟着节拍切"用 beat_split。
- 没有选中合适片段时，用 answer 说明需要先选中视频或音频片段。
- 不要编造时间码、片段名称或素材信息。
- 不执行导出、删除素材文件、修改画布结构。
- reply 用简体中文，简洁说明将要做什么。`
}

async function resolveTextModel(): Promise<{
  provider: ResolvedProvider
  model: ModelDef
  key: string
} | null> {
  const config = await loadModelsConfig()
  if (config.errors.length > 0) {
    throw new Error(config.errors[0])
  }

  for (const providerConfig of config.providers) {
    const model = resolveModels(providerConfig).find(
      (item) => item.capability === 'text.chat'
    )
    if (!model) continue
    const provider = await resolveProvider(providerConfig.id)
    if (!provider?.apiKey) continue
    return {
      provider,
      model,
      key: `${providerConfig.id}/${model.id}`
    }
  }

  return null
}

function contextPrompt(request: AgentChatRequest): string {
  const { context } = request
  const selected = context.selectedClip
    ? `选中片段：${context.selectedClip.name || '未命名'}（${context.selectedClip.kind}，起点 ${context.selectedClip.startMs}ms，时长 ${context.selectedClip.durationMs}ms，${context.selectedClip.hasMedia ? '有素材' : '无素材'}）。`
    : '当前没有选中片段。'

  return `当前时间线：${context.timelineName}，总时长 ${context.durationMs}ms，${context.clipCount} 个片段，${context.trackCount} 条轨道，${context.markerCount} 个标记。${selected}`
}

export async function chatWithAgent(
  request: AgentChatRequest,
  signal?: AbortSignal
): Promise<AgentChatResult> {
  if (request.profileId !== 'clip') {
    throw new Error('当前只支持剪辑助手')
  }

  const resolved = await resolveTextModel()
  if (!resolved) {
    throw new Error('没有可用的文本模型，请先在设置中配置 text.chat 模型')
  }

  const system = `${PROFILE_PROMPT.clip}\n\n${contextPrompt(request)}`
  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    ...request.messages.map((message) => ({
      role: message.role,
      content: message.content
    }))
  ]

  const controller = new AbortController()
  const onAbort = (): void => controller.abort()
  if (signal?.aborted) controller.abort()
  else signal?.addEventListener('abort', onAbort)

  try {
    const content = await chatCompletion(
      resolved.model,
      resolved.provider,
      messages,
      { temperature: 0.2 },
      {
        signal: controller.signal,
        onProgress: () => undefined
      }
    )
    return { content, model: resolved.key }
  } finally {
    signal?.removeEventListener('abort', onAbort)
  }
}
