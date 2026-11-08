import { describe, expect, it } from 'vitest'
import {
  inferModelInputs,
  missingInputsFor,
  modelInputs,
  type ModelDef
} from '../provider-schema'

function model(patch: Partial<ModelDef>): ModelDef {
  return {
    id: 'm1',
    name: 'Model 1',
    capability: 'image.t2i',
    remoteModel: 'm1',
    params: [],
    ...patch
  }
}

describe('inferModelInputs', () => {
  it('keeps plain text-to-image models text-only', () => {
    expect(inferModelInputs({ capability: 'image.t2i', remoteModel: 'moss-image' })).toEqual([
      'text'
    ])
  })

  it('marks Agnes image models as image-capable', () => {
    expect(
      inferModelInputs({
        capability: 'image.t2i',
        remoteModel: 'agnes-image-2.5-flash'
      })
    ).toEqual(['text', 'image'])
  })

  it('treats i2i as text plus image', () => {
    expect(inferModelInputs({ capability: 'image.i2i' })).toEqual(['text', 'image'])
  })

  it('knows Agnes Flash video has no video input', () => {
    expect(
      inferModelInputs({
        capability: 'video.t2v',
        remoteModel: 'agnes-video-2.5-flash'
      })
    ).toEqual(['text', 'image', 'audio'])
  })

  it('knows Agnes standard video accepts video input', () => {
    expect(
      inferModelInputs({
        capability: 'video.t2v',
        remoteModel: 'agnes-video-2.5'
      })
    ).toEqual(['text', 'image', 'video', 'audio'])
  })

  it('detects video mode from http-template', () => {
    const inputs = inferModelInputs({
      capability: 'video.t2v',
      adapter: 'http-template',
      template: {
        mode: 'video',
        submit: { path: '/video/edit' },
        poll: { path: '/tasks/{{taskId}}', taskIdPath: 'id', resultPath: 'url' }
      }
    })

    expect(inputs).toContain('video')
  })

  it('does not add image support for text-only http-template', () => {
    const inputs = inferModelInputs({
      capability: 'video.t2v',
      adapter: 'http-template',
      template: {
        submit: { path: '/videos', bodyByMode: { text: { prompt: '{{prompt}}' } } },
        poll: { path: '/tasks/{{taskId}}', taskIdPath: 'id', resultPath: 'url' }
      }
    })

    expect(inputs).toEqual(['text'])
  })
})

describe('modelInputs', () => {
  it('prefers explicit inputs over inference', () => {
    expect(modelInputs(model({ inputs: ['text', 'video'] }))).toEqual([
      'text',
      'video'
    ])
  })

  it('falls back to inference when inputs are missing', () => {
    expect(modelInputs(model({ remoteModel: 'moss-image' }))).toEqual(['text'])
  })
})

describe('missingInputsFor', () => {
  it('returns inputs the model cannot receive', () => {
    const value = model({ inputs: ['text', 'image'] })
    expect(missingInputsFor(value, ['text', 'image', 'video'])).toEqual(['video'])
  })

  it('returns an empty list when all inputs are supported', () => {
    const value = model({ inputs: ['text', 'image', 'video'] })
    expect(missingInputsFor(value, ['text', 'video'])).toEqual([])
  })
})
