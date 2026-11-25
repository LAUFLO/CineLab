import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { trashItem } = vi.hoisted(() => ({
  trashItem: vi.fn(async () => undefined)
}))

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => join(tmpdir(), `cinelab-protected-${name}`)
  },
  shell: { trashItem }
}))

vi.mock('../config', () => ({
  getLibraryRoot: vi.fn(),
  setLibraryRoot: vi.fn()
}))

import { getLibraryRoot, setLibraryRoot } from '../config'
import { migrateLibraryRoot } from '../migrate-root'

let source = ''
let target = ''

describe('migrateLibraryRoot', () => {
  beforeEach(async () => {
    source = await mkdtemp(join(tmpdir(), 'cinelab-lib-src-'))
    target = await mkdtemp(join(tmpdir(), 'cinelab-lib-dst-'))
    vi.mocked(getLibraryRoot).mockResolvedValue(source)
    vi.mocked(setLibraryRoot).mockImplementation(async (path: string) => path)
    trashItem.mockClear()
  })

  afterEach(async () => {
    await rm(source, { recursive: true, force: true })
    await rm(target, { recursive: true, force: true })
  })

  it('copies all content and moves the old root to trash', async () => {
    await mkdir(join(source, '角色'), { recursive: true })
    await mkdir(join(source, '.thumbs'), { recursive: true })
    await writeFile(join(source, '角色', 'a.png'), 'image')
    await writeFile(join(source, '.thumbs', 'a.jpg'), 'thumb')
    await writeFile(join(source, '.tags.json'), '{}')

    const result = await migrateLibraryRoot(target, () => undefined)

    expect(result.files).toBe(3)
    expect(result.trashedOldRoot).toBe(true)
    expect(await readFile(join(target, '角色', 'a.png'), 'utf8')).toBe('image')
    expect(await readFile(join(target, '.thumbs', 'a.jpg'), 'utf8')).toBe('thumb')
    expect(await readFile(join(target, '.tags.json'), 'utf8')).toBe('{}')
    expect(trashItem).toHaveBeenCalledWith(source)
  })

  it('rejects a non-empty target', async () => {
    await writeFile(join(target, 'existing.txt'), 'x')
    await expect(
      migrateLibraryRoot(target, () => undefined)
    ).rejects.toThrow('目标文件夹必须为空')
    expect(trashItem).not.toHaveBeenCalled()
  })

  it('rejects a target inside the source', async () => {
    await expect(
      migrateLibraryRoot(join(source, 'nested'), () => undefined)
    ).rejects.toThrow('目标文件夹不能位于当前资产库内部')
  })
})
