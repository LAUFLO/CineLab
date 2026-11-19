import { promises as fs } from 'node:fs'
import type { FilmStudy } from '@shared/film-study'
import type { FilmStudyShot } from '@shared/film-study-v2'
import { resolveInside } from '../media/paths'
import { httpFetch } from '../providers/http'
import { resolveProvider } from '../settings/store'

const MAX_BATCH = 5
const MAX_TOKENS_PER_SHOT = 700

const SHOT_SCHEMA = {
  type: 'object',
  required: ['shots'],
  properties: {
    shots: {
      type: 'array',
      items: {
        type: 'object',
        required: ['index'],
        properties: {
          index: { type: 'number' },
          shotSize: {
            type: 'string',
            enum: ['特写', '近景', '中景', '全景', '远景', '航拍']
          },
          castIds: {
            type: 'array',
            items: { type: 'string' }
          },
          cameraAngle: { type: 'string' },
          cameraMove: { type: 'string' },
          lighting: { type: 'string' },
          visualDescription: { type: 'string' },
          actionSummary: { type: 'string' },
          emotion: { type: 'string' },
          dialogue: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                speaker: { type: 'string' },
                text: { type: 'string' }
              }
            }
          },
          imagePrompt: { type: 'string' },
          videoPrompt: { type: 'string' }
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

export function buildShotPrompt(
  study: FilmStudy,
  batch: FilmStudyShot[]
): string {
  const rows = batch.map((shot, index) => {
    const segment = study.segments[shot.index - 1]
    const line = segment?.voiceOver ? `｜台词：${segment.voiceOver}` : ''
    return `镜 ${shot.index}｜${shot.startTime.toFixed(1)}–${shot.endTime.toFixed(1)}s（${shot.duration.toFixed(1)}s）${line}`
  })

  const images = batch
    .map((shot, index) => {
      const first = index * 3 + 1
      return `图 ${first}–${first + 2} 是镜 ${shot.index} 的首帧、中帧、尾帧`
    })
    .join('\n')

  return [
    `你在给《${study.sourceName}》做逐镜拆解。`,
    '下面每三张图是一个镜头的首帧、中帧、尾帧，按时间顺序排列。',
    images,
    '',
    '镜头表：',
    ...rows,
    '',
    '逐镜回答：景别、机位、运镜、光线、画面、动作、情绪、台词、生成提示词。',
    '只输出 JSON，不要 Markdown、解释或代码块，结构如下：',
    JSON.stringify(SHOT_SCHEMA),
    'index 必须和镜头号一致；看不清的字段留空，不要编造。'
  ].join('\n')
}

export function parseShotAnalysis(
  raw: string,
  batch: FilmStudyShot[]
): Map<number, Partial<FilmStudyShot>> {
  const allowed = new Set(batch.map((shot) => shot.index))
  const out = new Map<number, Partial<FilmStudyShot>>()

  let parsed: unknown
  try {
    parsed = parseJson(raw)
  } catch {
    return out
  }
  if (typeof parsed !== 'object' || parsed === null) return out

  const list = (parsed as { shots?: unknown }).shots
  if (!Array.isArray(list)) return out

  for (const item of list) {
    if (typeof item !== 'object' || item === null) continue
    const value = item as Record<string, unknown>
    const index = Number(value.index)
    if (!Number.isInteger(index) || !allowed.has(index)) continue

    const patch: Partial<FilmStudyShot> = {}
    const shotSize = text(value.shotSize)
    const cameraAngle = text(value.cameraAngle)
    const cameraMove = text(value.cameraMove)
    const lighting = text(value.lighting)
    const visualDescription = text(value.visualDescription)
    const actionSummary = text(value.actionSummary)
    const emotion = text(value.emotion)
    const imagePrompt = text(value.imagePrompt)
    const videoPrompt = text(value.videoPrompt)

    if (shotSize) patch.shotSize = shotSize
    if (cameraAngle) patch.cameraAngle = cameraAngle
    if (cameraMove) patch.cameraMove = cameraMove
    if (lighting) patch.lighting = lighting
    if (visualDescription) patch.visualDescription = visualDescription
    if (actionSummary) patch.actionSummary = actionSummary
    if (emotion) patch.emotion = emotion
    if (imagePrompt) patch.imagePrompt = imagePrompt
    if (videoPrompt) patch.videoPrompt = videoPrompt

    if (Array.isArray(value.dialogue)) {
      const dialogue = value.dialogue
        .map((line) => {
          if (typeof line !== 'object' || line === null) return null
          const record = line as Record<string, unknown>
          const content = text(record.text)
          if (!content) return null
          const speaker = text(record.speaker)
          return speaker ? { speaker, text: content } : { text: content }
        })
        .filter(
          (line): line is { speaker?: string; text: string } => line !== null
        )
      if (dialogue.length > 0) patch.dialogue = dialogue
    }

    if (Array.isArray(value.castIds)) {
      const castIds = value.castIds
        .map((id) => text(id))
        .filter((id): id is string => Boolean(id))
      if (castIds.length > 0) patch.castIds = castIds
    }

    out.set(index, patch)
  }

  return out
}

async function requestBatch(
  study: FilmStudy,
  batch: FilmStudyShot[],
  root: string,
  modelKey: string,
  signal?: AbortSignal
): Promise<Map<number, Partial<FilmStudyShot>>> {
  const slash = modelKey.indexOf('/')
  if (slash <= 0) return new Map()

  const provider = await resolveProvider(modelKey.slice(0, slash))
  if (!provider?.apiKey) return new Map()

  const model = provider.models.find(
    (item) => item.id === modelKey.slice(slash + 1)
  )
  if (!model || model.capability !== 'text.chat') return new Map()

  const content: Array<Record<string, unknown>> = []
  for (const shot of batch) {
    for (const path of [shot.firstFrame, shot.midFrame, shot.lastFrame]) {
      if (!path) continue
      const data = await fs.readFile(resolveInside(root, path))
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:image/jpeg;base64,${data.toString('base64')}`
        }
      })
    }
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
        max_tokens: MAX_TOKENS_PER_SHOT * batch.length,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: buildShotPrompt(study, batch) },
              ...content
            ]
          }
        ]
      }),
      signal
    }
  )

  if (!response.ok) return new Map()
  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const raw = json.choices?.[0]?.message?.content
  if (!raw) return new Map()
  return parseShotAnalysis(raw, batch)
}

/**
 * 逐镜理解：5 镜一批，读首/中/尾帧，写回景别、运镜、画面、台词、提示词。
 * 单批失败只跳过该批，不阻塞整条拉片。
 */
export async function analyzeShots(
  study: FilmStudy,
  root: string,
  modelKey: string,
  signal?: AbortSignal,
  onProgress?: (done: number, total: number) => void,
  onlyIndex?: number
): Promise<FilmStudyShot[]> {
  const shots = study.shots ?? []
  if (shots.length === 0) return shots

  const out = shots.map((shot) => ({ ...shot }))
  const targets = onlyIndex
    ? out.filter((shot) => shot.index === onlyIndex)
    : out
  if (targets.length === 0) return out

  for (let start = 0; start < targets.length; start += MAX_BATCH) {
    if (signal?.aborted) break
    const batch = targets.slice(start, start + MAX_BATCH)
    try {
      const parsed = await requestBatch(
        study,
        batch,
        root,
        modelKey,
        signal
      )
      for (const [index, patch] of parsed) {
        const target = out.find((shot) => shot.index === index)
        if (target) Object.assign(target, patch)
      }
    } catch {
      // 这一批失败，保留空字段，继续下一批
    }
    onProgress?.(
      Math.min(targets.length, start + batch.length),
      targets.length
    )
  }

  return out
}
