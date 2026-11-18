import { describe, expect, it } from 'vitest'
import { formatGenerationError } from '../generation-error'

describe('formatGenerationError', () => {
  it('maps 401 to an invalid key message', () => {
    expect(formatGenerationError(new Error('HTTP 401: unauthorized'))).toBe(
      'API Key 无效，请在设置中检查密钥'
    )
  })

  it('maps 402 to a balance message', () => {
    expect(formatGenerationError(new Error('HTTP 402: payment required'))).toBe(
      '账户余额不足，请充值后重试'
    )
  })

  it('maps 403 quota errors before the generic permission message', () => {
    expect(
      formatGenerationError(
        new Error('HTTP 403: {"code":"insufficient_user_quota"}')
      )
    ).toBe('账户余额或配额不足，请充值或更换密钥后重试')
  })

  it('maps generic 403 to a permission message', () => {
    expect(formatGenerationError(new Error('HTTP 403: forbidden'))).toBe(
      'API Key 没有权限，请检查密钥和模型权限'
    )
  })

  it('maps 429 to a rate limit message', () => {
    expect(formatGenerationError(new Error('HTTP 429: too many requests'))).toBe(
      '请求过于频繁（限流），请稍后重试'
    )
  })

  it('maps 5xx to a service message', () => {
    expect(formatGenerationError(new Error('HTTP 502: bad gateway'))).toBe(
      '模型服务暂时不可用，请稍后重试'
    )
  })

  it('maps network failures', () => {
    expect(formatGenerationError(new Error('fetch failed'))).toBe(
      '网络连接失败，请检查网络或代理后重试'
    )
  })

  it('keeps unknown errors and truncates long messages', () => {
    const short = formatGenerationError(new Error('参考素材缺失'))
    expect(short).toBe('参考素材缺失')

    const long = formatGenerationError(new Error('x'.repeat(300)))
    expect(long.endsWith('…')).toBe(true)
    expect(long.length).toBe(161)
  })
})
