import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModelDef } from '@shared/provider-schema'

const mocks = vi.hoisted(() => ({
  httpFetch: vi.fn(),
  sleep: vi.fn()
}))

vi.mock('../http', () => ({ httpFetch: mocks.httpFetch }))
vi.mock('../retry', () => ({ sleep: mocks.sleep }))

import { generateVideoMinimax } from '../minimax'

const model: ModelDef = {
  id: 'minimax-h3',
  name: 'MiniMax H3',
  capability: 'video.t2v',
  remoteModel: 'MiniMax-H3',
  adapter: 'minimax-video',
  params: []
}

const provider = {
  baseUrl: 'https://api.minimax.example.com',
  apiKey: 'sk-test'
}

const context = {
  signal: new AbortController().signal,
  onProgress: vi.fn()
}

function image(base64: string, role: string) {
  return {
    dataUrl: `data:image/png;base64,${base64}`,
    base64,
    mime: 'image/png',
    role,
    media: 'image' as const
  }
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

function mockSuccessfulTask(): void {
  mocks.httpFetch
    .mockResolvedValueOnce(jsonResponse({ task_id: 'task-1' }))
    .mockResolvedValueOnce(
      jsonResponse({
        task: {
          status: 'succeeded',
          content: { url: 'https://cdn.example.com/video.mp4' }
        }
      })
    )
    .mockResolvedValueOnce(videoResponse())
}

beforeEach(() => {
  mocks.httpFetch.mockReset()
  mocks.sleep.mockResolvedValue(undefined)
})

describe('generateVideoMinimax', () => {
  it('sends first_frame and last_frame roles for H3', async () => {
    mockSuccessfulTask()

    await generateVideoMinimax(
      model,
      provider,
      '镜头从白天推进到夜晚',
      {},
      [image('AAAA', 'firstFrame'), image('BBBB', 'lastFrame')],
      context,
      false
    )

    const [, init] = mocks.httpFetch.mock.calls[0]
    const body = JSON.parse(init.body)

    expect(body.content).toEqual([
      { type: 'text', text: '镜头从白天推进到夜晚' },
      {
        type: 'image_url',
        image_url: { url: 'data:image/png;base64,AAAA' },
        role: 'first_frame'
      },
      {
        type: 'image_url',
        image_url: { url: 'data:image/png;base64,BBBB' },
        role: 'last_frame'
      }
    ])
  })

  it('marks additional images as reference_image', async () => {
    mockSuccessfulTask()

    await generateVideoMinimax(
      model,
      provider,
      'reference',
      {},
      [image('AAAA', 'reference'), image('BBBB', 'firstFrame')],
      context,
      false
    )

    const [, init] = mocks.httpFetch.mock.calls[0]
    const body = JSON.parse(init.body)

    expect(body.content).toEqual([
      { type: 'text', text: 'reference' },
      {
        type: 'image_url',
        image_url: { url: 'data:image/png;base64,BBBB' },
        role: 'first_frame'
      },
      {
        type: 'image_url',
        image_url: { url: 'data:image/png;base64,AAAA' },
        role: 'reference_image'
      }
    ])
  })
})
