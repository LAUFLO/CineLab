import { describe, expect, it } from 'vitest'
import { isAllowedExternalUrl } from '../external-url'

describe('isAllowedExternalUrl', () => {
  it('allows http and https', () => {
    expect(isAllowedExternalUrl('https://github.com/LAUFLO/CineLab')).toBe(true)
    expect(isAllowedExternalUrl('http://localhost:3000')).toBe(true)
  })

  it('rejects dangerous or local schemes', () => {
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedExternalUrl('file:///C:/Windows/System32/calc.exe')).toBe(false)
    expect(isAllowedExternalUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
    expect(isAllowedExternalUrl('mailto:test@example.com')).toBe(false)
    expect(isAllowedExternalUrl('cinelab-asset://local/a.png')).toBe(false)
  })

  it('rejects malformed URLs', () => {
    expect(isAllowedExternalUrl('not a url')).toBe(false)
    expect(isAllowedExternalUrl('')).toBe(false)
  })
})
