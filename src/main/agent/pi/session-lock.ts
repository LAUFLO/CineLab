import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import * as lockfile from 'proper-lockfile'
import { piSessionDirectory } from './session'

interface HeldLock {
  windowId: number
  release: () => Promise<void>
}

const held = new Map<string, HeldLock>()

/**
 * 同一会话只允许一个写者：
 * - 进程内 Map 先挡住同进程多窗口；
 * - proper-lockfile 再挡住多进程/多实例。
 */
export async function acquirePiSessionLock(
  root: string,
  sessionId: string,
  windowId: number
): Promise<() => Promise<void>> {
  const key = `${root}:${sessionId}`
  if (held.has(key)) {
    throw new Error('该会话已在另一窗口使用')
  }

  const directory = join(piSessionDirectory(root), '.locks')
  await fs.mkdir(directory, { recursive: true })
  const file = join(directory, `${sessionId}.lock`)
  await fs.writeFile(file, `${windowId}\n`, { flag: 'a' }).catch(() => undefined)

  let releaseFile: () => Promise<void>
  try {
    releaseFile = await lockfile.lock(file, {
      realpath: false,
      retries: 0,
      stale: 30_000
    })
  } catch {
    throw new Error('该会话已在另一窗口使用')
  }

  const release = async (): Promise<void> => {
    await releaseFile().catch(() => undefined)
    held.delete(key)
  }
  held.set(key, { windowId, release })
  return release
}

export function isPiSessionLocked(root: string, sessionId: string): boolean {
  return held.has(`${root}:${sessionId}`)
}
