import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'

export async function withTempDir<T>(
  prefix: string,
  run: (dir: string) => Promise<T>
): Promise<T> {
  const dir = join(app.getPath('temp'), `${prefix}-${randomUUID()}`)
  await fs.mkdir(dir, { recursive: true })

  try {
    return await run(dir)
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}
