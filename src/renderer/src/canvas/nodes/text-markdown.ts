import DOMPurify from 'dompurify'
import { marked } from 'marked'

const ALLOWED_TAGS = [
  'a',
  'blockquote',
  'br',
  'code',
  'del',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'img',
  'input',
  'li',
  'ol',
  'p',
  'pre',
  'strong',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'ul'
]

const ALLOWED_ATTR = [
  'alt',
  'checked',
  'disabled',
  'href',
  'rel',
  'src',
  'target',
  'title',
  'type'
]

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.getAttribute('href')) {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

/** Markdown 正文排版，不含定位、颜色和滚动条，供节点卡片与所见即所得编辑器共用。 */
export const MARKDOWN_CONTENT_CLASS = [
  'text-sm leading-[22px] [overflow-wrap:anywhere] [word-break:break-word]',
  '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
  '[&_h1]:mt-[0.7em] [&_h1]:mr-0 [&_h1]:mb-[0.35em] [&_h1]:ml-0 [&_h1]:text-xl [&_h1]:leading-[1.35] [&_h1]:font-semibold [&_h1]:text-fg',
  '[&_h2]:mt-[0.7em] [&_h2]:mr-0 [&_h2]:mb-[0.35em] [&_h2]:ml-0 [&_h2]:text-[17px] [&_h2]:leading-[1.35] [&_h2]:font-semibold [&_h2]:text-fg',
  '[&_h3]:mt-[0.7em] [&_h3]:mr-0 [&_h3]:mb-[0.35em] [&_h3]:ml-0 [&_h3]:text-[15px] [&_h3]:leading-[1.35] [&_h3]:font-semibold [&_h3]:text-fg',
  '[&_p]:mt-0 [&_p]:mr-0 [&_p]:mb-[0.7em] [&_p]:ml-0',
  '[&_ul]:mt-[0.4em] [&_ul]:mr-0 [&_ul]:mb-[0.7em] [&_ul]:ml-0 [&_ul]:list-disc [&_ul]:pl-[1.4em]',
  '[&_ol]:mt-[0.4em] [&_ol]:mr-0 [&_ol]:mb-[0.7em] [&_ol]:ml-0 [&_ol]:list-decimal [&_ol]:pl-[1.4em]',
  '[&_li]:mt-[0.15em] [&_li]:mb-[0.15em]',
  '[&_li>p]:my-0',
  '[&_blockquote]:mt-[0.5em] [&_blockquote]:mr-0 [&_blockquote]:mb-[0.7em] [&_blockquote]:ml-0 [&_blockquote]:border-l-2 [&_blockquote]:border-border-strong [&_blockquote]:p-[4px_10px] [&_blockquote]:text-fg-subtle',
  '[&_code]:rounded-[3px] [&_code]:bg-surface-hover [&_code]:p-[1px_4px] [&_code]:font-mono [&_code]:text-[0.9em] [&_code]:text-fg',
  '[&_pre]:mt-[0.5em] [&_pre]:mr-0 [&_pre]:mb-[0.7em] [&_pre]:ml-0 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-surface-hover [&_pre]:p-[10px_12px] [&_pre]:[overflow-wrap:normal] [&_pre]:[word-break:normal]',
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
  '[&_table]:mt-[0.5em] [&_table]:mb-[0.7em] [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs',
  '[&_th]:border [&_th]:border-border [&_th]:bg-surface-hover [&_th]:p-[5px_7px] [&_th]:text-left [&_th]:align-top [&_th]:text-fg',
  '[&_td]:border [&_td]:border-border [&_td]:p-[5px_7px] [&_td]:text-left [&_td]:align-top',
  '[&_a]:text-fg [&_a]:underline'
].join(' ')

/** 节点卡片中的 Markdown 预览容器。 */
export const MARKDOWN_CLASS = [
  'absolute inset-0 m-0 overflow-x-hidden overflow-y-auto p-4 text-fg-muted',
  MARKDOWN_CONTENT_CLASS,
  '[&::-webkit-scrollbar]:h-[7px] [&::-webkit-scrollbar]:w-[7px]',
  '[&::-webkit-scrollbar-track]:bg-transparent',
  '[&::-webkit-scrollbar-thumb]:rounded-pill [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-transparent [&::-webkit-scrollbar-thumb]:bg-[color-mix(in_srgb,var(--text-3)_52%,transparent)] [&::-webkit-scrollbar-thumb]:bg-clip-padding',
  '[&::-webkit-scrollbar-thumb:hover]:bg-[color-mix(in_srgb,var(--text-3)_72%,transparent)]'
].join(' ')

export function renderMarkdown(text: string): string {
  if (!text.trim()) return ''

  try {
    const html = marked.parse(text, {
      async: false,
      gfm: true,
      breaks: true
    }) as string

    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      ALLOW_DATA_ATTR: false
    })
  } catch {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>')
  }
}
