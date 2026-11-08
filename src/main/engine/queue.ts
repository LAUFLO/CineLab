import { EventEmitter } from 'node:events'
import type { GeneratedAsset } from '@shared/generation'

export interface QueueJob {
  id: string
  nodeId: string
  run: (
    signal: AbortSignal,
    onProgress: (percent: number, message?: string) => void
  ) => Promise<GeneratedAsset[]>
}

class GenerationQueue extends EventEmitter {
  private pending: QueueJob[] = []
  private running = new Map<string, QueueJob>()
  private controllers = new Map<string, AbortController>()
  private concurrency = 2

  enqueue(job: QueueJob): void {
    this.pending.push(job)
    this.emit('queued', job)
    this.pump()
  }

  setConcurrency(value: number): void {
    const next = Math.floor(value)
    this.concurrency = Number.isFinite(next)
      ? Math.max(1, Math.min(4, next))
      : 2
    this.pump()
  }

  cancel(jobId: string): void {
    const index = this.pending.findIndex((job) => job.id === jobId)
    if (index >= 0) {
      const [job] = this.pending.splice(index, 1)
      if (job) this.emit('cancelled', job)
      return
    }
    this.controllers.get(jobId)?.abort()
  }

  cancelAll(): void {
    for (const job of this.pending) {
      this.emit('cancelled', job)
    }
    this.pending = []
    for (const controller of this.controllers.values()) {
      controller.abort()
    }
  }

  private pump(): void {
    while (this.running.size < this.concurrency && this.pending.length > 0) {
      const job = this.pending.shift()
      if (!job) return
      void this.execute(job)
    }
  }

  private async execute(job: QueueJob): Promise<void> {
    const controller = new AbortController()
    this.controllers.set(job.id, controller)
    this.running.set(job.id, job)

    try {
      this.emit('start', job)
      const assets = await job.run(controller.signal, (percent, message) => {
        this.emit('progress', job, percent, message)
      })
      this.emit('done', job, assets)
    } catch (error) {
      if (controller.signal.aborted) {
        this.emit('cancelled', job)
      } else {
        this.emit('error', job, error)
      }
    } finally {
      this.controllers.delete(job.id)
      this.running.delete(job.id)
      this.pump()
    }
  }
}

export const generationQueue = new GenerationQueue()
