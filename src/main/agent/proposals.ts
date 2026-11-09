import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type {
  AgentProposal,
  AgentProposalDraft,
  AgentProposalStatus
} from '@shared/agent'
import {
  isProposalExpired,
  normalizeGenerationParams,
  proposalCount,
  proposalExpiresAt
} from '@shared/agent-proposal'
import { modelInputs, type Capability } from '@shared/provider-schema'
import { startGeneration } from '../engine/start-generation'
import { resolveProvider } from '../settings/store'

const PROPOSAL_ID_PATTERN = /^[a-zA-Z0-9_-]{8,80}$/
const MAX_PROMPT_LENGTH = 8000
const MAX_REFS = 4

type ProposalChangeListener = (proposal: AgentProposal) => void

const listeners = new Set<ProposalChangeListener>()
const runIndex = new Map<string, { root: string; proposalId: string }>()

export function setProposalChangeListener(
  listener: ProposalChangeListener
): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emitChange(proposal: AgentProposal): void {
  for (const listener of listeners) {
    try {
      listener(proposal)
    } catch {
      // 监听器失败不影响提案状态
    }
  }
}

export function proposalDirectory(root: string): string {
  return join(root, '.cinelab', 'agent', 'proposals')
}

function proposalFile(root: string, id: string): string {
  if (!PROPOSAL_ID_PATTERN.test(id)) {
    throw new Error('提案 ID 无效')
  }
  return join(proposalDirectory(root), `${id}.json`)
}

async function writeProposal(root: string, proposal: AgentProposal): Promise<void> {
  const directory = proposalDirectory(root)
  await fs.mkdir(directory, { recursive: true })
  const file = proposalFile(root, proposal.id)
  const temporary = `${file}.tmp`
  await fs.writeFile(temporary, `${JSON.stringify(proposal, null, 2)}\n`, 'utf8')
  await fs.rename(temporary, file)
}

async function readProposal(
  root: string,
  id: string
): Promise<AgentProposal | null> {
  try {
    const raw = await fs.readFile(proposalFile(root, id), 'utf8')
    return JSON.parse(raw) as AgentProposal
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    return null
  }
}

async function listProposals(root: string): Promise<AgentProposal[]> {
  let entries: string[]
  try {
    entries = await fs.readdir(proposalDirectory(root))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    return []
  }

  const proposals: AgentProposal[] = []
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue
    const id = entry.slice(0, -'.json'.length)
    if (!PROPOSAL_ID_PATTERN.test(id)) continue
    const proposal = await readProposal(root, id)
    if (proposal) proposals.push(proposal)
  }
  return proposals.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

async function patchProposal(
  root: string,
  proposal: AgentProposal,
  patch: Partial<AgentProposal>
): Promise<AgentProposal> {
  const next = { ...proposal, ...patch }
  await writeProposal(root, next)
  emitChange(next)
  return next
}

function assertRelativePath(value: unknown, label: string): void {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} 路径不能为空`)
  }
  if (
    value.includes('..') ||
    value.startsWith('/') ||
    value.startsWith('\\') ||
    /^[a-zA-Z]:/.test(value)
  ) {
    throw new Error(`${label} 路径必须是项目内相对路径`)
  }
}

function assertDraft(draft: AgentProposalDraft): void {
  if (!draft || typeof draft !== 'object') throw new Error('提案格式无效')
  if (typeof draft.turnId !== 'string' || !draft.turnId.trim()) {
    throw new Error('缺少回合 ID')
  }
  if (typeof draft.nodeTitle !== 'string' || draft.nodeTitle.length > 200) {
    throw new Error('节点标题无效')
  }

  const request = draft.request
  if (!request || typeof request !== 'object') throw new Error('缺少生成请求')
  if (typeof request.nodeId !== 'string' || !request.nodeId.trim()) {
    throw new Error('缺少目标节点')
  }
  if (typeof request.modelKey !== 'string' || !request.modelKey.includes('/')) {
    throw new Error('模型标识无效')
  }
  if (
    typeof request.prompt !== 'string' ||
    !request.prompt.trim() ||
    request.prompt.length > MAX_PROMPT_LENGTH
  ) {
    throw new Error(`提示词不能为空且不能超过 ${MAX_PROMPT_LENGTH} 个字符`)
  }
  if (
    request.params !== undefined &&
    (typeof request.params !== 'object' ||
      request.params === null ||
      Array.isArray(request.params))
  ) {
    throw new Error('生成参数格式无效')
  }
  if (request.mask !== undefined) {
    throw new Error('生成提案暂不支持蒙版编辑')
  }
  if (request.videoOptions !== undefined) {
    throw new Error('生成提案暂不支持视频编辑操作')
  }
  if (request.refs !== undefined && !Array.isArray(request.refs)) {
    throw new Error('参考素材格式无效')
  }
  if ((request.refs?.length ?? 0) > MAX_REFS) {
    throw new Error(`参考图片最多 ${MAX_REFS} 张`)
  }
  for (const ref of request.refs ?? []) {
    assertRelativePath(ref.path, '参考图片')
    if (!['firstFrame', 'lastFrame', 'reference'].includes(ref.role)) {
      throw new Error('参考图片角色无效')
    }
    if (ref.scope !== undefined && !['project', 'global'].includes(ref.scope)) {
      throw new Error('参考图片作用域无效')
    }
  }
  if (request.video) {
    assertRelativePath(request.video.path, '参考视频')
    if (request.video.scope !== undefined && !['project', 'global'].includes(request.video.scope)) {
      throw new Error('参考视频作用域无效')
    }
  }
}

async function resolveModel(
  request: AgentProposalDraft['request'],
  requestedCount?: number
): Promise<{
  modelName: string
  capability: Capability
  params: Record<string, unknown>
  count: number
}> {
  const slash = request.modelKey.indexOf('/')
  const providerId = request.modelKey.slice(0, slash)
  const modelId = request.modelKey.slice(slash + 1)

  const provider = await resolveProvider(providerId)
  if (!provider) throw new Error('找不到模型供应商，请先在设置中配置')
  if (!provider.apiKey) throw new Error('该供应商没有配置 API Key')

  const model = provider.models.find((item) => item.id === modelId)
  if (!model) throw new Error('找不到该模型')

  const hasCountParam = model.params.some((param) => param.key === 'n')
  if (requestedCount !== undefined && !hasCountParam && requestedCount !== 1) {
    throw new Error('该模型不支持一次生成多个，请把 count 设为 1')
  }

  const inputParams =
    requestedCount !== undefined && hasCountParam
      ? { ...(request.params ?? {}), n: requestedCount }
      : request.params
  const normalized = normalizeGenerationParams(model.params, inputParams)
  if (normalized.issues.length > 0) {
    throw new Error(normalized.issues[0])
  }

  const inputs = modelInputs(model)
  if ((request.refs?.length ?? 0) > 0 && !inputs.includes('image')) {
    throw new Error('该模型不支持参考图片')
  }
  if (request.video && !inputs.includes('video')) {
    throw new Error('该模型不支持参考视频')
  }

  const count = proposalCount(model.capability, normalized.params)

  return {
    modelName: model.name,
    capability: model.capability,
    params: normalized.params,
    count
  }
}

export async function createProposal(
  root: string,
  sessionId: string,
  draft: AgentProposalDraft
): Promise<AgentProposal> {
  assertDraft(draft)
  const requestedCount =
    typeof draft.count === 'number' && Number.isFinite(draft.count)
      ? Math.round(draft.count)
      : undefined
  if (requestedCount !== undefined && (requestedCount < 1 || requestedCount > 8)) {
    throw new Error('生成数量需要在 1-8 之间')
  }
  const model = await resolveModel(draft.request, requestedCount)

  const proposal: AgentProposal = {
    id: `proposal-${randomUUID()}`,
    sessionId,
    turnId: draft.turnId,
    status: 'pending',
    request: {
      ...draft.request,
      nodeId: draft.request.nodeId.trim(),
      prompt: draft.request.prompt.trim(),
      params: model.params
    },
    nodeTitle: draft.nodeTitle,
    modelName: model.modelName,
    capability: model.capability,
    count: model.count,
    createdAt: new Date().toISOString(),
    expiresAt: proposalExpiresAt()
  }

  await writeProposal(root, proposal)
  emitChange(proposal)
  return proposal
}

async function expireIfNeeded(
  root: string,
  proposal: AgentProposal
): Promise<AgentProposal> {
  if (
    (proposal.status === 'pending' || proposal.status === 'submitting') &&
    isProposalExpired(proposal)
  ) {
    return patchProposal(root, proposal, {
      status: 'expired',
      error: '提案已超过有效期，请让 CineBot 重新生成'
    })
  }
  return proposal
}

export async function activeProposal(
  root: string,
  sessionId: string
): Promise<AgentProposal | null> {
  const proposals = await listProposals(root)
  let latest: AgentProposal | null = null

  for (const proposal of proposals) {
    if (proposal.sessionId !== sessionId) continue
    if (proposal.status === 'submitting') {
      await patchProposal(root, proposal, {
        status: 'failed',
        error: '上次提交被中断，请确认任务状态后再操作'
      })
      continue
    }
    const checked = await expireIfNeeded(root, proposal)
    if (checked.status === 'pending') {
      if (!latest || checked.createdAt > latest.createdAt) latest = checked
    }
  }

  return latest
}

export async function expireSessionProposals(
  root: string,
  sessionId: string
): Promise<void> {
  const proposals = await listProposals(root)
  for (const proposal of proposals) {
    if (proposal.sessionId !== sessionId || proposal.status !== 'pending') continue
    await patchProposal(root, proposal, {
      status: 'expired',
      error: '已开始新一轮对话，请重新确认生成'
    })
  }
}

export async function submitProposal(
  root: string,
  proposalId: string
): Promise<AgentProposal> {
  const proposal = await readProposal(root, proposalId)
  if (!proposal) throw new Error('找不到这个生成提案')

  const checked = await expireIfNeeded(root, proposal)
  if (checked.status === 'expired') {
    throw new Error('提案已失效，请让 CineBot 重新生成')
  }
  if (checked.status === 'submitting') {
    throw new Error('提案正在提交，请稍候')
  }
  if (checked.status === 'submitted' || checked.status === 'completed') {
    if (checked.runId) {
      runIndex.set(checked.runId, { root, proposalId })
    }
    return checked
  }
  if (checked.status === 'failed' && checked.runId) {
    throw new Error('这个提案已经提交过一次，不能重复购买；请让 CineBot 新建提案')
  }
  if (checked.status === 'cancelled') {
    throw new Error('提案已取消')
  }

  const submitting = await patchProposal(root, checked, {
    status: 'submitting',
    error: undefined
  })

  try {
    const { runId } = await startGeneration(root, submitting.request)
    runIndex.set(runId, { root, proposalId })
    const submitted = await patchProposal(root, submitting, {
      status: 'submitted',
      runId,
      submittedAt: new Date().toISOString()
    })
    return submitted
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '提交生成失败'
    await patchProposal(root, submitting, {
      status: 'failed',
      error: message
    })
    throw error
  }
}

export async function cancelProposal(
  root: string,
  proposalId: string
): Promise<AgentProposal> {
  const proposal = await readProposal(root, proposalId)
  if (!proposal) throw new Error('找不到这个生成提案')
  if (proposal.status !== 'pending') {
    throw new Error('只有待确认的提案可以取消')
  }
  return patchProposal(root, proposal, {
    status: 'cancelled',
    error: undefined
  })
}

export async function updateProposalFromRun(
  runId: string,
  status: Extract<
    AgentProposalStatus,
    'submitted' | 'completed' | 'failed' | 'cancelled'
  >,
  error?: string
): Promise<void> {
  const entry = runIndex.get(runId)
  if (!entry) return

  try {
    const proposal = await readProposal(entry.root, entry.proposalId)
    if (!proposal || proposal.runId !== runId) return
    if (proposal.status === status) return
    if (proposal.status === 'submitted' && status === 'submitted') return

    await patchProposal(entry.root, proposal, {
      status,
      ...(status === 'failed'
        ? { error: error ?? proposal.error ?? '生成失败' }
        : {})
    })
  } catch {
    // 提案状态更新失败不影响生成任务
  }
}
