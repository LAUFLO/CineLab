import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../config', () => ({
  getLibraryRoot: vi.fn()
}))

import { getLibraryRoot } from '../config'
import {
  deleteWorkflow,
  listWorkflows,
  renameWorkflow,
  saveWorkflow
} from '../workflows'

let root = ''

function pkg(name: string) {
  const now = new Date().toISOString()
  return {
    version: 1 as const,
    id: `wf-${name}`,
    name,
    createdAt: now,
    updatedAt: now,
    canvas: { nodes: [], edges: [] },
    stages: {},
    meta: {
      nodeCount: 0,
      edgeCount: 0,
      generationCount: 0,
      uploadSlotCount: 0,
      missingGlobalAssets: 0,
      sizeBytes: 0
    }
  }
}

describe('workflow library', () => {
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cinelab-wf-'))
    vi.mocked(getLibraryRoot).mockResolvedValue(root)
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('saves and lists workflows', async () => {
    const summary = await saveWorkflow(pkg('测试'), '<svg />')
    expect(summary.slug).toBe('测试')

    const items = await listWorkflows()
    expect(items).toHaveLength(1)
    expect(items[0]?.name).toBe('测试')
    expect(items[0]?.thumbnail).toBe('工作流/测试/thumbnail.svg')
  })

  it('adds a suffix for duplicate names', async () => {
    await saveWorkflow(pkg('测试'), '<svg />')
    const second = await saveWorkflow(pkg('测试'), '<svg />')
    expect(second.slug).toBe('测试 (2)')
    expect(await listWorkflows()).toHaveLength(2)
  })

  it('renames and deletes workflows', async () => {
    const summary = await saveWorkflow(pkg('测试'), '<svg />')
    const renamed = await renameWorkflow(summary.slug, '新名字')
    expect(renamed.slug).toBe('新名字')
    expect(renamed.name).toBe('新名字')

    await deleteWorkflow(renamed.slug)
    expect(await listWorkflows()).toHaveLength(0)
  })
})
