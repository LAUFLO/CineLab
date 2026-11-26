import { describe, expect, it } from 'vitest'
import type { ModelDef, ParamDef } from '../provider-schema'
import {
  OUTPAINT_RATIOS,
  outpaintPrompt,
  outpaintRatioOf,
  outpaintSupport,
  planOutpaint
} from '../outpaint'

function imageModel(params: ParamDef[]): ModelDef {
  return {
    id: 'test-image',
    name: '测试图片模型',
    capability: 'image.i2i',
    remoteModel: 'test-image',
    params
  }
}

describe('outpaintSupport', () => {
  it('accepts an exact ratio option', () => {
    const model = imageModel([
      {
        key: 'ratio',
        label: '比例',
        type: 'select',
        options: OUTPAINT_RATIOS.map((value) => ({ value, label: value })),
        defaultValue: '1:1'
      }
    ])

    expect(outpaintSupport(model, '16:9')).toEqual({
      supported: true,
      params: { ratio: '16:9' },
      target: 'ratio',
      exact: true,
      effective: '16:9'
    })
  })

  it('accepts an exact aspect_ratio option', () => {
    const model = imageModel([
      {
        key: 'aspect_ratio',
        label: '比例',
        type: 'select',
        options: [
          { value: '1:1', label: '1:1' },
          { value: '16:9', label: '16:9' }
        ]
      }
    ])

    expect(outpaintSupport(model, '16:9')).toMatchObject({
      supported: true,
      target: 'aspect_ratio',
      params: { aspect_ratio: '16:9' }
    })
  })

  it('accepts an exact size option and falls back to the closest one', () => {
    const exact = imageModel([
      {
        key: 'size',
        label: '尺寸',
        type: 'select',
        options: [
          { value: '1024x1024', label: '1:1' },
          { value: '1024x576', label: '16:9' }
        ]
      }
    ])
    const approximate = imageModel([
      {
        key: 'size',
        label: '尺寸',
        type: 'select',
        options: [
          { value: '1024x1024', label: '1:1' },
          { value: '1536x1024', label: '3:2' }
        ]
      }
    ])

    expect(outpaintSupport(exact, '16:9')).toMatchObject({
      supported: true,
      exact: true,
      target: 'size',
      params: { size: '1024x576' }
    })
    expect(outpaintSupport(approximate, '16:9')).toMatchObject({
      supported: true,
      exact: false,
      target: 'size',
      params: { size: '1536x1024' },
      effective: '1536x1024（3:2）'
    })
  })

  it('auto-fits OpenAI-compatible pixel sizes', () => {
    const model = imageModel([
      {
        key: 'size',
        label: '尺寸',
        type: 'select',
        options: [
          { value: '1024x1024', label: '1:1' },
          { value: '1536x1024', label: '3:2' },
          { value: '1024x1536', label: '2:3' }
        ]
      }
    ])

    expect(outpaintSupport(model, '16:9')).toMatchObject({
      supported: true,
      exact: false,
      params: { size: '1536x1024' }
    })
    expect(outpaintSupport(model, '9:16')).toMatchObject({
      supported: true,
      exact: false,
      params: { size: '1024x1536' }
    })
    expect(outpaintSupport(model, '1:1')).toMatchObject({
      supported: true,
      exact: true,
      params: { size: '1024x1024' }
    })
    expect(outpaintSupport(model, '4:3')).toMatchObject({
      supported: true,
      exact: false,
      params: { size: '1536x1024' }
    })
    expect(outpaintSupport(model, '3:4')).toMatchObject({
      supported: true,
      exact: false,
      params: { size: '1024x1536' }
    })
    expect(outpaintSupport(model, '21:9')).toMatchObject({
      supported: true,
      exact: false,
      params: { size: '1536x1024' }
    })
  })

  it('builds an exact custom size for text size params', () => {
    const model = imageModel([
      { key: 'size', label: '尺寸', type: 'text' }
    ])
    const support = outpaintSupport(model, '21:9')

    expect(support.supported).toBe(true)
    expect(support.target).toBe('size')
    const value = String(support.params.size)
    const [width, height] = value.split('x').map(Number)
    expect(width / height).toBeCloseTo(21 / 9, 5)
  })

  it('builds exact width and height within bounds', () => {
    const model = imageModel([
      {
        key: 'width',
        label: '宽度',
        type: 'number',
        min: 256,
        max: 2048,
        defaultValue: 1024
      },
      {
        key: 'height',
        label: '高度',
        type: 'number',
        min: 256,
        max: 2048,
        defaultValue: 1024
      }
    ])

    expect(outpaintSupport(model, '9:16')).toEqual({
      supported: true,
      params: { width: 576, height: 1024 },
      target: 'width-height',
      exact: true,
      effective: '576x1024（9:16）'
    })
  })

  it('rejects width and height when bounds cannot hold the ratio', () => {
    const model = imageModel([
      {
        key: 'width',
        label: '宽度',
        type: 'number',
        min: 256,
        max: 2048
      },
      {
        key: 'height',
        label: '高度',
        type: 'number',
        min: 1500,
        max: 2048
      }
    ])

    expect(outpaintSupport(model, '16:9').supported).toBe(false)
  })

  it('ignores ratio params that only apply to text-to-image', () => {
    const model = imageModel([
      {
        key: 'ratio',
        label: '比例',
        type: 'select',
        appliesTo: ['t2i'],
        options: [{ value: '16:9', label: '16:9' }]
      }
    ])

    expect(outpaintSupport(model, '16:9').supported).toBe(false)
  })

  it('rejects models without ratio or size params', () => {
    const model = imageModel([
      { key: 'quality', label: '质量', type: 'select' }
    ])

    expect(outpaintSupport(model, '1:1').supported).toBe(false)
  })
})

describe('planOutpaint', () => {
  it('merges base params and appends the target ratio to the prompt', () => {
    const model = imageModel([
      {
        key: 'ratio',
        label: '比例',
        type: 'select',
        options: OUTPAINT_RATIOS.map((value) => ({ value, label: value }))
      }
    ])

    const plan = planOutpaint(model, '扩展画面', '16:9', {
      quality: 'high',
      ratio: '1:1'
    })

    expect(plan.supported).toBe(true)
    expect(plan.params).toEqual({ quality: 'high', ratio: '16:9' })
    expect(plan.prompt).toContain('目标画幅：16:9')
  })

  it('keeps the original params when the model is unsupported', () => {
    const model = imageModel([])
    const plan = planOutpaint(model, '扩展画面', '16:9', { quality: 'high' })

    expect(plan.supported).toBe(false)
    expect(plan.params).toEqual({})
    expect(plan.prompt).toBe('扩展画面')
  })

  it('removes a conflicting pixel size when a ratio param is used', () => {
    const model = imageModel([
      {
        key: 'ratio',
        label: '比例',
        type: 'select',
        options: OUTPAINT_RATIOS.map((value) => ({ value, label: value }))
      },
      {
        key: 'size',
        label: '尺寸',
        type: 'select',
        options: [
          { value: '1024x1024', label: '1:1' },
          { value: '1024x576', label: '16:9' }
        ]
      }
    ])

    const plan = planOutpaint(model, '扩展画面', '16:9', {
      ratio: '1:1',
      size: '1024x1024'
    })

    expect(plan.params).toEqual({ ratio: '16:9' })
  })

  it('keeps a resolution tier when a ratio param is used', () => {
    const model = imageModel([
      {
        key: 'ratio',
        label: '比例',
        type: 'select',
        options: OUTPAINT_RATIOS.map((value) => ({ value, label: value }))
      },
      {
        key: 'size',
        label: '尺寸',
        type: 'select',
        options: [
          { value: '1K', label: '1K' },
          { value: '2K', label: '2K' }
        ]
      }
    ])

    const plan = planOutpaint(model, '扩展画面', '16:9', {
      ratio: '1:1',
      size: '2K'
    })

    expect(plan.params).toEqual({ ratio: '16:9', size: '2K' })
  })

  it('removes a conflicting ratio when a size param is used', () => {
    const model = imageModel([
      {
        key: 'ratio',
        label: '比例',
        type: 'select',
        options: [{ value: '1:1', label: '1:1' }]
      },
      {
        key: 'size',
        label: '尺寸',
        type: 'select',
        options: [
          { value: '1024x1024', label: '1:1' },
          { value: '1024x576', label: '16:9' }
        ]
      }
    ])

    const plan = planOutpaint(model, '扩展画面', '16:9', {
      ratio: '1:1',
      size: '1024x1024'
    })

    expect(plan.params).toEqual({ size: '1024x576' })
  })
})

describe('outpaintPrompt', () => {
  it('does not append the same target ratio twice', () => {
    const once = outpaintPrompt('扩展画面', '9:16')
    const twice = outpaintPrompt(once, '9:16')

    expect(twice).toBe(once)
    expect(twice.match(/目标画幅：9:16/g)).toHaveLength(1)
  })
})

describe('outpaintRatioOf', () => {
  it('falls back to 16:9 for missing or invalid values', () => {
    expect(outpaintRatioOf(undefined)).toBe('16:9')
    expect(outpaintRatioOf('2:1')).toBe('16:9')
    expect(outpaintRatioOf('9:16')).toBe('9:16')
  })
})
