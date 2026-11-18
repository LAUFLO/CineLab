const TRUNCATE = 160

function truncate(message: string): string {
  return message.length > TRUNCATE ? `${message.slice(0, TRUNCATE)}…` : message
}

/**
 * 把主进程抛出的错误转成用户可读文案。
 *
 * 配额类错误可能以 402 或 403 返回（例如 Agnes 使用
 * `403 insufficient_user_quota`），必须在通用鉴权判断之前处理，
 * 否则会被误报成「Key 无效」。
 */
export function formatGenerationError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)

  if (
    /insufficient_user_quota|insufficient_quota|quota exceeded|余额不足|额度不足|欠费/i.test(
      message
    )
  ) {
    return '账户余额或配额不足，请充值或更换密钥后重试'
  }
  if (/HTTP 402/i.test(message)) {
    return '账户余额不足，请充值后重试'
  }
  if (/HTTP 401/i.test(message)) {
    return 'API Key 无效，请在设置中检查密钥'
  }
  if (/HTTP 403/i.test(message)) {
    return 'API Key 没有权限，请检查密钥和模型权限'
  }
  if (/HTTP 429/i.test(message)) {
    return '请求过于频繁（限流），请稍后重试'
  }
  if (/HTTP 404/i.test(message)) {
    return '模型或接口不存在，请检查模型配置'
  }
  if (/HTTP 5\d\d/i.test(message)) {
    return '模型服务暂时不可用，请稍后重试'
  }
  if (
    /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|socket hang up|连接超时/i.test(
      message
    )
  ) {
    return '网络连接失败，请检查网络或代理后重试'
  }
  if (/aborted|已取消/i.test(message)) {
    return '任务已取消'
  }

  return truncate(message.replace(/^Error:\s*/, '').trim())
}
