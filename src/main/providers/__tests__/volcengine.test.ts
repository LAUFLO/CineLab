import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModelDef } from '@shared/provider-schema'

const mocks = vi.hoisted(() => ({
  httpFetch: vi.fn(),
  sleep: vi.fn()
}))

vi.mock('../http', () => ({ httpFetch: mocks.httpFetch }))
vi.mock('../retry', () => ({ sleep: mocks.sleep }))

import { generateVideoArk } from '../volcengine'

const model: ModelDef = {
  id: 'seedance-2-5',
  name: 'Seedance 2.5',
  capability: 'video.t2v',
  remoteModel: 'doubao-seedance-2-5-260628',
  adapter: 'volcengine-video',
  params: []
}

const provider = {
  baseUrl: 'https://ark.example.com/api/v3',
  apiKey: 'sk-test'
}

const context = {
  signal: new AbortController().signal,
  onProgress: vi.fn()
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

function videoResponse(): Response {
  return new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: { 'content-type': 'video/mp4' }
  })
}

beforeEach(() => {
  mocks.httpFetch.mockReset()
  mocks.sleep.mockResolvedValue(undefined)
})

describe('generateVideoArk', () => {
  it('submits an element replacement as an edit task', async () => {
    mocks.httpFetch
      .mockResolvedValueOnce(jsonResponse({ id: 'task-1' }))
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'task-1',
          status: 'succeeded',
          content: { video_url: 'https://cdn.example.com/video.mp4' }
        })
      )
      .mockResolvedValueOnce(videoResponse())

    await generateVideoArk(
      model,
      provider,
      '把杯子换成蓝色',
      { duration: 5, ratio: '16:9' },
      [{ dataUrl: 'data:image/png;base64,AAAA', role: 'reference' }],
      context,
      { dataUrl: 'data:video/mp4;base64,BBBB', mime: 'video/mp4' },
      { operation: 'element-replace', range: { start: 1, end: 3 } }
    )

    const [, init] = mocks.httpFetch.mock.calls[0]
    const body = JSON.parse(init.body)

    expect(body.omni_reference_task_type).toBe('edit')
    expect(body.ratio).toBe('adaptive')
    expect(body.duration).toBe(-1)
    expect(body.content).toContainEqual({
      type: 'video_url',
      video_url: { url: 'data:video/mp4;base64,BBBB' },
      role: 'reference_video'
    })
    expect(body.content).toContainEqual({
      type: 'image_url',
      image_url: { url: 'data:image/png;base64,AAAA' },
      role: 'reference_image'
    })
    expect(body.content[0].text).toContain('只修改第 1.0 到 3.0 秒')
  })

  it('submits an extend task with direction hint', async () => {
    mocks.httpFetch
      .mockResolvedValueOnce(jsonResponse({ id: 'task-2' }))
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'task-2',
          status: 'succeeded',
          content: { video_url: 'https://cdn.example.com/video.mp4' }
        })
      )
      .mockResolvedValueOnce(videoResponse())

    await generateVideoArk(
      model,
      provider,
      '继续向前',
      { duration: 5 },
      [],
      context,
      { dataUrl: 'data:video/mp4;base64,BBBB', mime: 'video/mp4' },
      { operation: 'extend', direction: 'backward', duration: 3 }
    )

    const [, init] = mocks.httpFetch.mock.calls[0]
    const body = JSON.parse(init.body)

    expect(body.omni_reference_task_type).toBe('extend')
    expect(body.ratio).toBe('adaptive')
    expect(body.duration).toBe(-1)
    expect(body.content[0].text).toContain('向前延长')
  })

  it('keeps first frame and reference roles distinct', async () => {
    mocks.httpFetch
      .mockResolvedValueOnce(jsonResponse({ id: 'task-3' }))
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'task-3',
          status: 'succeeded',
          content: { video_url: 'https://cdn.example.com/video.mp4' }
        })
      )
      .mockResolvedValueOnce(videoResponse())

    await generateVideoArk(
      model,
      provider,
      'a cat',
      {},
      [
        { dataUrl: 'data:image/png;base64,FRAME', role: 'firstFrame' },
        { dataUrl: 'data:image/png;base64,REF', role: 'reference' }
      ],
      context
    )

    const [, init] = mocks.httpFetch.mock.calls[0]
    const body = JSON.parse(init.body)

    expect(body.content).toContainEqual({
      type: 'image_url',
      image_url: { url: 'data:image/png;base64,FRAME' },
      role: 'first_frame'
    })
    expect(body.content).toContainEqual({
      type: 'image_url',
      image_url: { url: 'data:image/png;base64,REF' },
      role: 'reference_image'
    })
    expect(body.omni_reference_task_type).toBeUndefined()
  })
})
