import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  Notification: { isSupported: () => false },
  nativeImage: { createFromPath: () => ({}) }
}))

vi.mock('../../window', () => ({
  brandIconPath: () => ''
}))

vi.mock('../stems', () => ({
  separateStems: vi.fn()
}))

import { separateStems } from '../stems'
import {
  cancelStemTask,
  hasActiveStemTasks,
  listStemTasks,
  startStemTask
} from '../stem-tasks'

const audio = {
  id: 'asset',
  path: 'assets/aud/test.m4a',
  kind: 'audio' as const,
  createdAt: '2026-11-22T00:00:00.000Z',
  model: 'test'
}

function wait(ms = 20): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

afterEach(() => {
  vi.mocked(separateStems).mockReset()
})

describe('stem task queue', () => {
  it('runs tasks in FIFO order and reports active state', async () => {
    let resolveFirst: (() => void) | undefined
    let resolveSecond: (() => void) | undefined

    vi.mocked(separateStems)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = () =>
              resolve({ video: null, audio })
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = () =>
              resolve({ video: null, audio })
          })
      )

    const first = startStemTask('/project', {
      path: 'assets/aud/a.wav',
      mode: 'vocal'
    })
    await wait()
    expect(hasActiveStemTasks()).toBe(true)
    expect(listStemTasks().find((task) => task.taskId === first.taskId)?.status)
      .toBe('running')

    const second = startStemTask('/project', {
      path: 'assets/aud/b.wav',
      mode: 'background'
    })
    await wait()
    expect(listStemTasks().find((task) => task.taskId === second.taskId)?.status)
      .toBe('queued')
    expect(second.queuePosition).toBe(2)

    resolveFirst?.()
    await wait()
    expect(listStemTasks().find((task) => task.taskId === second.taskId)?.status)
      .toBe('running')

    resolveSecond?.()
    await wait()
    expect(hasActiveStemTasks()).toBe(false)
  })

  it('cancels a queued task', async () => {
    let resolveFirst: (() => void) | undefined
    vi.mocked(separateStems).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = () => resolve({ video: null, audio })
        })
    )

    const first = startStemTask('/project', {
      path: 'assets/aud/a.wav',
      mode: 'vocal'
    })
    const second = startStemTask('/project', {
      path: 'assets/aud/b.wav',
      mode: 'vocal'
    })
    await wait()
    cancelStemTask(second.taskId)

    expect(listStemTasks().find((task) => task.taskId === second.taskId)?.status)
      .toBe('cancelled')

    resolveFirst?.()
    await wait()
    expect(hasActiveStemTasks()).toBe(false)
    expect(first.taskId).toBeTruthy()
  })
})
