import { describe, expect, it } from 'vitest'
import type { ModelDef } from '../provider-schema'
import {
  effectiveCapabilities,
  normalizeFeatureSets,
  resolveAdapter
} from '../capabilities'

function model(patch: Partial<ModelDef> = {}): ModelDef {
  return {
    id: 'm1',
    name: 'Model 1',
    capability: 'video.t2v',
    remoteModel: 'm1',
    params: [],
    ...patch
  }
}

describe('resolveAdapter', () => {
  it('prefers the explicit adapter', () => {
    expect(
      resolveAdapter(model({ adapter: 'http-template', remoteModel: 'custom' }))
    ).toBe('http-template')
  })

  it('infers agnes video from the remote model', () => {
    expect(resolveAdapter(model({ remoteModel: 'agnes-video-2.5' }))).toBe(
      'agnes-video'
    )
  })

  it('uses the protocol template adapter', () => {
    expect(resolveAdapter(model({ protocol: 'kling-video' }))).toBe(
      'kling-video'
    )
  })

  it('falls back to volcengine for unconfigured video models', () => {
    expect(resolveAdapter(model({ capability: 'video.t2v' }))).toBe(
      'volcengine-video'
    )
  })

  it('falls back to openai-compat for image models', () => {
    expect(resolveAdapter(model({ capability: 'image.t2i' }))).toBe(
      'openai-compat'
    )
  })
})

describe('normalizeFeatureSets', () => {
  it('maps agnes audio to a reference-audio input', () => {
    expect(
      normalizeFeatureSets(
        model({
          remoteModel: 'agnes-video-2.5-flash',
          features: ['audio']
        })
      )
    ).toEqual({ input: ['reference-audio'], output: [] })
  })

  it('maps other video audio to an output feature', () => {
    expect(
      normalizeFeatureSets(
        model({
          adapter: 'volcengine-video',
          features: ['audio', 'last-frame']
        })
      )
    ).toEqual({ input: ['last-frame'], output: ['audio'] })
  })

  it('splits image features into input and output', () => {
    expect(
      normalizeFeatureSets(
        model({
          capability: 'image.t2i',
          features: ['mask', 'layer', 'ocr', 'rgba', 'sequential']
        })
      )
    ).toEqual({
      input: ['mask'],
      output: ['layer', 'ocr', 'rgba', 'sequential']
    })
  })
})

describe('effectiveCapabilities', () => {
  it('keeps declared media supported by the adapter', () => {
    const result = effectiveCapabilities(
      model({
        remoteModel: 'agnes-video-2.5-flash',
        inputs: ['text', 'image', 'audio']
      })
    )

    expect(result.media).toEqual(['text', 'image', 'audio'])
    expect(result.gaps).toEqual([])
  })

  it('removes video from Flash capabilities', () => {
    const result = effectiveCapabilities(
      model({
        remoteModel: 'agnes-video-2.5-flash',
        inputs: ['text', 'image', 'video', 'audio']
      })
    )

    expect(result.media).toEqual(['text', 'image', 'audio'])
    expect(result.gaps).toContainEqual(
      expect.objectContaining({ kind: 'input', value: 'video' })
    )
  })

  it('reports audio declared on an adapter that does not support it', () => {
    const result = effectiveCapabilities(
      model({
        adapter: 'sora-video',
        inputs: ['text', 'image', 'audio']
      })
    )

    expect(result.media).toEqual(['text', 'image'])
    expect(result.gaps).toContainEqual(
      expect.objectContaining({ kind: 'input', value: 'audio' })
    )
  })

  it('reports modes the adapter does not implement', () => {
    const result = effectiveCapabilities(
      model({
        adapter: 'kling-video',
        inputs: ['text', 'image'],
        modes: ['t2v', 'reference']
      })
    )

    expect(result.modes).toEqual(['t2v'])
    expect(result.gaps).toContainEqual(
      expect.objectContaining({ kind: 'mode', value: 'reference' })
    )
  })

  it('does not derive optional reference media from modes', () => {
    const result = effectiveCapabilities(
      model({
        capability: 'video.t2v',
        remoteModel: 'unknown-video',
        adapter: 'volcengine-video',
        modes: ['reference']
      })
    )

    expect(result.media).toEqual(['text', 'image'])
    expect(result.gaps).toEqual([])
  })

  it('prefers explicit inputs over modes', () => {
    const result = effectiveCapabilities(
      model({
        adapter: 'openai-compat',
        capability: 'image.t2i',
        inputs: ['text', 'image'],
        modes: ['i2i']
      })
    )

    expect(result.media).toEqual(['text', 'image'])
  })

  it('reports input features the adapter does not implement', () => {
    const result = effectiveCapabilities(
      model({
        adapter: 'sora-video',
        inputs: ['text'],
        features: ['mask']
      })
    )

    expect(result.inputFeatures).toEqual([])
    expect(result.gaps).toContainEqual(
      expect.objectContaining({ kind: 'input-feature', value: 'mask' })
    )
  })

  it('strips unknown output features after splitting', () => {
    const result = effectiveCapabilities(
      model({
        adapter: 'sora-video',
        inputs: ['text'],
        features: ['sequential']
      })
    )

    expect(result.outputFeatures).toEqual([])
    expect(result.gaps).toContainEqual(
      expect.objectContaining({ kind: 'output-feature', value: 'sequential' })
    )
  })

  it('reports parameters the adapter does not read', () => {
    const result = effectiveCapabilities(
      model({
        remoteModel: 'agnes-video-2.5-flash',
        inputs: ['text'],
        params: [
          { key: 'size', label: '尺寸', type: 'number', defaultValue: 1 }
        ]
      })
    )

    expect(result.gaps).toContainEqual(
      expect.objectContaining({ kind: 'param', value: 'size' })
    )
  })

  it('accepts parameters in the adapter whitelist', () => {
    const result = effectiveCapabilities(
      model({
        remoteModel: 'agnes-video-2.5-flash',
        inputs: ['text'],
        params: [
          { key: 'duration', label: '时长', type: 'number', defaultValue: 5 }
        ]
      })
    )

    expect(result.gaps).toEqual([])
  })
})
