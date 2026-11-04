export function isRetryable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)

  if (/HTTP 429/.test(message)) return true
  if (/HTTP 5\d\d/.test(message)) return true
  if (/ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|socket hang up/i.test(message)) {
    return true
  }
  return false
}

export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('aborted'))
      return
    }

    const onAbort = (): void => {
      clearTimeout(timer)
      reject(new Error('aborted'))
    }

    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)

    signal.addEventListener('abort', onAbort, { once: true })
  })
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  signal: AbortSignal,
  onRetry: (attempt: number, delayMs: number, error: unknown) => void,
  delays: number[] = [3000, 9000]
): Promise<T> {
  let lastError: unknown

  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (signal.aborted) throw error
      if (!isRetryable(error) || attempt >= delays.length) throw error

      const delay = delays[attempt]
      onRetry(attempt + 1, delay, error)
      await sleep(delay, signal)
    }
  }

  throw lastError
}
