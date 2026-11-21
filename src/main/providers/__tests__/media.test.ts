import { describe, expect, it } from 'vitest'
import { dataUrlToBase64, normalizeMime, toLoadedRef } from '../media'

describe('media', () => {
  it('normalizes common MIME aliases and casing', () => {
    expect(normalizeMime('IMAGE/JPG')).toBe('image/jpeg')
    expect(normalizeMime(' image/webp ')).toBe('image/webp')
    expect(normalizeMime('audio/mpeg')).toBe('audio/mpeg')
  })

  it('extracts base64 from data URLs and keeps plain URLs', () => {
    expect(dataUrlToBase64('data:image/png;base64,AAAA')).toBe('AAAA')
    expect(dataUrlToBase64('https://cdn.example.com/a.png')).toBe(
      'https://cdn.example.com/a.png'
    )
  })

  it('builds a loaded ref with base64 and normalized MIME', () => {
    expect(
      toLoadedRef({
        dataUrl: 'data:image/jpg;base64,BBBB',
        mime: 'IMAGE/JPG',
        role: 'firstFrame',
        media: 'image'
      })
    ).toEqual({
      dataUrl: 'data:image/jpg;base64,BBBB',
      base64: 'BBBB',
      mime: 'image/jpeg',
      role: 'firstFrame',
      media: 'image'
    })
  })
})
