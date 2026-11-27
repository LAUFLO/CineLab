import { describe, expect, it, vi } from 'vitest'

vi.mock('../../providers/openai-compat', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../providers/openai-compat')
  >()
  return { ...actual, generateImage: vi.fn() }
})

import {
  generateImage,
  type ProviderOutput
} from '../../providers/openai-compat'
import { generateImageBatch, imageBatchCount } from '../start-generation'

const model = {
  remoteModel: 'agnes-image-2.5-flash'
} as unknown as Parameters<typeof generateImage>[0]
const runtime = {
  baseUrl: 'https://example.com/v1',
  apiKey: 'test'
} as unknown as Parameters<typeof generateImage>[1]
const one: ProviderOutput = { data: Buffer.from('png'), mime: 'image/png' }

function context() {
  return { signal: new AbortController().signal, onProgress: vi.fn() }
}

describe('imageBatchCount', () => {
  it('把数量归一化为 1–4 的整数', () => {
    expect(imageBatchCount('2')).toBe(2)
    expect(imageBatchCount(3)).toBe(3)
    expect(imageBatchCount(2.9)).toBe(2)
    expect(imageBatchCount('4')).toBe(4)
  })

  it('越界与非法值回退到 1 张', () => {
    expect(imageBatchCount(0)).toBe(1)
    expect(imageBatchCount(-3)).toBe(1)
    expect(imageBatchCount(9)).toBe(4)
    expect(imageBatchCount('abc')).toBe(1)
    expect(imageBatchCount(undefined)).toBe(1)
    expect(imageBatchCount(null)).toBe(1)
  })
})

describe('generateImageBatch', () => {
  it('一次请求已返回足够数量时不补发', async () => {
    const mock = vi.mocked(generateImage)
    mock.mockReset()
    mock.mockResolvedValue([one, one])
    const outputs = await generateImageBatch(
      model,
      runtime,
      'prompt',
      { n: 2 },
      [],
      context()
    )
    expect(outputs).toHaveLength(2)
    expect(mock).toHaveBeenCalledTimes(1)
  })

  it('供应商只返回一张时顺序补发单张请求', async () => {
    const mock = vi.mocked(generateImage)
    mock.mockReset()
    mock.mockResolvedValue([one])
    const outputs = await generateImageBatch(
      model,
      runtime,
      'prompt',
      { n: '3' },
      [],
      context()
    )
    expect(outputs).toHaveLength(3)
    expect(mock).toHaveBeenCalledTimes(3)
    expect(mock.mock.calls[0][3].n).toBe(3)
    expect(mock.mock.calls[1][3].n).toBe(1)
    expect(mock.mock.calls[2][3].n).toBe(1)
  })

  it('模型拒绝 n 字段时降级为单张请求', async () => {
    const mock = vi.mocked(generateImage)
    mock.mockReset()
    let call = 0
    mock.mockImplementation(async () => {
      call += 1
      if (call === 1) throw new Error('unknown field n')
      return [one]
    })
    const outputs = await generateImageBatch(
      model,
      runtime,
      'prompt',
      { n: 2 },
      [],
      context()
    )
    expect(outputs).toHaveLength(2)
    expect(call).toBe(3)
  })

  it('取消后不再发起请求', async () => {
    const mock = vi.mocked(generateImage)
    mock.mockReset()
    mock.mockResolvedValue([one])
    const controller = new AbortController()
    controller.abort()
    await expect(
      generateImageBatch(model, runtime, 'prompt', { n: 2 }, [], {
        signal: controller.signal,
        onProgress: vi.fn()
      })
    ).rejects.toThrow()
    expect(mock).not.toHaveBeenCalled()
  })
})
