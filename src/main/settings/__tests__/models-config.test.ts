import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: () => process.cwd()
  }
}))

import { parseModelsFile } from '../models-config'

const validModel = {
  id: 'm1',
  name: 'Model 1',
  capability: 'image.t2i',
  remoteModel: 'm1',
  params: []
}

const validProvider = {
  id: 'p1',
  name: 'Provider 1',
  baseUrl: 'https://api.example.com/v1',
  models: [validModel]
}

describe('parseModelsFile', () => {
  it('accepts a valid provider with custom headers', () => {
    const parsed = parseModelsFile(
      {
        version: 1,
        providers: [{ ...validProvider, headers: { 'x-app': 'opencode' } }]
      },
      'models.json'
    )

    expect(parsed.errors).toEqual([])
    expect(parsed.providers[0].headers).toEqual({ 'x-app': 'opencode' })
  })

  it('warns about plaintext api keys', () => {
    const parsed = parseModelsFile(
      {
        version: 1,
        providers: [{ ...validProvider, apiKey: 'sk-test' }]
      },
      'models.json'
    )

    expect(parsed.warnings[0]).toContain('明文 Key')
  })

  it('rejects duplicate model ids', () => {
    const parsed = parseModelsFile(
      {
        version: 1,
        providers: [
          {
            ...validProvider,
            models: [validModel, { ...validModel }]
          }
        ]
      },
      'models.json'
    )

    expect(parsed.errors.some((error) => error.includes('id 重复'))).toBe(true)
  })

  it('rejects invalid header values', () => {
    const parsed = parseModelsFile(
      {
        version: 1,
        providers: [
          {
            ...validProvider,
            headers: { 'x-app': 42 }
          }
        ]
      },
      'models.json'
    )

    expect(
      parsed.errors.some((error) => error.includes('必须是字符串'))
    ).toBe(true)
  })
})
