import { describe, expect, it } from 'vitest'
import type { ModelDef } from '../provider-schema'
import {
  referenceInputError,
  referenceInputErrors,
  type ReferenceInputContext
} from '../reference-inputs'

function model(patch: Partial<ModelDef> = {}): ModelDef {
  return {
    id: 'agnes-video-2.5-flash',
    name: 'Agnes Video 2.5 Flash',
    capability: 'video.t2v',
    remoteModel: 'agnes-video-2.5-flash',
    params: [],
    inputs: ['text', 'image', 'audio'],
    ...patch
  }
}

function context(
  patch: Partial<ReferenceInputContext> = {}
): ReferenceInputContext {
  return {
    isVideo: true,
    model: model(),
    imageCount: 0,
    audioCount: 0,
    hasSourceVideo: false,
    hasVideoOperation: false,
    hasMask: false,
    hasKeyframe: false,
    ...patch
  }
}

describe('referenceInputError', () => {
  it('rejects audio on non-video models', () => {
    expect(
      referenceInputError(
        context({
          isVideo: false,
          audioCount: 1,
          model: model({ capability: 'image.t2i' })
        })
      )
    ).toBe('当前类型的模型不支持参考音频')
  })

  it('rejects audio when the model does not declare audio input', () => {
    expect(
      referenceInputError(
        context({ audioCount: 1, model: model({ inputs: ['text', 'image'] }) })
      )
    ).toContain('当前模型不支持参考音频')
  })

  it('rejects audio in keyframe mode', () => {
    expect(
      referenceInputError(context({ audioCount: 1, hasKeyframe: true }))
    ).toContain('首尾帧模式不支持参考音频')
  })

  it('rejects audio in a non-reference mode', () => {
    expect(
      referenceInputError(context({ audioCount: 1, mode: 't2v' }))
    ).toContain('当前输入模式不支持参考音频')
  })

  it('rejects audio in video edit mode', () => {
    expect(
      referenceInputError(
        context({
          audioCount: 1,
          hasSourceVideo: true,
          hasVideoOperation: true,
          model: model({ inputs: ['text', 'image', 'video', 'audio'] })
        })
      )
    ).toContain('视频编辑模式不支持参考音频')
  })

  it('rejects audio on non-agnes adapters', () => {
    expect(
      referenceInputError(
        context({
          audioCount: 1,
          model: model({ adapter: 'sora-video' })
        })
      )
    ).toContain('当前视频适配器暂不支持参考音频')
  })

  it('accepts audio on agnes reference mode', () => {
    expect(referenceInputError(context({ audioCount: 1 }))).toBeNull()
  })

  it('accepts audio with a reference video in reference mode', () => {
    expect(
      referenceInputError(
        context({
          audioCount: 1,
          hasSourceVideo: true,
          mode: 'reference',
          model: model({
            remoteModel: 'agnes-video-2.5',
            inputs: ['text', 'image', 'video', 'audio']
          })
        })
      )
    ).toBeNull()
  })

  it('accepts images and audio together on agnes reference mode', () => {
    expect(
      referenceInputError(context({ imageCount: 1, audioCount: 1 }))
    ).toBeNull()
  })

  it('rejects source video in keyframe mode', () => {
    expect(
      referenceInputError(
        context({
          hasSourceVideo: true,
          hasKeyframe: true,
          model: model({ inputs: ['text', 'image', 'video'] })
        })
      )
    ).toContain('首尾帧模式不支持参考视频')
  })

  it('rejects source video when the model does not declare video input', () => {
    expect(
      referenceInputError(
        context({
          hasSourceVideo: true,
          model: model({ inputs: ['text', 'image'] })
        })
      )
    ).toContain('该模型不支持参考视频')
  })

  it('rejects images when the model does not declare image input', () => {
    expect(
      referenceInputError(
        context({ imageCount: 1, model: model({ inputs: ['text'] }) })
      )
    ).toContain('该模型不支持图片输入')
  })

  it('rejects masks when the model does not declare image input', () => {
    expect(
      referenceInputError(
        context({ hasMask: true, model: model({ inputs: ['text'] }) })
      )
    ).toBe('该模型不支持蒙版编辑')
  })

  it('rejects modes the adapter does not implement', () => {
    expect(
      referenceInputError(
        context({
          mode: 'reference',
          model: model({ adapter: 'kling-video', inputs: ['text', 'image'] })
        })
      )
    ).toContain('当前适配器不支持')
  })
})

describe('referenceInputErrors', () => {
  it('returns all matching errors instead of the first one', () => {
    const errors = referenceInputErrors(
      context({
        imageCount: 1,
        audioCount: 1,
        model: model({
          adapter: 'sora-video',
          inputs: ['text', 'audio']
        })
      })
    )

    expect(errors.length).toBe(2)
    expect(errors.some((item) => item.includes('参考音频'))).toBe(true)
    expect(errors.some((item) => item.includes('图片输入'))).toBe(true)
  })
})
