import { promises as fs } from 'node:fs'
import type { FilmStudy } from '@shared/film-study'
import type { FilmStudyStyle } from '@shared/film-study-v2'
import { resolveInside } from '../media/paths'
import { httpFetch } from '../providers/http'
import { resolveProvider } from '../settings/store'

const MAX_SHEET_FRAMES = 12

const STYLE_SCHEMA = {
  type: 'object',
  required: ['style'],
  properties: {
    style: {
      type: 'object',
      properties: {
        look: { type: 'string' },
        palette: { type: 'string' },
        composition: { type: 'string' },
        camera: { type: 'string' },
        pacing: { type: 'string' },
        prompt: { type: 'string' }
      }
    }
  }
}

function parseJson(text: string): unknown {
  const cleaned = text
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  const start = Math.min(
    ...[cleaned.indexOf('{'), cleaned.indexOf('[')].filter(
      (index) => index >= 0
    )
  )
  return JSON.parse(
    Number.isFinite(start) && start > 0 ? cleaned.slice(start) : cleaned
  )
}

function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function pickFrames(study: FilmStudy): FilmStudy['frames'] {
  const frames = study.frames
  if (frames.length <= MAX_SHEET_FRAMES) return frames
  return Array.from({ length: MAX_SHEET_FRAMES }, (_, index) => {
    const source = Math.round(
      (index * (frames.length - 1)) / (MAX_SHEET_FRAMES - 1)
    )
    return frames[source]
  })
}

export function buildStylePrompt(study: FilmStudy): string {
  const shots = study.shots ?? []
  const pacing = shots.length
    ? (shots.reduce((sum, shot) => sum + shot.duration, 0) / shots.length).toFixed(2)
    : '0'

  return [
    `你在给《${study.sourceName}》做视觉风格档案。`,
    '下面附上按时间顺序排列的代表帧。',
    `全片 ${shots.length} 个镜头，平均镜头长度 ${pacing} 秒。`,
    '只输出 JSON，不要 Markdown、解释或代码块：',
    JSON.stringify(STYLE_SCHEMA),
    '要求：',
    '- look：画风，一句话，如「写实电影感」「3D 动画」「国漫」「动态漫」。',
    '- palette：色调与调色风格，写清主色和明暗。',
    '- composition：构图习惯，如近景为主、过肩、对称。',
    '- camera：运镜习惯，如手持、固定、推近。',
    '- pacing：节奏，如「平均 2.4s 一镜，三镜一个小反转」。',
    '- prompt：可以直接给图像/视频模型用的英文风格提示词，不超过 60 词。'
  ].join('\n')
}

export function parseStyle(raw: string): FilmStudyStyle {
  let parsed: unknown
  try {
    parsed = parseJson(raw)
  } catch {
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null) return {}

  const value = (parsed as { style?: unknown }).style
  if (typeof value !== 'object' || value === null) return {}
  const record = value as Record<string, unknown>

  const style: FilmStudyStyle = {}
  const look = text(record.look)
  const palette = text(record.palette)
  const composition = text(record.composition)
  const camera = text(record.camera)
  const pacing = text(record.pacing)
  const prompt = text(record.prompt)
  if (look) style.look = look
  if (palette) style.palette = palette
  if (composition) style.composition = composition
  if (camera) style.camera = camera
  if (pacing) style.pacing = pacing
  if (prompt) style.prompt = prompt
  return style
}

async function requestStyle(
  study: FilmStudy,
  root: string,
  modelKey: string,
  signal?: AbortSignal
): Promise<FilmStudyStyle> {
  const slash = modelKey.indexOf('/')
  if (slash <= 0) return {}

  const provider = await resolveProvider(modelKey.slice(0, slash))
  if (!provider?.apiKey) return {}

  const model = provider.models.find(
    (item) => item.id === modelKey.slice(slash + 1)
  )
  if (!model || model.capability !== 'text.chat') return {}

  const content: Array<Record<string, unknown>> = []
  for (const frame of pickFrames(study)) {
    const data = await fs.readFile(resolveInside(root, frame.file))
    content.push({
      type: 'image_url',
      image_url: {
        url: `data:image/jpeg;base64,${data.toString('base64')}`
      }
    })
  }

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
        temperature: 0.3,
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: buildStylePrompt(study) },
              ...content
            ]
          }
        ]
      }),
      signal
    }
  )

  if (!response.ok) return {}
  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const raw = json.choices?.[0]?.message?.content
  if (!raw) return {}
  return parseStyle(raw)
}

/** 视觉风格档案；模型不可用时返回空对象。 */
export async function aggregateStyle(
  study: FilmStudy,
  root: string,
  modelKey: string | null,
  signal?: AbortSignal
): Promise<FilmStudyStyle> {
  if (!modelKey || !study.shots?.length) return {}
  try {
    return await requestStyle(study, root, modelKey, signal)
  } catch {
    return {}
  }
}
