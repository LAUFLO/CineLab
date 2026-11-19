import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  acquirePiSessionLock,
  isPiSessionLocked
} from '../session-lock'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true }).catch(() => undefined)
    )
  )
})

describe('pi session lock', () => {
  it('allows one writer and releases cleanly', async () => {
    const root = await fs.mkdtemp(join(tmpdir(), 'cinelab-pi-lock-'))
    roots.push(root)

    const release = await acquirePiSessionLock(root, 'session-1', 1)
    expect(isPiSessionLocked(root, 'session-1')).toBe(true)
    await expect(
      acquirePiSessionLock(root, 'session-1', 2)
    ).rejects.toThrow('该会话已在另一窗口使用')

    await release()
    expect(isPiSessionLocked(root, 'session-1')).toBe(false)

    const again = await acquirePiSessionLock(root, 'session-1', 2)
    await again()
  })
})
