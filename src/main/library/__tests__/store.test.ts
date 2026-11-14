import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ root: '', project: '' }))

vi.mock('electron', () => ({
  app: { getPath: () => state.root },
  nativeImage: {
    createFromPath: () => ({ isEmpty: () => true })
  }
}))

vi.mock('../config', () => ({
  getLibraryRoot: async () => state.root,
  ensureLibrary: async () => state.root
}))

vi.mock('../../project/manager', () => ({
  getCurrentProjectRoot: () => state.project
}))

vi.mock('../../media/ffmpeg', () => ({
  runFfmpeg: async () => {
    throw new Error('ffmpeg disabled in tests')
  }
}))

import {
  addAsset,
  createFolder,
  deleteAsset,
  deleteFolder,
  listAssets,
  listTree,
  moveAsset,
  renameAsset,
  renameFolder
} from '../store'

describe('library store', () => {
  let root: string

  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'cinelab-library-'))
    state.root = root
    state.project = join(root, 'project')
    await fs.mkdir(state.project, { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it('creates, renames and deletes folders', async () => {
    await createFolder('', '测试文件夹')
    let tree = await listTree()
    expect(tree.map((node) => node.name)).toContain('测试文件夹')

    await renameFolder('测试文件夹', '改名文件夹')
    tree = await listTree()
    expect(tree.map((node) => node.name)).toContain('改名文件夹')

    await deleteFolder('改名文件夹')
    tree = await listTree()
    expect(tree.map((node) => node.name)).not.toContain('改名文件夹')
  })

  it('rejects duplicate folders and non-empty deletes', async () => {
    await createFolder('', '重复')
    await expect(createFolder('', '重复')).rejects.toThrow('同名文件夹已存在')

    await fs.writeFile(join(root, '重复', 'source.png'), 'fake')
    await expect(deleteFolder('重复')).rejects.toThrow('文件夹不为空')
  })

  it('adds, lists, renames, moves and deletes assets', async () => {
    await fs.mkdir(join(root, 'inbox'))
    await fs.writeFile(join(root, 'inbox', 'source.png'), 'fake')

    const added = await addAsset({
      folder: '',
      sourcePath: 'inbox/source.png',
      name: '素材',
      scope: 'global'
    })
    expect(added.name).toBe('素材')
    expect(added.path).toBe('素材.png')

    let assets = await listAssets('')
    expect(assets.map((asset) => asset.name)).toContain('素材')

    const renamed = await renameAsset(added.path, '新名字')
    expect(renamed).toBe('新名字.png')

    await createFolder('', '目标')
    const moved = await moveAsset(renamed, '目标')
    expect(moved).toBe('目标/新名字.png')

    await deleteAsset(moved)
    assets = await listAssets('目标')
    expect(assets).toHaveLength(0)
  })
})
