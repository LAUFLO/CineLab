import { promises as fs } from 'node:fs'
import type { FilmStudyShot } from '@shared/film-study-v2'
import { resolveInside } from '../media/paths'
import { httpFetch } from '../providers/http'
import { resolveProvider } from '../settings/store'
import type { ProductionResult } from './production'

const MAX_REVIEW = 20
const BATCH = 5
const REVIEW_THRESHOLD = 0.5
const STRONG_THRESHOLD = 0.75

const LABELS = [
  'live_action',
  'ai_video',
  'avatar',
  'cg_3d',
  'code_render',
  'screen_capture',
  'still_motion',
  'static_hold',
  'anim_2d',
  'stop_motion',
  'film_footage'
] as const

const LABEL_ZH: Record<string, string> = {
  live_action: '实拍',
  ai_video: 'AI 生成',
  avatar: '数字人',
  cg_3d: '3D 渲染',
  code_render: '代码渲染',
  screen_capture: '录屏',
  still_motion: '静态图推拉',
  static_hold: '静帧',
  anim_2d: '2D 动画',
  stop_motion: '定格动画',
  film_footage: '影视片段'
}

const REVIEW_SCHEMA = {
  type: 'object',
  required: ['shots'],
  properties: {
    shots: {
      type: 'array',
      items: {
        type: 'object',
        required: ['index', 'label', 'confidence'],
        properties: {
          index: { type: 'number' },
          label: { type: 'string', enum: [...LABELS] },
          confidence: { type: 'number' },
          evidence: { type: 'string' }
        }
      }
    }
  }
}

export interface VlmVerdict {
  label: string
  confidence: number
  evidence?: string
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

export function buildReviewPrompt(
  studyName: string,
  batch: FilmStudyShot[]
): string {
  const rows = batch.map(
    (shot, index) =>
      `图 ${index * 3 + 1}–${index * 3 + 3} 是镜 ${shot.index} 的首帧、中帧、尾帧`
  )

  return [
    `你在复核《${studyName}》里这些镜头的制作方式。`,
    ...rows,
    '',
    `可选标签：${LABELS.join(', ')}`,
    '判断要点：',
    '- 实拍：传感器噪声、自然运动、真实光影；手指/文字/物理正常。',
    '- AI：手指或文字变形、纹理闪烁、物理不对、口型怪。',
    '- 3D：几何边缘干净、材质均匀、阴影规整。',
    '- 代码渲染：平坦色块、渐变、UI、文字卡、背景冻结。',
    '- 录屏：界面、小字号文字、鼠标。',
    '- 静帧/静态图推拉：整帧不动或只有刚体推拉。',
    '只输出 JSON，不要 Markdown、解释或代码块：',
    JSON.stringify(REVIEW_SCHEMA),
    'index 用镜号；confidence 是 0–1；evidence 一句中文，写你看到的依据。'
  ].join('\n')
}

export function parseReview(
  raw: string,
  batch: FilmStudyShot[]
): Map<number, VlmVerdict> {
  const allowed = new Set(batch.map((shot) => shot.index))
  const out = new Map<number, VlmVerdict>()

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
    const label = text(value.label)
    const confidence = Number(value.confidence)
    if (
      !Number.isInteger(index) ||
      !allowed.has(index) ||
      !label ||
      !LABELS.includes(label as (typeof LABELS)[number]) ||
      !Number.isFinite(confidence)
    ) {
      continue
    }
    const evidence = text(value.evidence)
    out.set(index, {
      label,
      confidence: Math.min(1, Math.max(0, confidence)),
      ...(evidence ? { evidence } : {})
    })
  }

  return out
}

export function fuseProduction(
  detected: ProductionResult,
  verdict: VlmVerdict | undefined
): ProductionResult {
  if (!verdict) return detected
  if (detected.confidence >= STRONG_THRESHOLD) return detected

  if (verdict.label === detected.label) {
    const evidence = [
      ...detected.evidence,
      ...(verdict.evidence ? [verdict.evidence] : [])
    ]
    return {
      ...detected,
      confidence: Math.round(
        Math.min(0.95, detected.confidence + 0.25 * verdict.confidence) * 100
      ) / 100,
      evidence: [...new Set(evidence)]
    }
  }

  return {
    ...detected,
    confidence:
      Math.round(detected.confidence * 0.7 * 100) / 100,
    evidence: [
      ...new Set([
        ...detected.evidence,
        `VLM 认为是 ${LABEL_ZH[verdict.label] ?? verdict.label}，待确认`
      ])
    ]
  }
}

async function requestReview(
  studyName: string,
  batch: FilmStudyShot[],
  root: string,
  modelKey: string,
  signal?: AbortSignal
): Promise<Map<number, VlmVerdict>> {
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
        max_tokens: 1200 * batch.length,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: buildReviewPrompt(studyName, batch) },
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
  return parseReview(raw, batch)
}

/**
 * 只复核低置信镜头：最多 20 镜，5 镜一批。
 * 高置信的确定性结论不被覆盖；失败静默跳过。
 */
export async function reviewProduction(
  shots: FilmStudyShot[],
  studyName: string,
  root: string,
  modelKey: string | null,
  signal?: AbortSignal
): Promise<FilmStudyShot[]> {
  if (!modelKey) return shots

  const targets = shots
    .filter((shot) => (shot.production?.confidence ?? 1) < REVIEW_THRESHOLD)
    .slice(0, MAX_REVIEW)
  if (targets.length === 0) return shots

  const out = shots.map((shot) => ({ ...shot }))
  for (let start = 0; start < targets.length; start += BATCH) {
    if (signal?.aborted) break
    const batch = targets.slice(start, start + BATCH)
    try {
      const verdicts = await requestReview(
        studyName,
        batch,
        root,
        modelKey,
        signal
      )
      for (const [index, verdict] of verdicts) {
        const target = out.find((shot) => shot.index === index)
        if (target?.production) {
          target.production = fuseProduction(target.production, verdict)
        }
      }
    } catch {
      // 这一批复核失败，保留确定性结论
    }
  }

  return out
}
