import { utilityProcess, type UtilityProcess } from 'electron'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

export interface LocalAdapterOutput {
  data: Buffer
  mime: string
  text?: string
  layer?: unknown
  textRecognition?: unknown
}

export interface LocalAdapterGenerateOptions {
  onProgress?: (percent: number, message?: string) => void
  signal?: AbortSignal
}

interface PendingRequest {
  resolve: (outputs: LocalAdapterOutput[]) => void
  reject: (error: Error) => void
  onProgress?: (percent: number, message?: string) => void
  removeAbort?: () => void
}

type HostOutboundMessage =
  | { type: 'ready' }
  | { type: 'load-error'; message: string }
  | { type: 'progress'; id: string; percent: number; message?: string }
  | {
      type: 'done'
      id: string
      outputs: Array<{
        data: Uint8Array
        mime: string
        text?: string
        layer?: unknown
        textRecognition?: unknown
      }>
    }
  | { type: 'error'; id: string; message: string }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function hostScriptPath(): string {
  return join(__dirname, 'local-adapter-host.js')
}

/**
 * 每个本地适配器一个 utilityProcess。
 *
 * 进程懒启动；崩溃只拒绝当前请求，下一次生成时自动重启。
 */
export class LocalAdapterHost {
  private child: UtilityProcess | null = null
  private startPromise: Promise<void> | null = null
  private ready = false
  private disposed = false
  private readonly pending = new Map<string, PendingRequest>()

  constructor(
    private readonly adapterId: string,
    private readonly entry: string,
    private readonly cwd: string,
    private readonly onLog?: (message: string) => void
  ) {}

  private log(message: string, error?: unknown): void {
    const detail = error ? ` ${errorMessage(error)}` : ''
    const line = `${message}${detail}`
    this.onLog?.(line)
    console.warn(`[local-adapter:${this.adapterId}] ${line}`)
  }

  start(): Promise<void> {
    if (this.disposed) {
      return Promise.reject(new Error('本地适配器进程已关闭'))
    }
    if (this.ready && this.child) return Promise.resolve()
    if (this.startPromise) return this.startPromise

    this.startPromise = new Promise((resolve, reject) => {
      let settled = false
      const child = utilityProcess.fork(hostScriptPath(), [], {
        cwd: this.cwd,
        serviceName: `CineLab Local Adapter: ${this.adapterId}`,
        stdio: 'pipe',
        env: Object.fromEntries(
          Object.entries(process.env).filter(
            (entry): entry is [string, string] => entry[1] !== undefined
          )
        )
      })

      this.child = child

      const finish = (error?: Error): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (error) {
          this.ready = false
          this.startPromise = null
          reject(error)
        } else {
          this.ready = true
          resolve()
        }
      }

      const timer = setTimeout(() => {
        finish(new Error('本地适配器启动超时'))
        child.kill()
      }, 15_000)

      child.on('message', (message: HostOutboundMessage) => {
        if (message.type === 'ready') {
          finish()
          return
        }
        if (message.type === 'load-error') {
          finish(new Error(message.message))
          return
        }
        if (message.type === 'log') {
          this.log(message.message)
          return
        }
        if (message.type === 'progress') {
          this.pending.get(message.id)?.onProgress?.(
            message.percent,
            message.message
          )
          return
        }
        if (message.type === 'done') {
          const request = this.pending.get(message.id)
          if (!request) return
          this.pending.delete(message.id)
          request.removeAbort?.()
          request.resolve(
            message.outputs.map((output) => ({
              data: Buffer.from(output.data),
              mime: output.mime,
              ...(output.text ? { text: output.text } : {}),
              ...(output.layer ? { layer: output.layer } : {}),
              ...(output.textRecognition
                ? { textRecognition: output.textRecognition }
                : {})
            }))
          )
          return
        }
        if (message.type === 'error') {
          const request = this.pending.get(message.id)
          if (!request) return
          this.pending.delete(message.id)
          request.removeAbort?.()
          request.reject(new Error(message.message))
        }
      })

      child.on('exit', (code) => {
        this.ready = false
        this.child = null
        this.startPromise = null
        const error = new Error(`本地适配器进程已退出（${code}）`)
        for (const request of this.pending.values()) {
          request.removeAbort?.()
          request.reject(error)
        }
        this.pending.clear()
        if (!this.disposed) this.log(`进程退出 code=${code}`)
      })

      child.stdout?.on('data', (data: Buffer) => {
        this.log(data.toString().trimEnd())
      })
      child.stderr?.on('data', (data: Buffer) => {
        this.log(data.toString().trimEnd())
      })

      child.on('spawn', () => {
        child.postMessage({ type: 'load', entry: this.entry })
      })
    })

    return this.startPromise
  }

  async generate(
    input: unknown,
    options: LocalAdapterGenerateOptions = {}
  ): Promise<LocalAdapterOutput[]> {
    await this.start()
    if (!this.child) throw new Error('本地适配器进程不可用')

    const id = randomUUID()
    return new Promise<LocalAdapterOutput[]>((resolve, reject) => {
      const request: PendingRequest = {
        resolve,
        reject,
        onProgress: options.onProgress
      }

      if (options.signal) {
        if (options.signal.aborted) {
          reject(new Error('已取消'))
          return
        }
        const onAbort = (): void => {
          this.cancel(id)
          this.pending.delete(id)
          request.removeAbort?.()
          reject(new Error('已取消'))
        }
        options.signal.addEventListener('abort', onAbort, { once: true })
        request.removeAbort = () =>
          options.signal?.removeEventListener('abort', onAbort)
      }

      this.pending.set(id, request)
      this.child?.postMessage({ type: 'generate', id, input })
    })
  }

  cancel(id: string): void {
    this.child?.postMessage({ type: 'cancel', id })
  }

  dispose(): void {
    this.disposed = true
    this.ready = false
    const child = this.child
    this.child = null
    for (const request of this.pending.values()) {
      request.removeAbort?.()
      request.reject(new Error('本地适配器已关闭'))
    }
    this.pending.clear()

    if (!child) return
    try {
      child.postMessage({ type: 'dispose' })
    } catch {
      // 进程可能已经退出
    }
    setTimeout(() => {
      try {
        child.kill()
      } catch {
        // ignore
      }
    }, 1_000)
  }
}
