import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModelDef } from '@shared/provider-schema'

const mocks = vi.hoisted(() => ({
  httpFetch: vi.fn(),
  sleep: vi.fn()
}))

vi.mock('../http', () => ({ httpFetch: mocks.httpFetch }))
vi.mock('../retry', () => ({ sleep: mocks.sleep }))

import { generateVideoSora } from '../sora'

const model: ModelDef = {
  id: 'seedance-2.0-mini',
  name: 'Seedance 2.0 Mini',
  capability: 'video.t2v',
  remoteModel: 'seedance-2.0-mini',
  adapter: 'sora-video',
  inputs: ['text'],
  params: []
}

const provider = {
  baseUrl: 'http://127.0.0.1:8787/v1',
  apiKey: 'sk-local-test'
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

beforeEach(() => {
  mocks.httpFetch.mockReset()
  mocks.sleep.mockReset()
  mocks.sleep.mockResolvedValue(undefined)
  context.onProgress.mockReset()
})

describe('generateVideoSora', () => {
  it('submits, polls, then downloads from the content endpoint', async () => {
    mocks.httpFetch
      .mockResolvedValueOnce(jsonResponse({ id: 'task_1', status: 'queued' }))
      .mockResolvedValueOnce(
        jsonResponse({ id: 'task_1', status: 'in_progress' })
      )
      .mockResolvedValueOnce(jsonResponse({ id: 'task_1', status: 'completed' }))
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'video/mp4' }
        })
      )

    const output = await generateVideoSora(
      model,
      provider,
      'a red ball',
      { duration: 4 },
      [],
      context
    )

    expect(mocks.httpFetch).toHaveBeenCalledTimes(4)

    const [submitUrl, submitInit] = mocks.httpFetch.mock.calls[0]
    expect(submitUrl).toBe('http://127.0.0.1:8787/v1/videos')
    expect(submitInit.method).toBe('POST')
    expect(JSON.parse(submitInit.body)).toEqual({
      model: 'seedance-2.0-mini',
      prompt: 'a red ball',
      seconds: '4'
    })

    expect(mocks.httpFetch.mock.calls[1][0]).toBe(
      'http://127.0.0.1:8787/v1/videos/task_1'
    )
    expect(mocks.httpFetch.mock.calls[3][0]).toBe(
      'http://127.0.0.1:8787/v1/videos/task_1/content'
    )

    expect(output).toHaveLength(1)
    expect(output[0].mime).toBe('video/mp4')
    expect([...output[0].data]).toEqual([1, 2, 3])
  })

  it('throws the upstream message when the task fails', async () => {
    mocks.httpFetch
      .mockResolvedValueOnce(jsonResponse({ id: 'task_1' }))
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'task_1',
          status: 'failed',
          error: 'quota exceeded'
        })
      )

    await expect(
      generateVideoSora(model, provider, 'x', {}, [], context)
    ).rejects.toThrow('quota exceeded')
  })

  it('throws when the submit response has no task id', async () => {
    mocks.httpFetch.mockResolvedValueOnce(jsonResponse({ status: 'queued' }))

    await expect(
      generateVideoSora(model, provider, 'x', {}, [], context)
    ).rejects.toThrow('接口没有返回任务 ID')
  })
})
