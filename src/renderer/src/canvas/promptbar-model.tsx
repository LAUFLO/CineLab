import type { ReactNode } from 'react'
import type { NodeKind } from '@shared/canvas-schema'
import type { ModelDef, ParamDef } from '@shared/provider-schema'
import type { ReferenceInput } from '@shared/generation'

export const WIDTH = 760
export const HEIGHT = 196

export const PLACEHOLDER: Record<NodeKind, string> = {
  text: '写下你想讲的故事、场景或角色设定。例如：一个来自未来的机器人，在城市屋顶看星星。',
  image:
    '可直接文生图，或上传图片输入文字指令对图片进行编辑，如：将背景改为雪夜',
  video: '描述你想要生成的画面内容，@引用素材',
  audio: '输入要朗读的文本，或描述想要的音乐',
  study: '拉片节点'
}

export interface ModelOption {
  key: string
  providerName: string
  model: ModelDef
}

export function defaultParams(model: ModelDef): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const param of model.params) {
    if (param.defaultValue !== undefined) values[param.key] = param.defaultValue
  }
  return values
}

const DURATION_PARAM_KEYS = new Set(['duration', 'seconds'])
const RESOLUTION_PARAM_KEYS = new Set(['resolution', 'size'])

function isUnitlessNumber(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value)
  return (
    typeof value === 'string' &&
    value.trim() !== '' &&
    /^-?\d+(\.\d+)?$/.test(value.trim())
  )
}

export function paramGroupName(param: ParamDef): string {
  if (param.key === 'ratio' || param.key === 'aspect_ratio') return '比例'
  if (param.key === 'size') return param.group?.trim() || '尺寸'
  if (param.key === 'resolution') return param.group?.trim() || '清晰度'
  return param.group?.trim() || param.label?.trim() || '其它'
}

export function paramLabel(param: ParamDef, value: unknown): string {
  if (param.type === 'boolean') {
    return value ? '开' : '关'
  }
  if (param.type === 'select') {
    const option = param.options?.find((item) => item.value === value)
    const label = option?.label ?? String(value ?? '')
    return RESOLUTION_PARAM_KEYS.has(param.key) &&
      isUnitlessNumber(label.trim())
      ? `${label}P`
      : label
  }
  if (DURATION_PARAM_KEYS.has(param.key) && isUnitlessNumber(value)) {
    return `${value}s`
  }
  if (RESOLUTION_PARAM_KEYS.has(param.key) && isUnitlessNumber(value)) {
    return `${value}P`
  }
  return String(value ?? '')
}

export function ratioOf(label: string): string | null {
  const match = /^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/.exec(label.trim())
  return match ? `${match[1]} / ${match[2]}` : null
}

export type MentionGroupName = '已引用' | '画布' | '资产库' | '角色'

export type RefKind = 'image' | 'video' | 'audio'
export type MentionKind = RefKind | 'text'

export interface PickedRef extends ReferenceInput {
  kind: RefKind
}

export interface MentionItem {
  key: string
  name: string
  group: MentionGroupName
  path?: string
  scope?: ReferenceInput['scope']
  refs?: ReferenceInput[]
  thumb?: string
  kind?: MentionKind
  nodeId?: string
}

export const VIDEO_PATH = /\.(mp4|webm|mov|mkv)$/i

export const MAX_TEXT_CONTEXT = 4000

export interface TextContext {
  title: string
  text: string
  nodeId?: string
}

export interface Span {
  start: number
  end: number
}

export interface TitleSpan extends Span {
  name: string
}

/**
 * 在文本中按标题长度从长到短做不重叠匹配。
 * 避免 `@视频节点 5 · 当前帧 · 提示词` 同时命中更短的 `视频节点 5 · 当前帧`。
 */
export function matchTitleSpans(
  text: string,
  names: string[],
  options: { prefix?: string; occupied?: Span[] } = {}
): TitleSpan[] {
  const prefix = options.prefix ?? ''
  const occupied: Span[] = [...(options.occupied ?? [])]
  const result: TitleSpan[] = []
  const seen = new Set<string>()
  const sorted = [...new Set(names.filter(Boolean))].sort(
    (a, b) => b.length - a.length
  )

  for (const name of sorted) {
    const needle = `${prefix}${name}`
    let from = 0
    while (from <= text.length - needle.length) {
      const start = text.indexOf(needle, from)
      if (start < 0) break
      const end = start + needle.length
      const overlaps = occupied.some(
        (span) => start < span.end && end > span.start
      )
      if (!overlaps) {
        occupied.push({ start, end })
        if (!seen.has(name)) {
          seen.add(name)
          result.push({ name, start, end })
        }
        break
      }
      from = start + 1
    }
  }

  return result
}

export function buildPromptWithContext(
  prompt: string,
  contexts: TextContext[]
): string {
  if (contexts.length === 0) return prompt
  const blocks = contexts.map(
    (item) =>
      `【参考文本：${item.title}】\n${item.text.slice(0, MAX_TEXT_CONTEXT)}`
  )
  return [...blocks, prompt].filter(Boolean).join('\n\n---\n\n')
}

export function isVideoPath(path: string): boolean {
  return VIDEO_PATH.test(path)
}

export const MENTION_GROUPS: MentionGroupName[] = ['已引用', '画布', '资产库', '角色']

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function renderMentionText(text: string, names: string[]): ReactNode[] {
  if (names.length === 0) return [text]

  const pattern = new RegExp(`(@(?:${names.map(escapeRegExp).join('|')}))`, 'g')
  return text.split(pattern).map((part, index) => {
    const mentioned =
      part.startsWith('@') && names.some((name) => part === `@${name}`)

    return mentioned ? (
      <span
        key={index}
        className="rounded-md bg-[color-mix(in_srgb,var(--link)_16%,transparent)] text-link"
      >
        {part}
      </span>
    ) : (
      part
    )
  })
}
