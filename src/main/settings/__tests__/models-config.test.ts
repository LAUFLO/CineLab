import { describe, expect, it, vi } from 'vitest'
import type { ModelsFileModel, ModelsFileProvider } from '@shared/models-file'
import {
  PROVIDER_PRESETS,
  recommendedModelsForPreset
} from '@shared/provider-presets'

vi.mock('electron', () => ({
  app: {
    getPath: () => process.cwd()
  }
}))

import { parseModelsFile, resolveModels } from '../models-config'

const validModel: ModelsFileModel = {
  id: 'm1',
  name: 'Model 1',
  capability: 'image.t2i',
  remoteModel: 'm1',
  params: []
}

const validProvider: ModelsFileProvider = {
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

  it('accepts model input capabilities', () => {
    const parsed = parseModelsFile(
      {
        version: 1,
        providers: [
          {
            ...validProvider,
            models: [{ ...validModel, inputs: ['text', 'image'] }]
          }
        ]
      },
      'models.json'
    )

    expect(parsed.errors).toEqual([])
    expect(parsed.providers[0].models[0].inputs).toEqual(['text', 'image'])
  })

  it('rejects unknown model input capabilities', () => {
    const parsed = parseModelsFile(
      {
        version: 1,
        providers: [
          {
            ...validProvider,
            models: [{ ...validModel, inputs: ['text', 'hologram'] }]
          }
        ]
      },
      'models.json'
    )

    expect(parsed.errors.some((error) => error.includes('inputs'))).toBe(true)
  })

  it('infers inputs for models without an explicit declaration', () => {
    const models = resolveModels({
      ...validProvider,
      models: [{ ...validModel, remoteModel: 'moss-image-sft-1.0' }]
    })

    expect(models[0].inputs).toEqual(['text'])
  })

  it('keeps explicit inputs when resolving models', () => {
    const models = resolveModels({
      ...validProvider,
      models: [{ ...validModel, inputs: ['text', 'image'] }]
    })

    expect(models[0].inputs).toEqual(['text', 'image'])
  })

  it('accepts extraBody and omitBody', () => {
    const parsed = parseModelsFile(
      {
        version: 1,
        providers: [
          {
            ...validProvider,
            models: [
              {
                ...validModel,
                extraBody: { background: '{{params.background}}' },
                omitBody: ['n']
              }
            ]
          }
        ]
      },
      'models.json'
    )

    expect(parsed.errors).toEqual([])
    expect(parsed.providers[0].models[0].extraBody).toEqual({
      background: '{{params.background}}'
    })
    expect(parsed.providers[0].models[0].omitBody).toEqual(['n'])
  })

  it('rejects invalid extraBody and omitBody', () => {
    const parsed = parseModelsFile(
      {
        version: 1,
        providers: [
          {
            ...validProvider,
            models: [
              {
                ...validModel,
                extraBody: ['not-an-object'],
                omitBody: ['n', 42]
              }
            ]
          }
        ]
      },
      'models.json'
    )

    expect(parsed.errors.some((error) => error.includes('extraBody'))).toBe(true)
    expect(parsed.errors.some((error) => error.includes('omitBody'))).toBe(true)
  })

  it('merges preset params by key and keeps preset metadata', () => {
    const models = resolveModels({
      ...validProvider,
      models: [
        {
          id: 'seedream',
          preset: 'doubao-seedream-5-5',
          params: [
            {
              key: 'size',
              label: '尺寸',
              type: 'select',
              options: [{ value: '1K', label: '1K' }],
              defaultValue: '1K'
            }
          ]
        }
      ]
    })

    const model = models[0]
    expect(model.preset).toBe('doubao-seedream-5-5')
    expect(model.remoteModel).toBe('doubao-seedream-5-5-261028')
    expect(model.params.find((param) => param.key === 'size')?.defaultValue).toBe(
      '1K'
    )
    // 预设新增的参数自动补上
    expect(model.params.some((param) => param.key === 'background')).toBe(true)
    expect(model.omitBody).toContain('n')
    expect(model.extraBody?.background).toBe('{{params.background}}')
    expect(
      model.modes?.map((mode) => (typeof mode === 'string' ? mode : mode.id))
    ).toContain('layer')
    expect(model.features).toContain('ocr')
  })

  it('applies protocol template defaults to a model without preset', () => {
    const models = resolveModels({
      ...validProvider,
      protocol: 'ark-video',
      models: [
        {
          id: 'seedance-2-5',
          name: 'Seedance 2.5',
          capability: 'video.t2v',
          remoteModel: 'doubao-seedance-2-5-260628'
        }
      ]
    })

    const model = models[0]
    expect(model.adapter).toBe('volcengine-video')
    expect(
      model.modes?.map((mode) => (typeof mode === 'string' ? mode : mode.id))
    ).toContain('reference')
    expect(model.params.find((param) => param.key === 'duration')?.max).toBe(30)
    expect(model.features).toContain('audio')
  })

  it('derives media inputs from modes instead of legacy preset inputs', () => {
    const models = resolveModels({
      ...validProvider,
      models: [{ id: 'seedance', preset: 'doubao-seedance' }]
    })

    // audio 是输出特性，不参与输入能力推导
    expect(models[0].inputs).toEqual(['text', 'image', 'video'])
  })

  it('applies http-template defaults from the protocol template', () => {
    const models = resolveModels({
      ...validProvider,
      protocol: 'runway-video',
      models: [
        {
          id: 'runway',
          name: 'Runway Gen-4.5',
          capability: 'video.t2v',
          remoteModel: 'gen4.5'
        }
      ]
    })

    expect(models[0].adapter).toBe('http-template')
    expect(models[0].template?.poll.resultPath).toBe('output[0]')
  })

  it('keeps preset modes through recommendedModelsForPreset', () => {
    const models = recommendedModelsForPreset('volcengine')
    const seedance = models.find((model) => model.id === 'doubao-seedance')

    expect(seedance?.modes).toBeDefined()

    const resolved = resolveModels({
      id: 'volcengine',
      name: '火山方舟',
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      models
    })

    expect(
      resolved.find((model) => model.id === 'doubao-seedance')?.inputs
    ).toEqual(['text', 'image', 'video'])
  })
})
