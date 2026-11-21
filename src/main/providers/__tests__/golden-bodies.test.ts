import { describe, expect, it } from 'vitest'
import type { ModelDef } from '@shared/provider-schema'
import {
  AGNES_VIDEO_CONTRACT,
  KLING_VIDEO_CONTRACT
} from '@shared/model-contracts'
import { buildAgnesBody } from '../agnes'
import { buildKlingBody } from '../kling'
import type { LoadedRef } from '../media'

function ref(base64: string, role: string): LoadedRef {
  return {
    dataUrl: `data:image/png;base64,${base64}`,
    base64,
    mime: 'image/png',
    role,
    media: 'image'
  }
}

const agnesModel: ModelDef = {
  id: 'agnes-video-2.5-flash',
  name: 'Agnes Video 2.5 Flash',
  capability: 'video.t2v',
  remoteModel: 'agnes-video-2.5-flash',
  adapter: 'agnes-video',
  params: []
}

const klingModel: ModelDef = {
  id: 'kling-2.5',
  name: 'Kling 2.5',
  capability: 'video.t2v',
  remoteModel: 'kling-v2-5',
  adapter: 'kling-video',
  params: []
}

describe('golden request bodies', () => {
  it('sends Agnes keyframes as pure base64 in contract fields', () => {
    const body = buildAgnesBody(
      agnesModel,
      'prompt',
      {},
      [ref('AAAA', 'firstFrame'), ref('BBBB', 'lastFrame')]
    )

    expect(body.mode).toBe('keyframe')
    expect(body[AGNES_VIDEO_CONTRACT.fields.firstFrame!]).toBe('AAAA')
    expect(body[AGNES_VIDEO_CONTRACT.fields.lastFrame!]).toBe('BBBB')
  })

  it('keeps Agnes reference images as data URLs', () => {
    const body = buildAgnesBody(agnesModel, 'prompt', {}, [
      ref('EEEE', 'reference')
    ])

    expect(body.images).toEqual(['data:image/png;base64,EEEE'])
  })

  it('sends Kling keyframes as pure base64 in contract fields', () => {
    const body = buildKlingBody(
      klingModel,
      'prompt',
      {},
      [ref('CCCC', 'firstFrame'), ref('DDDD', 'lastFrame')]
    )

    expect(body[KLING_VIDEO_CONTRACT.fields.firstFrame!]).toBe('CCCC')
    expect(body[KLING_VIDEO_CONTRACT.fields.lastFrame!]).toBe('DDDD')
  })
})
