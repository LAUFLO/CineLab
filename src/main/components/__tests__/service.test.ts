import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const env = vi.hoisted(() => ({
  userData: '',
  fetchManifest: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getPath: () => env.userData },
  BrowserWindow: { getAllWindows: () => [] },
  net: { fetch: vi.fn() }
}))

vi.mock('../manifest', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../manifest')>()
  return { ...actual, fetchManifest: env.fetchManifest }
})

beforeAll(async () => {
  env.userData = await fs.mkdtemp(join(tmpdir(), 'cinelab-components-'))
  const dir = join(env.userData, 'components', 'stem-model')
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(join(dir, 'htdemucs.th'), 'stub')
  await fs.writeFile(
    join(dir, 'manifest.json'),
    JSON.stringify({ version: 1, kind: 'stem-model' })
  )
})

afterAll(async () => {
  await fs.rm(env.userData, { recursive: true, force: true })
})

beforeEach(() => {
  env.fetchManifest.mockReset()
  env.fetchManifest.mockResolvedValue({ version: 2, size: 10 })
})

describe('component update checks', () => {
  it('reuses the disk cache for 24 hours across restarts', async () => {
    vi.resetModules()
    const first = await import('../service')
    const items = await first.checkComponentUpdates()
    expect(env.fetchManifest).toHaveBeenCalledTimes(1)
    expect(
      items.find((item) => item.kind === 'stem-model')?.updateAvailable
    ).toBe(true)

    await first.checkComponentUpdates()
    expect(env.fetchManifest).toHaveBeenCalledTimes(1)

    vi.resetModules()
    const restarted = await import('../service')
    expect(await restarted.checkComponentUpdates()).toEqual(items)
    expect(env.fetchManifest).toHaveBeenCalledTimes(1)
  })

  it('bypasses the cache when forced', async () => {
    vi.resetModules()
    const service = await import('../service')
    await service.checkComponentUpdates(true)
    expect(env.fetchManifest).toHaveBeenCalledTimes(1)
  })
})
