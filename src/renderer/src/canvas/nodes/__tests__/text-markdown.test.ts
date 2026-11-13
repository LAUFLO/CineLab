// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../text-markdown'

describe('renderMarkdown', () => {
  it('renders basic markdown', () => {
    expect(renderMarkdown('**bold**')).toContain('<strong>bold</strong>')
  })

  it('removes script tags', () => {
    const html = renderMarkdown('<script>alert(1)</script>')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('alert(1)')
  })

  it('removes event handler attributes', () => {
    const html = renderMarkdown('<img src="x" onerror="window.__xss=1">')
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('__xss')
  })

  it('removes javascript links', () => {
    const html = renderMarkdown('[click](javascript:alert(1))')
    expect(html.toLowerCase()).not.toContain('javascript:')
  })

  it('removes svg and other non-whitelisted tags', () => {
    const html = renderMarkdown('<svg onload="alert(1)"></svg><iframe src="x"></iframe>')
    expect(html).not.toContain('<svg')
    expect(html).not.toContain('<iframe')
    expect(html).not.toContain('onload')
  })

  it('adds safe attributes to external links', () => {
    const html = renderMarkdown('[GitHub](https://github.com)')
    expect(html).toContain('href="https://github.com"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('returns an empty string for empty input', () => {
    expect(renderMarkdown('   ')).toBe('')
  })
})
