import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  parseManifest,
  parseModelsFile,
  readLocalAdapter,
  type LocalAdapterManifest
} from '../manifest'

let dir = ''
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true })
  dir = ''
})

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

  it('parses a sidecar manifest with health defaults', () => {
    const parsed = parseManifest({
      id: 'mock',
      version: '1.2.3',
      type: 'sidecar',
      protocol: 'openai',
      baseUrl: 'http://127.0.0.1:8188/v1'
    })

    expect(parsed).toMatchObject({
      type: 'sidecar',
      protocol: 'openai',
      baseUrl: 'http://127.0.0.1:8188/v1',
      health: { path: '/health', intervalMs: 30_000 }
    })
    expect(parsed.entry).toBeUndefined()
  })

  it('requires baseUrl for sidecars', () => {
    expect(() => parseManifest({ id: 'mock', type: 'sidecar' })).toThrow(
      /baseUrl/
    )
  })

  it('keeps sidecar models on official adapters', () => {
    const parsed = parseModelsFile(
      {
        models: [
          {
            id: 'mock-image',
            name: 'Mock Image',
            capability: 'image.t2i',
            remoteModel: 'mock-image',
            params: []
          }
        ]
      },
      'mock',
      'sidecar',
      'openai'
    )

    expect(parsed.provider.id).toBe('sidecar:mock')
    expect(parsed.models[0]).toMatchObject({
      adapter: 'openai-compat',
      localAdapter: 'mock'
    })
  })

  it('uses http-template for template sidecars', () => {
    const parsed = parseModelsFile(
      {
        models: [
          {
            id: 'mock-video',
            name: 'Mock Video',
            capability: 'video.t2v',
            remoteModel: 'mock-video',
            params: []
          }
        ]
      },
      'mock',
      'sidecar',
      'http-template'
    )

    expect(parsed.models[0].adapter).toBe('http-template')
  })

  it('loads template.json for http-template sidecars', async () => {
    dir = await mkdtemp(join(tmpdir(), 'cinelab-sidecar-'))
    await writeFile(
      join(dir, 'manifest.json'),
      JSON.stringify({
        id: 'mock',
        version: '0.1.0',
        type: 'sidecar',
        protocol: 'http-template',
        baseUrl: 'http://127.0.0.1:8188',
        health: { path: '/health' }
      })
    )
    await writeFile(
      join(dir, 'models.json'),
      JSON.stringify({
        models: [
          {
            id: 'mock-video',
            name: 'Mock Video',
            capability: 'video.t2v',
            remoteModel: 'mock-video',
            params: []
          }
        ]
      })
    )
    await writeFile(
      join(dir, 'template.json'),
      JSON.stringify({
        submit: { path: '/submit' },
        poll: { path: '/poll', taskIdPath: 'id', resultPath: 'url' }
      })
    )

    const data = await readLocalAdapter(dir)
    expect(data.models[0].adapter).toBe('http-template')
    expect(data.models[0].template).toMatchObject({
      submit: { path: '/submit' }
    })
  })
})
