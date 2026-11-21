interface HostParentPort {
  on(
    event: 'message',
    listener: (event: { data: HostInboundMessage }) => void
  ): void
  postMessage(message: HostOutboundMessage): void
}

type HostInboundMessage =
  | { type: 'load'; entry: string }
  | { type: 'generate'; id: string; input: unknown }
  | { type: 'cancel'; id: string }
  | { type: 'dispose' }

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

interface LocalAdapterModule {
  generate: (
    input: unknown,
    context: {
      onProgress: (percent: number, message?: string) => void
      signal: AbortSignal
    }
  ) => Promise<
    Array<{
      data: Uint8Array
      mime: string
      text?: string
      layer?: unknown
      textRecognition?: unknown
    }>
  >
  dispose?: () => void | Promise<void>
}

const parentPort = (
  process as unknown as { parentPort?: HostParentPort }
).parentPort

if (!parentPort) {
  throw new Error('local adapter host 必须在 utilityProcess 中运行')
}

let adapter: LocalAdapterModule | null = null
const controllers = new Map<string, AbortController>()

function post(message: HostOutboundMessage): void {
  parentPort?.postMessage(message)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function load(entry: string): void {
  try {
    const resolved = require.resolve(entry)
    delete require.cache[resolved]
    const loaded = require(resolved) as
      | LocalAdapterModule
      | { default?: LocalAdapterModule }
    const candidate =
      (loaded as { default?: LocalAdapterModule }).default ??
      (loaded as LocalAdapterModule)

    if (!candidate || typeof candidate.generate !== 'function') {
      throw new Error('适配器必须导出 generate(input, ctx)')
    }

    adapter = candidate
    post({ type: 'ready' })
  } catch (error) {
    adapter = null
    post({ type: 'load-error', message: errorMessage(error) })
  }
}

async function generate(id: string, input: unknown): Promise<void> {
  if (!adapter) {
    post({ type: 'error', id, message: '适配器尚未加载' })
    return
  }

  const controller = new AbortController()
  controllers.set(id, controller)

  try {
    const outputs = await adapter.generate(input, {
      onProgress: (percent, message) =>
        post({ type: 'progress', id, percent, message }),
      signal: controller.signal
    })

    if (!Array.isArray(outputs) || outputs.length === 0) {
      throw new Error('适配器没有返回结果')
    }

    post({
      type: 'done',
      id,
      outputs: outputs.map((output) => ({
        data:
          output.data instanceof Uint8Array
            ? output.data
            : new Uint8Array(output.data ?? []),
        mime: output.mime || 'application/octet-stream',
        ...(output.text ? { text: output.text } : {}),
        ...(output.layer ? { layer: output.layer } : {}),
        ...(output.textRecognition
          ? { textRecognition: output.textRecognition }
          : {})
      }))
    })
  } catch (error) {
    post({ type: 'error', id, message: errorMessage(error) })
  } finally {
    controllers.delete(id)
  }
}

parentPort.on('message', (event) => {
  const message = event.data

  if (message.type === 'load') {
    load(message.entry)
    return
  }
  if (message.type === 'generate') {
    void generate(message.id, message.input)
    return
  }
  if (message.type === 'cancel') {
    controllers.get(message.id)?.abort()
    return
  }
  if (message.type === 'dispose') {
    void Promise.resolve(adapter?.dispose?.()).finally(() => process.exit(0))
  }
})

process.on('uncaughtException', (error) => {
  post({ type: 'log', level: 'error', message: errorMessage(error) })
  process.exit(1)
})

process.on('unhandledRejection', (error) => {
  post({ type: 'log', level: 'error', message: errorMessage(error) })
  process.exit(1)
})
