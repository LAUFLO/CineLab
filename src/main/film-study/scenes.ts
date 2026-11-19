import { promises as fs } from 'node:fs'
import type { FilmStudy, FilmStudyFrame } from '@shared/film-study'
import type { FilmStudyScene } from '@shared/film-study-v2'
import { sortScenes } from '@shared/film-study-v2'
import { resolveInside } from '../media/paths'
import { httpFetch } from '../providers/http'
import { resolveProvider } from '../settings/store'

const MAX_SHEET_FRAMES = 12
const SCENE_SCHEMA = {
  type: 'object',
  required: ['scenes'],
  properties: {
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        required: ['shots'],
        properties: {
          shots: {
            type: 'array',
            items: { type: 'number' },
            minItems: 2,
            maxItems: 2
          },
          name: { type: 'string' },
          location: { type: 'string' },
          daypart: { type: 'string' },
          lighting: { type: 'string' }
        }
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
  return JSON.parse(Number.isFinite(start) && start > 0 ? cleaned.slice(start) : cleaned)
}

function pickFrames(frames: FilmStudyFrame[], limit: number): FilmStudyFrame[] {
  if (frames.length <= limit) return frames
  return Array.from({ length: limit }, (_, index) => {
    const source = Math.round((index * (frames.length - 1)) / (limit - 1))
    return frames[source]
  })
}

function shotCountOf(study: FilmStudy): number {
  return study.shots?.length ?? study.segments.length
}

export function buildScenePrompt(study: FilmStudy): string {
  const shots = study.shots ?? []
  const rows =
    shots.length > 0
      ? shots.map(
          (shot, index) =>
            `镜 ${index + 1}｜${shot.startTime.toFixed(1)}–${shot.endTime.toFixed(1)}s`
        )
      : study.segments.map((segment, index) => {
          const parts = [
            `镜 ${index + 1}`,
            `${segment.startTime.toFixed(1)}–${segment.endTime.toFixed(1)}s`,
            segment.title,
            segment.shotSize,
            segment.visualDescription
          ].filter(Boolean)
          return parts.join('｜')
        })

  return [
    `你在给《${study.sourceName}》分场。`,
    '场 = 同一地点、同一时间、同一组人物的一段连续戏。',
    `全片共 ${shotCountOf(study)} 个镜头，镜头表如下：`,
    ...rows,
    '下面附上按时间顺序排列的代表帧，图 1 对应第一个镜头。',
    '只输出 JSON，不要 Markdown、解释或代码块，结构如下：',
    JSON.stringify(SCENE_SCHEMA),
    'scenes 的 shots 是闭区间镜号 [起始, 结束]，必须覆盖全片、按时间顺序、不重叠。'
  ].join('\n')
}

export function fallbackScenes(shotCount: number): FilmStudyScene[] {
  if (shotCount < 1) return []
  const scenes: FilmStudyScene[] = []
  for (let start = 1; start <= shotCount; start += 10) {
    const end = Math.min(shotCount, start + 9)
    scenes.push({
      id: `S${scenes.length + 1}`,
      name: `第 ${scenes.length + 1} 段`,
      shots: [start, end]
    })
  }
  return scenes
}

export function parseScenes(raw: string, shotCount: number): FilmStudyScene[] {
  let parsed: unknown
  try {
    parsed = parseJson(raw)
  } catch {
    return fallbackScenes(shotCount)
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return fallbackScenes(shotCount)
  }

  const list = (parsed as { scenes?: unknown }).scenes
  if (!Array.isArray(list)) return fallbackScenes(shotCount)

  const scenes: FilmStudyScene[] = []
  for (const [index, item] of list.entries()) {
    if (typeof item !== 'object' || item === null) continue
    const value = item as Record<string, unknown>
    const range = value.shots
    if (!Array.isArray(range) || range.length !== 2) continue
    const start = Number(range[0])
    const end = Number(range[1])
    if (!Number.isInteger(start) || !Number.isInteger(end)) continue
    if (start < 1 || end < start || end > shotCount) continue

    const location =
      typeof value.location === 'string' ? value.location.trim() : ''
    const daypart =
      typeof value.daypart === 'string' ? value.daypart.trim() : ''
    const name =
      typeof value.name === 'string' && value.name.trim()
        ? value.name.trim()
        : [location, daypart].filter(Boolean).join(' · ') || `第 ${index + 1} 场`

    scenes.push({
      id: `S${index + 1}`,
      name,
      ...(location ? { location } : {}),
      ...(daypart ? { daypart } : {}),
      ...(typeof value.lighting === 'string' && value.lighting.trim()
        ? { lighting: value.lighting.trim() }
        : {}),
      shots: [start, end]
    })
  }

  if (scenes.length === 0) return fallbackScenes(shotCount)
  return sortScenes(scenes, shotCount)
}

async function requestScenes(
  study: FilmStudy,
  root: string,
  modelKey: string,
  signal?: AbortSignal
): Promise<FilmStudyScene[]> {
  const shotCount = shotCountOf(study)
  const slash = modelKey.indexOf('/')
  if (slash <= 0) return fallbackScenes(shotCount)

  const provider = await resolveProvider(modelKey.slice(0, slash))
  if (!provider?.apiKey) return fallbackScenes(shotCount)

  const model = provider.models.find(
    (item) => item.id === modelKey.slice(slash + 1)
  )
  if (!model || model.capability !== 'text.chat') {
    return fallbackScenes(shotCount)
  }

  const frames = pickFrames(study.frames, MAX_SHEET_FRAMES)
  const content: Array<Record<string, unknown>> = []
  for (const frame of frames) {
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
        temperature: 0.2,
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: buildScenePrompt(study) },
              ...content
            ]
          }
        ]
      }),
      signal
    }
  )

  if (!response.ok) return fallbackScenes(shotCount)
  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const raw = json.choices?.[0]?.message?.content
  if (!raw) return fallbackScenes(shotCount)
  return parseScenes(raw, shotCount)
}

/**
 * 给一条已分析的拉片分场。
 * 模型不可用或调用失败时回退到每 10 镜一段，不抛错、不阻塞拉片。
 */
export async function splitScenes(
  study: FilmStudy,
  root: string,
  modelKey: string | null,
  signal?: AbortSignal
): Promise<FilmStudyScene[]> {
  if (!modelKey || shotCountOf(study) === 0) {
    return fallbackScenes(shotCountOf(study))
  }
  try {
    return await requestScenes(study, root, modelKey, signal)
  } catch {
    return fallbackScenes(shotCountOf(study))
  }
}
