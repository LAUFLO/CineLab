import { promises as fs } from 'node:fs'
import type { ModelDef } from '@shared/provider-schema'
import type { SceneAnalyzeInput, SceneAnalyzeResult } from '@shared/scene-analyze'
import { parseSceneDraft } from '@shared/scene-draft'
import { calibrateScene } from '@shared/scene-calibrate'
import { httpFetch } from '../providers/http'
import { resolveMediaPath } from '../media/paths'
import { listProviders, resolveProvider } from '../settings/store'

const SCENE_PROMPT = `你是 3D previs 场景解析器。看这张场景图，只输出 JSON，不要 Markdown、解释或代码块。

输出结构：
{
  "set": { "kind": "indoor" | "outdoor", "description": "一句英文场景描述" },
  "room": { "type": "office", "widthM": 5, "depthM": 4, "heightM": 2.8 } | null,
  "objects": [
    {
      "label": "desk",
      "sizeClass": "small" | "medium" | "large",
      "relativeX": 0.5,
      "depthLayer": "near" | "mid" | "far",
      "facing": "toward_camera" | "away" | "left" | "right"
    }
  ],
  "camera": {
    "heightHint": "floor" | "eye" | "high",
    "pitchHint": "up" | "level" | "down",
    "fovHintDeg": 50,
    "horizonY": 0.45
  }
}

规则：
- relativeX 是画面横向位置，0 = 最左，1 = 最右；不要输出米制坐标。
- depthLayer 只表示近/中/远，不要猜距离。
- objects 最多 32 个，只列画面里看得见的主要物体。
- 室内场景给 room，室外场景 room 为 null。
- 只输出 JSON。`

function pickModel(
  provider: { models: ModelDef[] },
  modelId?: string
): ModelDef | null {
  if (modelId) {
    return provider.models.find((item) => item.id === modelId) ?? null
  }
  return provider.models.find((item) => item.capability === 'text.chat') ?? null
}

async function resolveModel(modelKey?: string): Promise<{
  provider: Awaited<ReturnType<typeof resolveProvider>>
  model: ModelDef
}> {
  if (modelKey) {
    const slash = modelKey.indexOf('/')
    if (slash <= 0) throw new Error('模型标识无效')
    const provider = await resolveProvider(modelKey.slice(0, slash))
    if (!provider) throw new Error('找不到模型供应商，请先在设置中配置')
    if (!provider.apiKey) throw new Error('该供应商没有配置 API Key')
    const model = pickModel(provider, modelKey.slice(slash + 1))
    if (!model) throw new Error('找不到该文本模型')
    return { provider, model }
  }

  const providers = await listProviders()
  for (const item of providers) {
    const model = item.models.find((entry) => entry.capability === 'text.chat')
    if (!model) continue
    const provider = await resolveProvider(item.id)
    if (!provider || !provider.apiKey) continue
    return { provider, model }
  }
  throw new Error('还没有可用的文本模型，请先在设置中配置 text.chat 模型')
}

function stripJson(raw: string): string {
  return raw
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
}

export async function analyzeScene(
  projectRoot: string,
  input: SceneAnalyzeInput
): Promise<SceneAnalyzeResult> {
  const imageFile = await resolveMediaPath(
    projectRoot,
    input.imagePath,
    input.imageScope
  )
  const data = await fs.readFile(imageFile)
  const lower = input.imagePath.toLowerCase()
  const mime = lower.endsWith('.png')
    ? 'image/png'
    : lower.endsWith('.webp')
      ? 'image/webp'
      : 'image/jpeg'

  const { provider, model } = await resolveModel(input.modelKey)
  if (!provider) throw new Error('模型供应商不可用')

  const response = await httpFetch(
    `${provider.baseUrl.replace(/\/+$/, '')}/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
        ...(provider.headers ?? {})
      },
      body: JSON.stringify({
        model: model.remoteModel,
        temperature: 0.2,
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: SCENE_PROMPT },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mime};base64,${data.toString('base64')}`
                }
              }
            ]
          }
        ]
      })
    }
  )

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`模型返回 HTTP ${response.status}：${text.slice(0, 300)}`)
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const raw = json.choices?.[0]?.message?.content?.trim()
  if (!raw) throw new Error('模型没有返回场景解析内容')

  const draft = parseSceneDraft(JSON.parse(stripJson(raw)) as unknown)
  const calibration = calibrateScene(
    draft,
    input.depth ?? { width: 1280, height: 720 }
  )

  return {
    draft,
    calibration,
    confidence: calibration.confidence
  }
}
