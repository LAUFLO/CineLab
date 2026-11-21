import { describe, expect, it } from 'vitest'
import type { ModelDef } from '@shared/provider-schema'
import { applyModelRequestBody, applyModelRequestForm } from '../model-body'

const model: ModelDef = {
  id: 'test-image',
  name: 'Test Image',
  capability: 'image.t2i',
  remoteModel: 'test-image',
  params: [],
  extraBody: {
    background: '{{params.background}}',
    seed: '{{params.seed}}',
    label: 'seed-{{params.seed}}',
    references: '{{refs.images}}',
    fixed: 3
  },
  omitBody: ['n']
}

const refs = [
  { dataUrl: 'data:image/png;base64,AAAA', role: 'reference' }
]

describe('applyModelRequestBody', () => {
  it('merges extra fields, preserves exact token types and removes omitted keys', () => {
    const body: Record<string, unknown> = {
      model: 'test-image',
      prompt: 'a cat',
      n: 1
    }

    applyModelRequestBody(body, model, {
      prompt: 'a cat',
      params: { background: 'transparent', seed: 7 },
      refs
    })

    expect(body).toEqual({
      model: 'test-image',
      prompt: 'a cat',
      background: 'transparent',
      seed: 7,
      label: 'seed-7',
      references: ['data:image/png;base64,AAAA'],
      fixed: 3
    })
  })

  it('exposes audio tokens and keeps audio out of image tokens', () => {
    const body: Record<string, unknown> = {}
    applyModelRequestBody(
      body,
      {
        ...model,
        extraBody: {
          audio: '{{refs.audio}}',
          audios: '{{refs.audios}}',
          images: '{{refs.images}}'
        }
      },
      {
        refs: [
          { dataUrl: 'data:image/png;base64,SUI', role: 'reference', media: 'image' },
          { dataUrl: 'data:audio/mpeg;base64,AU1', role: 'reference', media: 'audio' }
        ]
      }
    )

    expect(body.audio).toBe('data:audio/mpeg;base64,AU1')
    expect(body.audios).toEqual(['data:audio/mpeg;base64,AU1'])
    expect(body.images).toEqual(['data:image/png;base64,SUI'])
  })

  it('skips undefined variables and leaves the body unchanged without config', () => {
    const body: Record<string, unknown> = { model: 'plain', n: 2 }
    applyModelRequestBody(body, { ...model, extraBody: undefined, omitBody: undefined }, {})

    expect(body).toEqual({ model: 'plain', n: 2 })
  })

  it('resolves role-specific references and mask', () => {
    const body: Record<string, unknown> = {}
    applyModelRequestBody(
      body,
      {
        ...model,
        extraBody: {
          subject_image: '{{refs.subject}}',
          style_images: '{{refs.styles}}',
          mask_image: '{{refs.mask}}',
          images: '{{refs.images}}'
        }
      },
      {
        refs: [
          { dataUrl: 'data:image/png;base64,SUI', role: 'subject' },
          { dataUrl: 'data:image/png;base64,U1k', role: 'style' },
          { dataUrl: 'data:image/png;base64,TUE', role: 'mask' }
        ],
        mask: 'data:image/png;base64,TUE'
      }
    )

    expect(body.subject_image).toBe('data:image/png;base64,SUI')
    expect(body.style_images).toEqual(['data:image/png;base64,U1k'])
    expect(body.mask_image).toBe('data:image/png;base64,TUE')
    expect(body.images).toEqual([
      'data:image/png;base64,SUI',
      'data:image/png;base64,U1k'
    ])
  })

  it('uses base64 for keyframe tokens and exposes data URL and MIME variants', () => {
    const body: Record<string, unknown> = {}
    applyModelRequestBody(
      body,
      {
        ...model,
        extraBody: {
          first: '{{refs.firstFrame}}',
          firstUrl: '{{refs.firstFrameDataUrl}}',
          firstMime: '{{refs.firstFrameMime}}',
          last: '{{refs.lastFrame}}',
          lastUrl: '{{refs.lastFrameDataUrl}}',
          lastMime: '{{refs.lastFrameMime}}'
        }
      },
      {
        refs: [
          {
            dataUrl: 'data:image/jpeg;base64,FRAME1',
            base64: 'FRAME1',
            mime: 'image/jpeg',
            role: 'firstFrame'
          },
          {
            dataUrl: 'data:image/png;base64,FRAME2',
            base64: 'FRAME2',
            mime: 'image/png',
            role: 'lastFrame'
          }
        ]
      }
    )

    expect(body.first).toBe('FRAME1')
    expect(body.firstUrl).toBe('data:image/jpeg;base64,FRAME1')
    expect(body.firstMime).toBe('image/jpeg')
    expect(body.last).toBe('FRAME2')
    expect(body.lastUrl).toBe('data:image/png;base64,FRAME2')
    expect(body.lastMime).toBe('image/png')
  })

  it('falls back to dataUrl when the loaded base64 is absent', () => {
    const body: Record<string, unknown> = {}
    applyModelRequestBody(
      body,
      { ...model, extraBody: { first: '{{refs.firstFrame}}' } },
      {
        refs: [
          {
            dataUrl: 'data:image/png;base64,LEGACY',
            role: 'firstFrame'
          }
        ]
      }
    )

    expect(body.first).toBe('LEGACY')
  })
})

describe('applyModelRequestForm', () => {
  it('appends extra fields as form values and deletes omitted keys', () => {
    const form = new FormData()
    form.append('model', 'test-image')
    form.append('n', '1')

    applyModelRequestForm(form, model, {
      prompt: 'a cat',
      params: { background: 'opaque', seed: 7 },
      refs
    })

    expect(form.get('model')).toBe('test-image')
    expect(form.get('n')).toBeNull()
    expect(form.get('background')).toBe('opaque')
    expect(form.get('seed')).toBe('7')
    expect(form.getAll('references')).toHaveLength(1)
  })
})
