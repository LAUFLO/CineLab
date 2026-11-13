import { describe, expect, it } from 'vitest'
import { parseByteRange } from '../range'

describe('parseByteRange', () => {
  it('returns null without a range header', () => {
    expect(parseByteRange(null, 100)).toBeNull()
  })

  it('parses an explicit start and end', () => {
    expect(parseByteRange('bytes=0-9', 100)).toEqual({ start: 0, end: 9 })
  })

  it('parses an open-ended range', () => {
    expect(parseByteRange('bytes=10-', 100)).toEqual({ start: 10, end: 99 })
  })

  it('parses a suffix range', () => {
    expect(parseByteRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 })
  })

  it('clamps an end beyond the file size', () => {
    expect(parseByteRange('bytes=90-200', 100)).toEqual({ start: 90, end: 99 })
  })

  it('rejects invalid ranges', () => {
    expect(parseByteRange('bytes=100-', 100)).toBeNull()
    expect(parseByteRange('bytes=5-4', 100)).toBeNull()
    expect(parseByteRange('bytes=abc', 100)).toBeNull()
    expect(parseByteRange('bytes=0-1,4-5', 100)).toBeNull()
    expect(parseByteRange('bytes=-0', 100)).toBeNull()
    expect(parseByteRange('bytes=0-1', 0)).toBeNull()
  })
})
