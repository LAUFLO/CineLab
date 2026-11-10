import { describe, expect, it, vi } from 'vitest'
import type { ModelDef, ProviderConfig } from '@shared/provider-schema'

const settings = vi.hoisted(() => ({
  listProviders: vi.fn(),
  resolveProvider: vi.fn()
}))

vi.mock('../../settings/store', () => ({
  listProviders: settings.listProviders,
  resolveProvider: settings.resolveProvider
}))

import { listTextModels, resolveTextModel } from '../model'

function textModel(id: string): ModelDef {
  return {
    id,
    name: `模型 ${id}`,
    capability: 'text.chat',
    remoteModel: id,
    params: []
  }
}

function provider(id: string, models: ModelDef[], hasKey = true): ProviderConfig {
  return {
    id,
    name: `供应商 ${id}`,
    type: 'openai-compat',
    baseUrl: 'https://example.com/v1',
    models,
    hasKey,
    hasSecret: false,
    createdAt: '',
    updatedAt: ''
  }
}

describe('agent text models', () => {
  it('lists and resolves configured text models', async () => {
    const model = textModel('chat-1')
    settings.listProviders.mockResolvedValue([
      provider('p1', [model]),
      provider('p2', [textModel('chat-2')], false)
    ])
    settings.resolveProvider.mockImplementation(async (id: string) =>
      id === 'p1'
        ? {
            type: 'openai-compat',
            baseUrl: 'https://example.com/v1',
            apiKey: 'key',
            secretKey: '',
            models: [model]
          }
        : null
    )

    const models = await listTextModels()
    expect(models).toEqual([
      {
        providerId: 'p1',
        modelId: 'chat-1',
        name: '模型 chat-1',
        providerName: '供应商 p1',
        output: 'text'
      }
    ])

    const runtime = await resolveTextModel('p1/chat-1')
    expect(runtime?.info.modelId).toBe('chat-1')
    expect(await resolveTextModel('p1/missing')).toBeNull()
    expect(await resolveTextModel('p2/chat-2')).toBeNull()
  })

  it('falls back to the first available text model', async () => {
    const model = textModel('chat-1')
    settings.listProviders.mockResolvedValue([provider('p1', [model])])
    settings.resolveProvider.mockResolvedValue({
      type: 'openai-compat',
      baseUrl: 'https://example.com/v1',
      apiKey: 'key',
      secretKey: '',
      models: [model]
    })

    const runtime = await resolveTextModel()
    expect(runtime?.info).toMatchObject({
      providerId: 'p1',
      modelId: 'chat-1'
    })
  })
})
