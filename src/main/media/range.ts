export interface ByteRange {
  start: number
  end: number
}

/**
 * Parse a single HTTP byte range. Multi-range requests are not supported and
 * return null, which the protocol layer maps to 416.
 */
export function parseByteRange(header: string | null, size: number): ByteRange | null {
  if (!header || size <= 0) return null

  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim())
  if (!match) return null

  const [, rawStart, rawEnd] = match
  if (!rawStart && !rawEnd) return null

  if (!rawStart) {
    const suffix = Number(rawEnd)
    if (!Number.isFinite(suffix) || suffix <= 0) return null
    return { start: Math.max(0, size - suffix), end: size - 1 }
  }

  const start = Number(rawStart)
  const requestedEnd = rawEnd ? Number(rawEnd) : size - 1
  if (!Number.isFinite(start) || !Number.isFinite(requestedEnd)) return null
  if (start >= size || requestedEnd < start) return null

  return { start, end: Math.min(requestedEnd, size - 1) }
}
