import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createStageFile,
  deleteStageFile,
  duplicateStageFile,
  loadStageFile,
  saveStageFile,
  stageDirectory
} from '../storage'

describe('stage file storage', () => {
  let root: string

  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'cinelab-stage-'))
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it('creates a stage file with a generated id', async () => {
    const doc = await createStageFile(root, '办公室')
    expect(doc.stageId).toMatch(/^stage_/)
    expect(doc.name).toBe('办公室')
    expect(doc.version).toBe(1)

    const loaded = await loadStageFile(root, doc.stageId)
    expect(loaded).toMatchObject({
      stageId: doc.stageId,
      name: '办公室',
      objects: [],
      cameras: [],
      shots: []
    })
  })

  it('uses a default name when none is given', async () => {
    const doc = await createStageFile(root)
    expect(doc.name).toBe('未命名场景')
  })

  it('saves and reloads a scene with objects and cameras', async () => {
    const doc = await createStageFile(root, '测试场景')
    const saved = {
      ...doc,
      objects: [
        {
          id: 'human_a',
          type: 'human' as const,
          name: '人物 A',
          transform: {
            position: [0, 0, 0] as [number, number, number],
            rotation: [0, 0, 0] as [number, number, number],
            scale: [1, 1, 1] as [number, number, number]
          }
        }
      ],
      cameras: [
        {
          id: 'cam_1',
          name: '机位 1',
          position: [0, 1.6, 5] as [number, number, number],
          target: [0, 1, 0] as [number, number, number],
          fov: 50
        }
      ],
      activeCameraId: 'cam_1'
    }

    await saveStageFile(root, saved)
    const loaded = await loadStageFile(root, doc.stageId)
    expect(loaded?.objects).toHaveLength(1)
    expect(loaded?.cameras[0]?.fov).toBe(50)
    expect(loaded?.activeCameraId).toBe('cam_1')
  })

  it('rejects invalid scene documents', async () => {
    const doc = await createStageFile(root)
    await expect(
      saveStageFile(root, {
        ...doc,
        shots: [
          {
            id: 'shot_1',
            cameraId: 'missing',
            durationMs: 20_000,
            aspect: '16:9'
          }
        ]
      })
    ).rejects.toThrow('场景文档无效')
  })

  it('returns null for a missing stage file', async () => {
    await expect(loadStageFile(root, 'stage_missing')).resolves.toBeNull()
  })

  it('rejects invalid stage ids', async () => {
    await expect(loadStageFile(root, '../escape')).rejects.toThrow(
      '无效的场景 ID'
    )
  })

  it('duplicates a scene with a new id and name', async () => {
    const doc = await createStageFile(root, '原场景')
    await saveStageFile(root, {
      ...doc,
      objects: [
        {
          id: 'box_1',
          type: 'box',
          name: '箱子',
          transform: {
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1]
          }
        }
      ]
    })

    const copy = await duplicateStageFile(root, doc.stageId)
    expect(copy.stageId).not.toBe(doc.stageId)
    expect(copy.name).toBe('原场景 副本')
    expect(copy.objects).toHaveLength(1)

    const original = await loadStageFile(root, doc.stageId)
    expect(original?.stageId).toBe(doc.stageId)
  })

  it('deletes a stage file', async () => {
    const doc = await createStageFile(root)
    await deleteStageFile(root, doc.stageId)
    await expect(loadStageFile(root, doc.stageId)).resolves.toBeNull()
  })

  it('creates the stages directory on demand', async () => {
    const doc = await createStageFile(root)
    const entries = await fs.readdir(stageDirectory(root))
    expect(entries).toContain(`${doc.stageId}.json`)
  })
})
