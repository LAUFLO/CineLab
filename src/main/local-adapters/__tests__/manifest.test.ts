import { describe, expect, it } from 'vitest'
import {
  parseManifest,
  parseModelsFile,
  type LocalAdapterManifest
} from '../manifest'

const manifest: LocalAdapterManifest = {
  id: 'echo',
  version: '0.1.0',
  type: 'code',
  entry: 'adapter.ts',
  models: 'models.json'
}

describe('local adapter manifest', () => {
  it('parses a valid manifest with defaults', () => {
    expect(parseManifest({ id: 'echo', version: '0.1.0', type: 'code' })).toEqual(
      {
        id: 'echo',
        version: '0.1.0',
        type: 'code',
        entry: 'adapter.ts',
        models: 'models.json'
      }
    )
  })

  it('rejects invalid ids and types', () => {
    expect(() => parseManifest({ id: 'bad id', type: 'code' })).toThrow()
    expect(() => parseManifest({ id: 'echo', type: 'plugin' })).toThrow()
  })

  it('forces local adapter fields on every model', () => {
    const parsed = parseModelsFile(
      {
        models: [
          {
            id: 'echo-image',
            name: 'Echo Image',
            capability: 'image.t2i',
            remoteModel: 'echo',
            params: []
          }
        ]
      },
      'echo'
    )

    expect(parsed.provider.id).toBe('local:echo')
    expect(parsed.models[0]).toMatchObject({
      id: 'echo-image',
      adapter: 'local:echo',
      localAdapter: 'echo'
    })
  })

  it('accepts a bare model array and rejects missing models', () => {
    expect(
      parseModelsFile(
        [
          {
            id: 'echo',
            name: 'Echo',
            capability: 'image.t2i',
            remoteModel: 'echo',
            params: []
          }
        ],
        'echo'
      ).models
    ).toHaveLength(1)

    expect(() => parseModelsFile({}, 'echo')).toThrow()
  })

  it('keeps manifest entry and models paths', () => {
    expect(parseManifest(manifest).entry).toBe('adapter.ts')
  })
})
