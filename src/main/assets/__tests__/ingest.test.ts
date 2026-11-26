import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  nativeImage: {
    createFromBuffer: () => ({
      isEmpty: () => true,
      getSize: () => ({ width: 0, height: 0 }),
      resize: () => ({ toPNG: () => Buffer.alloc(0) }),
      toPNG: () => Buffer.alloc(0)
    })
  }
}))
vi.mock('../../media/ffmpeg', () => ({ probeMedia: async () => ({}) }))

import { ingestAsset } from '../ingest'

describe('ingestAsset model kind', () => {
  it('把 GLB 写入 assets/model 并返回项目内 .glb 路径', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cinelab-model-'))
    const data = Buffer.from('glTF-test')
    const asset = await ingestAsset({
      projectPath: root,
      data,
      kind: 'model',
      mime: 'model/gltf-binary',
      model: '导入'
    })

    expect(asset.kind).toBe('model')
    expect(asset.path).toMatch(/^assets\/model\/[a-f0-9]{32}\.glb$/)
    expect(await readFile(join(root, asset.path))).toEqual(data)
  })

  it('gltf+json 使用 .gltf 扩展名', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cinelab-model-'))
    const asset = await ingestAsset({
      projectPath: root,
      data: Buffer.from('{}'),
      kind: 'model',
      mime: 'model/gltf+json',
      model: '导入'
    })
    expect(asset.path).toMatch(/\.gltf$/)
  })
})
