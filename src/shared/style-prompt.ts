import type { StyleCard } from './style-schema'

/**
 * 把风格片段拼到用户提示词前面，作为视频/生图模型的风格锚点。
 * 片段只描述画风，主体和动作完全来自用户输入。
 */
export function buildStyledPrompt(
  prompt: string,
  style: StyleCard | null | undefined
): string {
  const theme = prompt.trim()
  const fragment = style?.prompt.trim() ?? ''

  if (!fragment) return theme
  if (!theme) return fragment
  if (theme.includes(fragment)) return theme

  return `${fragment}\n\n${theme}`
}
