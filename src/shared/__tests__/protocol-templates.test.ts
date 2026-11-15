import { describe, expect, it } from 'vitest'
import {
  applyProtocolTemplate,
  findProtocolTemplate,
  matchModelRule
} from '../protocol-templates'

describe('protocol templates', () => {
  it('finds templates by id', () => {
    expect(findProtocolTemplate('ark-video')?.label).toBe('火山方舟视频')
    expect(findProtocolTemplate('missing')).toBeUndefined()
  })

  it('applies Seedance 2.5 reference limits', () => {
    const template = findProtocolTemplate('ark-video')
    const rule = matchModelRule('doubao-seedance-2-5-260628')
    expect(template).toBeDefined()
    expect(rule?.template).toBe('ark-video')

    const result = applyProtocolTemplate(template!, rule)
    const reference = result.modes.find((mode) => mode.id === 'reference')

    expect(reference?.slots?.['reference-image']?.max).toBe(30)
    expect(reference?.slots?.['reference-video']?.max).toBe(10)
    expect(result.params.find((param) => param.key === 'duration')?.max).toBe(
      30
    )
  })

  it('applies Seedream 5.5 OCR and layer limits', () => {
    const template = findProtocolTemplate('ark-image')
    const rule = matchModelRule('doubao-seedream-5-5-261028')

    const result = applyProtocolTemplate(template!, rule)

    expect(result.features).toContain('ocr')
    expect(
      result.params.find((param) => param.key === 'layer_max_images')?.max
    ).toBe(100)
  })

  it('applies MiniMax H3 reference limits', () => {
    const template = findProtocolTemplate('minimax-video')
    const rule = matchModelRule('MiniMax-H3')

    const result = applyProtocolTemplate(template!, rule)
    const reference = result.modes.find((mode) => mode.id === 'reference')

    expect(reference?.slots?.['reference-image']?.max).toBe(9)
    expect(reference?.slots?.['reference-video']?.max).toBe(3)
    expect(reference?.slots?.['reference-audio']?.max).toBe(3)
  })

  it('ignores a rule that belongs to another template', () => {
    const template = findProtocolTemplate('vidu-video')
    const rule = matchModelRule('doubao-seedance-2-5-260628')

    const result = applyProtocolTemplate(template!, rule)

    expect(result.params.find((param) => param.key === 'duration')?.max).toBe(
      16
    )
  })

  it('exposes http-template defaults for Runway, Wan and BFL', () => {
    const runway = findProtocolTemplate('runway-video')
    expect(runway?.adapter).toBe('http-template')
    expect(runway?.template?.submit.path).toEqual({
      text: '/v1/text_to_video',
      image: '/v1/image_to_video'
    })
    expect(runway?.template?.poll.resultPath).toBe('output[0]')

    const wan = findProtocolTemplate('wan-video')
    expect(wan?.template?.auth?.headers?.['X-DashScope-Async']).toBe('enable')
    expect(wan?.template?.poll.path).toBe('/api/v1/tasks/{{taskId}}')

    const bfl = findProtocolTemplate('bfl-image')
    expect(bfl?.template?.auth?.header).toBe('x-key')
    expect(bfl?.template?.poll.resultPath).toBe('result.sample')
  })
})
