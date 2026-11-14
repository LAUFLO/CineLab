import { describe, expect, it } from 'vitest'

const sources = import.meta.glob('/src/renderer/src/**/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>

const nativeTag = /<(button|input|textarea|select)\b/

describe('native controls', () => {
  it('feature code only uses shared UI controls', () => {
    const offenders = Object.entries(sources)
      .filter(([file]) => !file.includes('/components/ui/'))
      .filter(([, code]) => nativeTag.test(code))
      .map(([file]) => file.replace('/src/renderer/src/', ''))

    expect(offenders).toEqual([])
  })
})
