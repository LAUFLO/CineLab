import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildLocalAdapter, resolveLocalAdapterEntry } from '../build'
import type { LocalAdapterManifest } from '../manifest'

const requireCjs = createRequire(import.meta.url)

const manifest: LocalAdapterManifest = {
  id: 'echo',
  version: '0.1.0',
  type: 'code',
  entry: 'adapter.ts'
}

let dir = ''

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true })
  dir = ''
})

describe('local adapter build', () => {
  it('bundles TypeScript to CommonJS and keeps the default export', async () => {
    dir = await mkdtemp(join(tmpdir(), 'cinelab-adapter-'))
    await writeFile(
      join(dir, 'adapter.ts'),
      `export default {
  async generate() {
    return [{ data: new Uint8Array([1, 2, 3]), mime: 'image/png' }]
  }
}
`
    )

    expect(resolveLocalAdapterEntry(dir, manifest)).toBe(
      join(dir, 'adapter.ts')
    )

    const result = await buildLocalAdapter(dir, manifest)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const loaded = requireCjs(result.outfile) as {
      default: { generate: () => Promise<Array<{ mime: string }>> }
    }
    const outputs = await loaded.default.generate()
    expect(outputs[0].mime).toBe('image/png')
  })

  it('reports build errors without throwing', async () => {
    dir = await mkdtemp(join(tmpdir(), 'cinelab-adapter-'))
    await writeFile(join(dir, 'adapter.ts'), 'export default {')

    const result = await buildLocalAdapter(dir, manifest)
    expect(result.ok).toBe(false)
  })

  it('reports a missing entry', async () => {
    dir = await mkdtemp(join(tmpdir(), 'cinelab-adapter-'))
    const result = await buildLocalAdapter(dir, manifest)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('找不到适配器入口')
  })
})
