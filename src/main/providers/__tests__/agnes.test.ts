import { describe, expect, it } from 'vitest'
import type { ModelDef } from '@shared/provider-schema'
import { buildAgnesBody } from '../agnes'

const model: ModelDef = {
  id: 'agnes-video-2.5',
  name: 'Agnes Video 2.5',
  capability: 'video.t2v',
  remoteModel: 'agnes-video-2.5',
  params: [],
  inputs: ['text', 'image', 'video', 'audio']
}

const image = {
  dataUrl: 'data:image/png;base64,AAAA',
  base64: 'AAAA',
  mime: 'image/png',
  role: 'reference',
  media: 'image' as const
}

const audio = {
  dataUrl: 'data:audio/mpeg;base64,BBBB',
  base64: 'BBBB',
  mime: 'audio/mpeg',
  role: 'reference',
  media: 'audio' as const
}

const video = {
  dataUrl: 'data:video/mp4;base64,CCCC',
  mime: 'video/mp4'
}

describe('buildAgnesBody', () => {
  it('uses reference mode for audio only', () => {
    const body = buildAgnesBody(model, 'prompt', {}, [audio])

    expect(body.mode).toBe('reference')
    expect(body.audios).toEqual([audio.dataUrl])
    expect(body.images).toBeUndefined()
  })

  it('sends images and audios together', () => {
    const body = buildAgnesBody(model, 'prompt', {}, [image, audio])

    expect(body.mode).toBe('reference')
    expect(body.images).toEqual([image.dataUrl])
    expect(body.audios).toEqual([audio.dataUrl])
  })

  it('uses keyframe mode and does not send audios with keyframes', () => {
    const body = buildAgnesBody(model, 'prompt', {}, [
      { ...image, role: 'firstFrame' },
      audio
    ])

    expect(body.mode).toBe('keyframe')
    expect(body.first_frame).toBe('AAAA')
    expect(body.audios).toBeUndefined()
  })

  it('falls back to text mode without references', () => {
    const body = buildAgnesBody(model, 'prompt', {}, [])

    expect(body.mode).toBe('text')
    expect(body.images).toBeUndefined()
    expect(body.audios).toBeUndefined()
  })

  it('sends a video reference as an object array', () => {
    const body = buildAgnesBody(model, 'prompt', {}, [], video)

    expect(body.mode).toBe('reference')
    expect(body.videos).toEqual([
      { url: video.dataUrl, start_seconds: 0, require_audio: false }
    ])
  })

  it('rejects video references on Flash', () => {
    const flash = { ...model, remoteModel: 'agnes-video-2.5-flash' }

    expect(() => buildAgnesBody(flash, 'prompt', {}, [], video)).toThrow(
      /Flash/
    )
  })
})
