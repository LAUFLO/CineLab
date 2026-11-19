import { promises as fs } from 'node:fs'
import type { FilmStudy } from '@shared/film-study'
import type { FilmStudyCast } from '@shared/film-study-v2'
import { resolveInside } from '../media/paths'
import { httpFetch } from '../providers/http'
import { resolveProvider } from '../settings/store'

const MAX_SHEET_FRAMES = 12
const MAX_CAST = 30

const CAST_SCHEMA = {
  type: 'object',
  required: ['cast'],
  properties: {
    cast: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'name'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          role: { type: 'string' },
          importance: {
            type: 'string',
            enum: ['lead', 'supporting', 'extra']
          },
          appearance: { type: 'string' },
          shotIndexes: {
            type: 'array',
            items: { type: 'number' }
          }
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

export function buildCastPrompt(study: FilmStudy): string {
  const shots = study.shots ?? []
  const rows = shots.map((shot) => {
    const dialogue = shot.dialogue
      ?.map(
        (line) => `${line.speaker ? `${line.speaker}：` : ''}${line.text}`
      )
      .join(' / ')
    return [
      `镜 ${shot.index}`,
      `${shot.startTime.toFixed(1)}–${shot.endTime.toFixed(1)}s`,
      shot.shotSize,
      shot.visualDescription,
      dialogue
    ]
      .filter(Boolean)
      .join('｜')
  })

  return [
    `你在给《${study.sourceName}》建角色表。`,
    '下面附上按时间顺序排列的代表帧，图 1 对应第一个镜头。',
    '镜头表：',
    ...rows,
    '',
    '只输出 JSON，不要 Markdown、解释或代码块：',
    JSON.stringify(CAST_SCHEMA),
    '要求：',
    '- 同一个人跨镜合并；乔装、换装、女扮男装、戴假发仍是同一角色。',
    '- 群众合并为 crowd，importance 用 extra。',
    '- id 用英文小写短标识，如 lin、chen、crowd。',
    '- shotIndexes 是这个角色出现的镜号，必须在 1 到镜头总数之间。',
    '- appearance 写到能让画师单独画出这个人：性别、年龄感、发型、脸型、服装颜色款式、配饰。'
  ].join('\n')
}

export function parseCast(raw: string, shotCount: number): FilmStudyCast[] {
  let parsed: unknown
  try {
    parsed = parseJson(raw)
  } catch {
    return []
  }
  if (typeof parsed !== 'object' || parsed === null) return []

  const list = (parsed as { cast?: unknown }).cast
  if (!Array.isArray(list)) return []

  const seen = new Set<string>()
  const cast: FilmStudyCast[] = []
  for (const item of list) {
    if (cast.length >= MAX_CAST) break
    if (typeof item !== 'object' || item === null) continue
    const value = item as Record<string, unknown>

    const id = text(value.id)?.toLowerCase()
    const name = text(value.name)
    if (!id || !name || seen.has(id)) continue

    const shotIndexes = Array.isArray(value.shotIndexes)
      ? [
          ...new Set(
            value.shotIndexes
              .map((index) => Number(index))
              .filter(
                (index) =>
                  Number.isInteger(index) &&
                  index >= 1 &&
                  index <= shotCount
              )
          )
        ].sort((a, b) => a - b)
      : []

    const importance =
      value.importance === 'lead' ||
      value.importance === 'supporting' ||
      value.importance === 'extra'
        ? value.importance
        : 'supporting'

    seen.add(id)
    cast.push({
      id,
      name,
      ...(text(value.role) ? { role: text(value.role) } : {}),
      importance,
      ...(text(value.appearance)
        ? { appearance: text(value.appearance) }
        : {}),
      shotIndexes
    })
  }

  return cast
}

/** 用角色出现镜头的中间帧做头像和造型占位；裁脸留给 R2-4。 */
export function attachCastFrames(
  cast: FilmStudyCast[],
  study: FilmStudy
): FilmStudyCast[] {
  const shots = study.shots ?? []
  return cast.map((item) => {
    const paths = item.shotIndexes
      .map((index) => shots[index - 1]?.midFrame)
      .filter((path): path is string => Boolean(path))
    return {
      ...item,
      ...(paths[0] ? { facePath: paths[0] } : {}),
      ...(paths.length > 1 ? { lookPaths: [...new Set(paths)].slice(0, 3) } : {})
    }
  })
}

async function requestCast(
  study: FilmStudy,
  root: string,
  modelKey: string,
  signal?: AbortSignal
): Promise<FilmStudyCast[]> {
  const shots = study.shots ?? []
  const slash = modelKey.indexOf('/')
  if (slash <= 0) return []

  const provider = await resolveProvider(modelKey.slice(0, slash))
  if (!provider?.apiKey) return []

  const model = provider.models.find(
    (item) => item.id === modelKey.slice(slash + 1)
  )
  if (!model || model.capability !== 'text.chat') return []

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
        temperature: 0.2,
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: buildCastPrompt(study) },
              ...content
            ]
          }
        ]
      }),
      signal
    }
  )

  if (!response.ok) return []
  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const raw = json.choices?.[0]?.message?.content
  if (!raw) return []
  return attachCastFrames(parseCast(raw, shots.length), study)
}

/** 角色表聚合；模型不可用或失败时返回空表，不阻塞拉片。 */
export async function aggregateCast(
  study: FilmStudy,
  root: string,
  modelKey: string | null,
  signal?: AbortSignal
): Promise<FilmStudyCast[]> {
  if (!modelKey || !study.shots?.length) return []
  try {
    return await requestCast(study, root, modelKey, signal)
  } catch {
    return []
  }
}
