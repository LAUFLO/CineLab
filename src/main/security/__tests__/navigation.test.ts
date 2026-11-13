import { describe, expect, it } from 'vitest'
import { isAllowedNavigation } from '../navigation'

describe('isAllowedNavigation', () => {
  it('allows the same document with or without a hash', () => {
    expect(isAllowedNavigation('file:///app/index.html', 'file:///app/index.html')).toBe(true)
    expect(isAllowedNavigation('file:///app/index.html#a', 'file:///app/index.html#b')).toBe(true)
  })

  it('allows Vite dev-server navigations on the same origin', () => {
    expect(
      isAllowedNavigation(
        'http://localhost:5173/',
        'http://localhost:5173/index.html?t=1',
        'http://localhost:5173/'
      )
    ).toBe(true)
  })

  it('blocks navigation to another document', () => {
    expect(isAllowedNavigation('file:///app/index.html', 'file:///app/other.html')).toBe(false)
    expect(isAllowedNavigation('file:///app/index.html', 'https://github.com')).toBe(false)
  })

  it('blocks empty URLs', () => {
    expect(isAllowedNavigation('', 'file:///app/index.html')).toBe(false)
    expect(isAllowedNavigation('file:///app/index.html', '')).toBe(false)
  })
})
