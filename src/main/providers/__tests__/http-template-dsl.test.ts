import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'node:crypto'
import type { ModelDef } from '@shared/provider-schema'
import type { HttpTemplate } from '@shared/http-template'

const mocks = vi.hoisted(() => ({
  httpFetch: vi.fn(),
  sleep: vi.fn()
}))

vi.mock('../http', () => ({ httpFetch: mocks.httpFetch }))
vi.mock('../retry', () => ({ sleep: mocks.sleep }))

import { generateVideoHttpTemplate } from '../http-template'
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

function model(template: HttpTemplate): ModelDef {
  return {
    id: 'template-test',
    name: 'Template Test',
    capability: 'video.t2v',
    remoteModel: 'template-test',
    adapter: 'http-template',
    params: [],
    template
  }
}

const provider = {
  baseUrl: 'https://api.example.com',
  apiKey: 'key',
  secretKey: 'secret'
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
  mocks.sleep.mockResolvedValue(undefined)
})

describe('http-template DSL', () => {
  it('applies conditional fields and maps refs to object arrays', async () => {
    mocks.httpFetch.mockResolvedValueOnce(
      jsonResponse({ url: 'data:image/png;base64,RESULT' })
    )

    await generateVideoHttpTemplate(
      model({
        submit: {
          path: '/submit',
          body: {
            prompt: '{{prompt}}',
            images: {
              $map: 'refs.images',
              $as: {
                url: '{{item.dataUrl}}',
                role: '{{item.role}}'
              }
            }
          },
          conditional: [
            {
              when: { mode: 'keyframe', refs: ['firstFrame'] },
              set: { first: '{{refs.firstFrame}}' }
            }
          ]
        },
        poll: { path: '/poll', taskIdPath: 'id', resultPath: 'url' },
        sync: true
      }),
      provider,
      'prompt',
      {},
      [ref('AAAA', 'firstFrame'), ref('BBBB', 'reference')],
      undefined,
      undefined,
      context
    )

    const [, init] = mocks.httpFetch.mock.calls[0]
    const body = JSON.parse(init.body)

    expect(body.first).toBe('AAAA')
    expect(body.images).toEqual([
      {
        url: 'data:image/png;base64,BBBB',
        role: 'reference'
      }
    ])
  })

  it('maps status values and extracts error messages', async () => {
    mocks.httpFetch
      .mockResolvedValueOnce(jsonResponse({ task_id: 't1' }))
      .mockResolvedValueOnce(
        jsonResponse({
          state: 'FAILED',
          error: { message: 'quota exceeded' }
        })
      )

    await expect(
      generateVideoHttpTemplate(
        model({
          submit: { path: '/submit', body: {} },
          poll: {
            path: '/poll',
            taskIdPath: 'task_id',
            statusPath: 'state',
            statusMap: { FAILED: 'fail' },
            errorMessagePath: 'error.message',
            resultPath: 'video.url'
          }
        }),
        provider,
        'prompt',
        {},
        [],
        undefined,
        undefined,
        context
      )
    ).rejects.toThrow('quota exceeded')
  })

  it('returns multiple outputs from resultPaths', async () => {
    mocks.httpFetch.mockResolvedValueOnce(
      jsonResponse({
        videos: [
          { url: 'data:image/png;base64,AAAA' },
          { url: 'data:image/png;base64,BBBB' }
        ]
      })
    )

    const outputs = await generateVideoHttpTemplate(
      model({
        submit: { path: '/submit', body: {} },
        poll: {
          path: '/poll',
          taskIdPath: 'id',
          resultPath: 'videos[0].url',
          resultPaths: ['videos[0].url', 'videos[1].url']
        },
        sync: true
      }),
      provider,
      'prompt',
      {},
      [],
      undefined,
      undefined,
      context
    )

    expect(outputs).toHaveLength(2)
    expect(outputs[0].mime).toBe('image/png')
    expect(outputs[0].data.toString('base64')).toBe('AAAA')
    expect(outputs[1].data.toString('base64')).toBe('BBBB')
  })

  it('keeps legacy resultPath behavior', async () => {
    mocks.httpFetch.mockResolvedValueOnce(
      jsonResponse({ url: 'data:image/png;base64,TEVHQUNZ' })
    )

    const outputs = await generateVideoHttpTemplate(
      model({
        submit: { path: '/submit', body: { prompt: '{{prompt}}' } },
        poll: { path: '/poll', taskIdPath: 'id', resultPath: 'url' },
        sync: true
      }),
      provider,
      'prompt',
      {},
      [],
      undefined,
      undefined,
      context
    )

    expect(outputs[0].data.toString('base64')).toBe('TEVHQUNZ')
  })

  it('signs JSON requests with HMAC-SHA256', async () => {
    mocks.httpFetch.mockResolvedValueOnce(
      jsonResponse({ url: 'data:image/png;base64,RESULT' })
    )

    await generateVideoHttpTemplate(
      model({
        auth: {
          sign: {
            type: 'hmac-sha256',
            secret: '{{provider.secretKey}}',
            payload: '{{method}}\n{{path}}\n{{timestamp}}\n{{body}}',
            header: 'X-Signature',
            timestampHeader: 'X-Timestamp'
          }
        },
        submit: { path: '/submit', body: { prompt: '{{prompt}}' } },
        poll: { path: '/poll', taskIdPath: 'id', resultPath: 'url' },
        sync: true
      }),
      provider,
      'prompt',
      {},
      [],
      undefined,
      undefined,
      context
    )

    const [, init] = mocks.httpFetch.mock.calls[0]
    const headers = init.headers as Record<string, string>
    const timestamp = headers['X-Timestamp']
    const expected = createHmac('sha256', 'secret')
      .update(
        `POST\n/submit\n${timestamp}\n${JSON.stringify({ prompt: 'prompt' })}`
      )
      .digest('hex')

    expect(headers['X-Signature']).toBe(expected)
  })

  it('builds explicit multipart fields and files', async () => {
    mocks.httpFetch.mockResolvedValueOnce(
      jsonResponse({ url: 'data:image/png;base64,RESULT' })
    )

    await generateVideoHttpTemplate(
      model({
        submit: {
          path: '/submit',
          contentType: 'multipart',
          multipart: {
            fields: { prompt: '{{prompt}}', mode: '{{mode}}' },
            files: [
              {
                field: 'image',
                source: '{{refs.firstFrameDataUrl}}',
                filename: 'first.png'
              }
            ]
          }
        },
        poll: { path: '/poll', taskIdPath: 'id', resultPath: 'url' },
        sync: true
      }),
      provider,
      'prompt',
      {},
      [ref('AAAA', 'firstFrame')],
      undefined,
      undefined,
      context
    )

    const [, init] = mocks.httpFetch.mock.calls[0]
    const form = init.body as FormData
    expect(form.get('prompt')).toBe('prompt')
    expect(form.get('mode')).toBe('keyframe')
    const file = form.get('image') as File
    expect(file.name).toBe('first.png')
    expect(file.type).toBe('image/png')
  })

  it('uses syncResultPath for synchronous responses', async () => {
    mocks.httpFetch.mockResolvedValueOnce(
      jsonResponse({
        data: { videos: [{ url: 'data:image/png;base64,UkVTVUxU' }] }
      })
    )

    const outputs = await generateVideoHttpTemplate(
      model({
        submit: { path: '/submit', body: {} },
        poll: {
          path: '/poll',
          taskIdPath: 'id',
          resultPath: 'wrong.path'
        },
        sync: true,
        syncResultPath: 'data.videos[0].url'
      }),
      provider,
      'prompt',
      {},
      [],
      undefined,
      undefined,
      context
    )

    expect(outputs[0].data.toString('base64')).toBe('UkVTVUxU')
  })
})
