import { describe, expect, it } from 'vitest'
import { mergeHeaders, resolveCustomHeaders } from '../headers'

describe('resolveCustomHeaders', () => {
  it('expands environment placeholders', () => {
    process.env.CINELAB_HEADER_TEST = 'from-env'
    expect(
      resolveCustomHeaders({ 'x-app': '${CINELAB_HEADER_TEST}' })
    ).toEqual({ 'x-app': 'from-env' })
    delete process.env.CINELAB_HEADER_TEST
  })

  it('uses an empty value when the environment variable is missing', () => {
    expect(
      resolveCustomHeaders({ 'x-app': '${CINELAB_MISSING_HEADER}' })
    ).toEqual({ 'x-app': '' })
  })

  it('skips blank header names', () => {
    expect(resolveCustomHeaders({ '  ': 'value', 'x-app': 'ok' })).toEqual({
      'x-app': 'ok'
    })
  })
})

describe('mergeHeaders', () => {
  it('keeps base headers and appends custom ones', () => {
    const result = mergeHeaders(
      { Authorization: 'Bearer key', 'Content-Type': 'application/json' },
      { 'x-app': 'opencode' }
    )

    expect(result).toEqual({
      Authorization: 'Bearer key',
      'Content-Type': 'application/json',
      'x-app': 'opencode'
    })
  })

  it('lets custom headers override defaults', () => {
    expect(
      mergeHeaders({ Authorization: 'Bearer key' }, { Authorization: 'Custom' })
        .Authorization
    ).toBe('Custom')
  })
})
