import { marked } from 'marked'

export function renderMarkdown(text: string): string {
  if (!text.trim()) return ''
  try {
    return marked.parse(text, {
      async: false,
      gfm: true,
      breaks: true
    }) as string
  } catch {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>')
  }
}
