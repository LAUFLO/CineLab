import type { ReactNode } from 'react'
import type { NodeKind } from '@shared/canvas-schema'
import type { ModelDef, ParamDef } from '@shared/provider-schema'
import type { ReferenceInput } from '@shared/generation'

export const WIDTH = 760
export const HEIGHT = 132

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

export function paramLabel(param: ParamDef, value: unknown): string {
  if (param.type === 'boolean') {
    return value ? '开' : '关'
  }
  if (param.type === 'select') {
    return (
      param.options?.find((option) => option.value === value)?.label ??
      String(value ?? '')
    )
  }
  return String(value ?? '')
}

export function ratioOf(label: string): string | null {
  const match = /^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/.exec(label.trim())
  return match ? `${match[1]} / ${match[2]}` : null
}

export type MentionGroupName = '已引用' | '画布' | '资产库' | '角色'

export type RefKind = 'image' | 'video'

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
  kind?: RefKind
}

export const VIDEO_PATH = /\.(mp4|webm|mov|mkv)$/i

export const MAX_TEXT_CONTEXT = 4000

export interface TextContext {
  title: string
  text: string
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
      <span key={index} className="promptbar__mention">
        {part}
      </span>
    ) : (
      part
    )
  })
}
