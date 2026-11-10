import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentProposal, AgentProposalDraft } from '@shared/agent'
import type { ModelDef } from '@shared/provider-schema'

const mocks = vi.hoisted(() => ({
  resolveProvider: vi.fn(),
  startGeneration: vi.fn()
}))

vi.mock('../../settings/store', () => ({
  resolveProvider: mocks.resolveProvider
}))

vi.mock('../../engine/start-generation', () => ({
  startGeneration: mocks.startGeneration
}))

import {
  activeProposal,
  cancelProposal,
  createProposal,
  expireSessionProposals,
  proposalDirectory,
  submitProposal,
  updateProposalFromRun
} from '../proposals'

const model: ModelDef = {
  id: 'img',
  name: 'Image 模型',
  capability: 'image.t2i',
  remoteModel: 'img',
  inputs: ['text'],
  params: [
    {
      key: 'n',
      label: '数量',
      type: 'number',
      defaultValue: 1,
      min: 1,
      max: 4
    },
    {
      key: 'ratio',
      label: '比例',
      type: 'select',
      options: [
        { value: '1:1', label: '1:1' },
        { value: '16:9', label: '16:9' }
      ],
      defaultValue: '1:1'
    }
  ]
}

function draft(overrides: Partial<AgentProposalDraft> = {}): AgentProposalDraft {
  return {
    turnId: 'turn-1',
    nodeTitle: '分镜 01',
    request: {
      nodeId: 'node-1',
      modelKey: 'provider/img',
      prompt: '一只在雨里的猫',
      params: { n: 2, ratio: '1:1' }
    },
    ...overrides
  }
}

async function readFile(root: string, proposalId: string): Promise<AgentProposal> {
  const raw = await fs.readFile(
    join(proposalDirectory(root), `${proposalId}.json`),
    'utf8'
  )
  return JSON.parse(raw) as AgentProposal
}

describe('agent generation proposals', () => {
  let root: string

  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'cinelab-proposals-'))
    mocks.resolveProvider.mockReset()
    mocks.startGeneration.mockReset()
    mocks.resolveProvider.mockResolvedValue({
      type: 'openai-compat',
      baseUrl: 'https://example.com',
      apiKey: 'test-key',
      secretKey: '',
      models: [model]
    })
    mocks.startGeneration.mockResolvedValue({ runId: 'run-1' })
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it('creates a pending proposal with count', async () => {
    const proposal = await createProposal(root, 'main', draft())

    expect(proposal.status).toBe('pending')
    expect(proposal.count).toBe(2)
    expect(proposal.capability).toBe('image.t2i')
    await expect(readFile(root, proposal.id)).resolves.toMatchObject({
      id: proposal.id,
      status: 'pending'
    })
  })

  it('rejects params the model does not declare', async () => {
    const input = draft()
    input.request.params = { size: '2K' }
    await expect(createProposal(root, 'main', input)).rejects.toThrow(
      '模型没有声明参数 size'
    )
  })

  it('rejects a missing provider key', async () => {
    mocks.resolveProvider.mockResolvedValueOnce({
      type: 'openai-compat',
      baseUrl: 'https://example.com',
      apiKey: '',
      secretKey: '',
      models: [model]
    })
    await expect(createProposal(root, 'main', draft())).rejects.toThrow(
      '没有配置 API Key'
    )
  })

  it('expires pending proposals when a new turn starts', async () => {
    const proposal = await createProposal(root, 'main', draft())
    await expireSessionProposals(root, 'main')

    const stored = await readFile(root, proposal.id)
    expect(stored.status).toBe('expired')
    await expect(activeProposal(root, 'main')).resolves.toBeNull()
  })

  it('expires proposals past their ttl', async () => {
    const proposal = await createProposal(root, 'main', draft())
    await fs.writeFile(
      join(proposalDirectory(root), `${proposal.id}.json`),
      JSON.stringify({
        ...proposal,
        expiresAt: new Date(Date.now() - 1000).toISOString()
      }),
      'utf8'
    )

    await expect(activeProposal(root, 'main')).resolves.toBeNull()
    expect((await readFile(root, proposal.id)).status).toBe('expired')
  })

  it('submits once and returns the same proposal on repeated submit', async () => {
    const proposal = await createProposal(root, 'main', draft())
    const first = await submitProposal(root, proposal.id)
    expect(first.status).toBe('submitted')
    expect(first.runId).toBe('run-1')

    const second = await submitProposal(root, proposal.id)
    expect(second.status).toBe('submitted')
    expect(second.runId).toBe('run-1')
    expect(mocks.startGeneration).toHaveBeenCalledTimes(1)
  })

  it('allows retry when submission failed before enqueueing', async () => {
    const proposal = await createProposal(root, 'main', draft())
    mocks.startGeneration.mockRejectedValueOnce(new Error('network down'))

    await expect(submitProposal(root, proposal.id)).rejects.toThrow('network down')
    const failed = await readFile(root, proposal.id)
    expect(failed.status).toBe('failed')
    expect(failed.runId).toBeUndefined()

    mocks.startGeneration.mockResolvedValueOnce({ runId: 'run-2' })
    const retried = await submitProposal(root, proposal.id)
    expect(retried.status).toBe('submitted')
    expect(retried.runId).toBe('run-2')
  })

  it('blocks repeat purchase after a submitted run failed', async () => {
    const proposal = await createProposal(root, 'main', draft())
    await submitProposal(root, proposal.id)
    await updateProposalFromRun('run-1', 'failed', '模型服务不可用')

    const stored = await readFile(root, proposal.id)
    expect(stored.status).toBe('failed')
    expect(stored.error).toBe('模型服务不可用')

    await expect(submitProposal(root, proposal.id)).rejects.toThrow(
      '不能重复购买'
    )
    expect(mocks.startGeneration).toHaveBeenCalledTimes(1)
  })

  it('tracks completed and cancelled run states', async () => {
    const proposal = await createProposal(root, 'main', draft())
    await submitProposal(root, proposal.id)

    await updateProposalFromRun('run-1', 'completed')
    expect((await readFile(root, proposal.id)).status).toBe('completed')

    const second = await createProposal(root, 'main', draft())
    mocks.startGeneration.mockResolvedValueOnce({ runId: 'run-3' })
    await submitProposal(root, second.id)
    await updateProposalFromRun('run-3', 'cancelled')
    expect((await readFile(root, second.id)).status).toBe('cancelled')
  })

  it('only cancels pending proposals', async () => {
    const proposal = await createProposal(root, 'main', draft())
    const cancelled = await cancelProposal(root, proposal.id)
    expect(cancelled.status).toBe('cancelled')

    await expect(cancelProposal(root, proposal.id)).rejects.toThrow(
      '只有待确认的提案可以取消'
    )
  })
})
