/** 风格库分类。官方与自定义风格共用同一套分类。 */
export const STYLE_CATEGORIES = [
  '电影感',
  '动画与手绘',
  '复古媒介',
  '科幻与未来',
  '奇幻与超现实',
  '国风与东方'
] as const

export type StyleCategory = (typeof STYLE_CATEGORIES)[number]

export type StyleSource = 'official' | 'user'

/**
 * 风格卡是提示词片段 + 展示封面的组合。
 * 封面只用于选择界面，不参与生成；生成时只拼接 prompt。
 */
export interface StyleCard {
  /** 官方为稳定 slug；自定义为「风格/<目录名>」 */
  id: string
  name: string
  category: string
  /** 相对封面路径：官方相对风格库根，自定义相对素材库根 */
  cover: string
  /** 风格提示词片段，只描述画风，不包含具体主体 */
  prompt: string
  version: number
  source: StyleSource
}

export interface StyleSaveInput {
  /** 传入时为编辑，缺省为新建 */
  id?: string
  name: string
  category: string
  prompt: string
  /** 新建或替换封面时的本地图片绝对路径 */
  coverSourcePath?: string
}

const ILLEGAL_NAME = /[\\/:*?"<>|]/

/** 名称比较键：全角转半角、去首尾空白、忽略大小写和空白。 */
export function styleNameKey(name: string): string {
  return name.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, '')
}

export function validateStyleName(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return '风格名称不能为空'
  if (trimmed.length > 30) return '风格名称不能超过 30 个字符'
  if (ILLEGAL_NAME.test(trimmed)) return '风格名称不能包含 \\ / : * ? " < > |'
  return null
}

export function validateStylePrompt(prompt: string): string | null {
  const trimmed = prompt.trim()
  if (!trimmed) return '风格提示词不能为空'
  if (trimmed.length > 300) return '风格提示词不能超过 300 个字符'
  return null
}

/** 目录名只保留安全字符，显示名仍然使用用户输入。 */
export function styleFolderName(name: string): string {
  return name
    .normalize('NFKC')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 40)
}
