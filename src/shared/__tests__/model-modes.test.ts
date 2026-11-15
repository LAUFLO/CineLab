import { describe, expect, it } from 'vitest'
import {
  inferModelModes,
  modelInputs,
  modelModeCompatibility,
  modelModeIds,
  modelOperationSupport,
  type ModelDef
} from '../provider-schema'
import {
  modeSupportsOperation,
  normalizeModelModes,
  resolveModeSlots
} from '../model-modes'

function createModel(patch: Partial<ModelDef> = {}): ModelDef {
  return {
    id: 'test-model',
    name: 'Test Model',
    capability: 'video.t2v',
    remoteModel: 'test-model',
    params: [],
    ...patch
  }
}

describe('normalizeModelModes', () => {
  it('accepts string shorthands and object overrides', () => {
    const modes = normalizeModelModes([
      't2i',
      {
        id: 'i2i',
        slots: { reference: { max: 10 } },
        operations: { 'shot-retake': 'native' }
      }
    ])

    expect(modes).toEqual([
      { id: 't2i' },
      {
        id: 'i2i',
        slots: { reference: { max: 10 } },
        operations: { 'shot-retake': 'native' }
      }
    ])
  })

  it('drops unknown and duplicate modes', () => {
    const modes = normalizeModelModes(['t2i', 't2i', 'unknown', 42, null])
    expect(modes).toEqual([{ id: 't2i' }])
  })
})

describe('resolveModeSlots', () => {
  it('merges per-model slot limits over the default definition', () => {
    const slots = resolveModeSlots({
      id: 'reference',
      slots: {
        'reference-image': { max: 30 },
        'reference-video': { max: 10 }
      }
    })

    expect(slots.find((slot) => slot.id === 'reference-image')?.max).toBe(30)
    expect(slots.find((slot) => slot.id === 'reference-video')?.max).toBe(10)
    expect(slots.find((slot) => slot.id === 'reference-audio')?.max).toBe(1)
  })
})

describe('modeSupportsOperation', () => {
  it('defaults to native for edit and extend modes', () => {
    expect(modeSupportsOperation({ id: 'video-edit' }, 'shot-retake')).toBe(
      'native'
    )
    expect(modeSupportsOperation({ id: 'video-edit' }, 'extend')).toBe('none')
    expect(modeSupportsOperation({ id: 'video-extend' }, 'extend')).toBe(
      'native'
    )
  })

  it('lets a model downgrade an operation to prompted or none', () => {
    expect(
      modeSupportsOperation(
        { id: 'video-edit', operations: { 'element-replace': 'prompted' } },
        'element-replace'
      )
    ).toBe('prompted')

    expect(
      modeSupportsOperation(
        { id: 'video-edit', operations: { 'shot-retake': 'none' } },
        'shot-retake'
      )
    ).toBe('none')
  })
})

describe('inferModelModes', () => {
  it('infers image modes from legacy capability and inputs', () => {
    expect(
      inferModelModes({ capability: 'image.t2i', inputs: ['text'] })
    ).toEqual([{ id: 't2i' }])

    expect(
      inferModelModes({ capability: 'image.t2i', inputs: ['text', 'image'] })
    ).toEqual([{ id: 't2i' }, { id: 'i2i' }])

    expect(inferModelModes({ capability: 'image.i2i' })).toEqual([{ id: 'i2i' }])
  })

  it('infers video modes conservatively', () => {
    expect(
      inferModelModes({ capability: 'video.t2v', inputs: ['text'] })
    ).toEqual([{ id: 't2v' }])

    expect(
      inferModelModes({ capability: 'video.t2v', inputs: ['text', 'image'] })
    ).toEqual([{ id: 't2v' }, { id: 'first-frame' }])

    expect(
      inferModelModes({
        capability: 'video.t2v',
        inputs: ['text', 'video'],
        operations: ['extend']
      })
    ).toEqual([{ id: 't2v' }, { id: 'video-extend' }])
  })

  it('prefers explicit modes over legacy inference', () => {
    expect(
      inferModelModes({
        capability: 'video.t2v',
        inputs: ['text', 'image'],
        modes: ['t2v', 'reference']
      })
    ).toEqual([{ id: 't2v' }, { id: 'reference' }])
  })
})

describe('model helpers', () => {
  it('derives media inputs from explicit modes', () => {
    const model = createModel({ modes: ['t2v', 'video-edit'] })
    expect(modelInputs(model)).toEqual(['text', 'video', 'image'])
  })

  it('derives operation support from modes', () => {
    const model = createModel({
      modes: [
        {
          id: 'video-edit',
          operations: {
            'shot-retake': 'native',
            'element-replace': 'prompted'
          }
        },
        { id: 'video-extend' }
      ]
    })

    expect(modelModeIds(model)).toEqual(['video-edit', 'video-extend'])
    expect(modelOperationSupport(model)).toEqual({
      'shot-retake': 'native',
      'element-replace': 'prompted',
      extend: 'native'
    })
  })

  it('falls back to legacy inference when modes are absent', () => {
    const model = createModel({
      capability: 'image.t2i',
      inputs: ['text', 'image']
    })

    expect(modelModeIds(model)).toEqual(['t2i', 'i2i'])
    expect(modelOperationSupport(model)).toEqual({
      'shot-retake': 'none',
      'element-replace': 'none',
      extend: 'none'
    })
  })
})

describe('modelModeCompatibility', () => {
  const base = {
    kind: 'image' as const,
    imageCount: 0,
    videoCount: 0,
    hasFirstFrame: false,
    hasLastFrame: false
  }

  it('blocks a text-to-image model when an image is attached', () => {
    const model = createModel({ capability: 'image.t2i', modes: ['t2i'] })

    expect(modelModeCompatibility(model, base).ok).toBe(true)
    expect(
      modelModeCompatibility(model, {
        ...base,
        imageCount: 1,
        hasFirstFrame: true
      })
    ).toEqual({ ok: false, reason: '该模型不支持图片输入' })
  })

  it('allows first-last when two frames are attached', () => {
    const model = createModel({ modes: ['first-last'] })

    expect(
      modelModeCompatibility(model, {
        ...base,
        kind: 'video',
        imageCount: 2,
        hasFirstFrame: true,
        hasLastFrame: true
      }).ok
    ).toBe(true)
  })

  it('blocks video input when no mode can accept a source video', () => {
    const model = createModel({ modes: ['t2v', 'first-frame'] })

    expect(
      modelModeCompatibility(model, {
        ...base,
        kind: 'video',
        videoCount: 1
      })
    ).toEqual({ ok: false, reason: '该模型不支持视频输入' })
  })
})
