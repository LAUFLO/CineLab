import { net } from 'electron'
import { getPreferences } from '../settings/preferences'

type FetchInit = NonNullable<Parameters<typeof net.fetch>[1]>

/**
 * 统一模型请求入口：
 * - 使用 Electron 网络栈，遵循会话代理设置
 * - 按偏好附加请求超时
 * - 保留调用方传入的取消信号
 */
export async function httpFetch(
  input: string | URL,
  init?: FetchInit
): Promise<Response> {
  const preferences = await getPreferences()
  const timeout = AbortSignal.timeout(preferences.network.requestTimeout)
  const signal = init?.signal
    ? AbortSignal.any([init.signal, timeout])
    : timeout

  return net.fetch(input instanceof URL ? input.toString() : input, {
    ...init,
    signal
  })
}
