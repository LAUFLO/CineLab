import { afterEach, describe, expect, it } from 'vitest'
import { generationQueue } from '../queue'

const internals = generationQueue as unknown as {
  running: Map<string, unknown>
  pending: unknown[]
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function enqueueDeferred(id: string, gate: Promise<void>): void {
  generationQueue.enqueue({
    id,
    nodeId: id,
    run: async (signal) => {
      await Promise.race([
        gate,
        new Promise<never>((_, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new Error('aborted')),
            { once: true }
          )
        })
      ])
      return []
    }
  })
}

const tick = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0))

describe('generationQueue', () => {
  afterEach(async () => {
    generationQueue.cancelAll()
    await tick()
  })

  it('并发 8 时同时启动 8 个任务', async () => {
    generationQueue.setConcurrency(8)
    const gates = Array.from({ length: 8 }, () => deferred())
    gates.forEach((gate, index) => enqueueDeferred(`job-${index}`, gate.promise))
    await tick()

    expect(internals.running.size).toBe(8)
    expect(internals.pending.length).toBe(0)

    gates.forEach((gate) => gate.resolve())
    await tick()
  })

  it('超过并发上限的任务排队等待', async () => {
    generationQueue.setConcurrency(8)
    const gates = Array.from({ length: 9 }, () => deferred())
    gates.forEach((gate, index) => enqueueDeferred(`job-${index}`, gate.promise))
    await tick()

    expect(internals.running.size).toBe(8)
    expect(internals.pending.length).toBe(1)

    gates[0].resolve()
    await tick()

    expect(internals.running.size).toBe(8)
    expect(internals.pending.length).toBe(0)

    gates.forEach((gate) => gate.resolve())
    await tick()
  })
})
