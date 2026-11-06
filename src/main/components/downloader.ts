import { net } from 'electron'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, promises as fs } from 'node:fs'
import { dirname } from 'node:path'

export interface DownloadOptions {
  urls: string[]
  destination: string
  expectedSha256?: string
  signal?: AbortSignal
  onProgress?: (received: number, total: number) => void
}

export async function downloadFile(options: DownloadOptions): Promise<void> {
  const { urls, destination, expectedSha256, signal, onProgress } = options
  if (urls.length === 0) {
    throw new Error('组件下载地址为空，请检查组件清单')
  }

  await fs.mkdir(dirname(destination), { recursive: true })
  const part = `${destination}.part`
  let start = 0
  try {
    start = (await fs.stat(part)).size
  } catch {
    start = 0
  }

  let lastError: Error | undefined
  for (const url of urls) {
    try {
      await downloadFrom(url, part, start, signal, onProgress)
      lastError = undefined
      break
    } catch (error) {
      if (signal?.aborted) throw error
      lastError = error instanceof Error ? error : new Error(String(error))
    }
  }

  if (lastError) throw lastError

  if (expectedSha256) {
    const actual = await sha256File(part)
    if (actual !== expectedSha256) {
      await fs.rm(part, { force: true })
      throw new Error('组件校验失败：文件哈希不匹配')
    }
  }

  await fs.rm(destination, { force: true })
  await fs.rename(part, destination)
}

async function downloadFrom(
  url: string,
  part: string,
  start: number,
  signal: AbortSignal | undefined,
  onProgress: ((received: number, total: number) => void) | undefined
): Promise<void> {
  const headers: Record<string, string> = {}
  if (start > 0) headers.Range = `bytes=${start}-`

  const response = await net.fetch(url, {
    headers,
    signal,
    redirect: 'follow'
  })

  if (!response.ok) {
    throw new Error(`下载失败（HTTP ${response.status}）`)
  }

  const isResume = response.status === 206
  const offset = isResume ? start : 0
  const length = Number(response.headers.get('content-length') ?? 0)
  const total = length > 0 ? offset + length : 0

  if (!response.body) {
    throw new Error('下载响应为空')
  }

  const writer = createWriteStream(part, { flags: offset > 0 ? 'a' : 'w' })
  const reader = response.body.getReader()
  let received = offset

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value || value.byteLength === 0) continue
      received += value.byteLength
      if (!writer.write(Buffer.from(value))) {
        await new Promise<void>((resolve) => writer.once('drain', resolve))
      }
      onProgress?.(received, total)
    }
  } finally {
    reader.releaseLock()
    await new Promise<void>((resolve, reject) => {
      writer.end((error?: Error | null) => (error ? reject(error) : resolve()))
    })
  }
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk as Buffer)
  }
  return hash.digest('hex')
}
