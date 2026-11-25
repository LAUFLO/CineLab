import { randomUUID } from 'node:crypto'
import {
  MAX_WORKFLOW_NODES,
  workflowPackageSchema,
  type WorkflowEdge,
  type WorkflowNode,
  type WorkflowPackage,
  type WorkflowSaveInput,
  type WorkflowSlot
} from '@shared/workflow-schema'
import { validateStageDoc, type DirectorStageDoc } from '@shared/stage-schema'
import { loadStageFile } from '../stage/storage'
import { buildWorkflowThumbnail } from './thumbnail'

interface BuildResult {
  package: WorkflowPackage
  thumbnail: string
  warnings: string[]
}

function isGeneratedOutput(output: {
  op?: string
  model?: string
}): boolean {
  if (output.op) return true
  const model = output.model ?? ''
  return model !== '' && model !== '本地上传' && model !== '资产库'
}

function slotForNode(node: WorkflowNode): WorkflowSlot | null {
  if (node.type !== 'cine') return null
  if (node.data.kind === 'study') return null

  const outputs = node.data.outputs ?? []
  const generated = outputs.some(isGeneratedOutput)
  if (node.data.assetOnly === true && !generated) return 'upload'
  return 'generate'
}

function keepGlobalRef(entry: string): boolean {
  return entry.startsWith('global:')
}

function collectLinkedTextIds(
  nodes: WorkflowNode[],
  selected: Set<string>
): string[] {
  const textNodes = nodes.filter(
    (node) => node.type === 'cine' && node.data.kind === 'text'
  )
  if (textNodes.length === 0) return []

  const prompts: string[] = []
  for (const node of nodes) {
    if (!selected.has(node.id) || node.type !== 'cine') continue
    if (node.data.prompt) prompts.push(node.data.prompt)
    if (node.data.text) prompts.push(node.data.text)
  }
  if (prompts.length === 0) return []

  const linked: string[] = []
  for (const textNode of textNodes) {
    if (selected.has(textNode.id)) continue
    const title = textNode.data.title
    if (!title) continue
    if (prompts.some((prompt) => prompt.includes(`@${title}`))) {
      linked.push(textNode.id)
    }
  }
  return linked
}

function expandSelection(input: WorkflowSaveInput): Set<string> {
  const selected =
    input.selectedIds && input.selectedIds.length > 0
      ? new Set(input.selectedIds)
      : new Set(input.nodes.map((node) => node.id))

  // 选中分组时自动包含其子节点
  for (const node of input.nodes) {
    const parentId = (node as { parentId?: string }).parentId
    if (parentId && selected.has(parentId)) selected.add(node.id)
  }

  // video-op 的源节点不在范围内时向上追溯一层
  for (const node of input.nodes) {
    if (!selected.has(node.id) || node.type !== 'video-op') continue
    const sourceId = node.data.sourceNodeId
    if (sourceId && !selected.has(sourceId)) selected.add(sourceId)
  }

  if (input.includeLinkedText !== false) {
    for (const id of collectLinkedTextIds(input.nodes, selected)) {
      selected.add(id)
    }
  }

  return selected
}

function cleanNode(node: WorkflowNode, stageIds: Set<string>): void {
  const data = node.data as Record<string, unknown>
  const slot = slotForNode(node)

  delete node.selected
  delete node.measured
  delete data.outputs
  delete data.outputUrl
  delete data.selectedOutputId
  delete data.progress
  delete data.error
  delete data.workflowSlot

  data.status = 'idle'

  if (node.type === 'cine') {
    if (data.kind === 'study') {
      data.workflowSlot = 'generate'
      delete data.studyId
      delete data.studyRef
      delete data.studySummary
      delete data.studyAnalyzed
      delete data.studyAnalysisError
      delete data.studyOutputNodeIds
      delete data.sourcePath
      delete data.sourceScope
      delete data.sourceName
      delete data.sourceNodeId
    }
    if (slot) data.workflowSlot = slot

    const refOrder = data.refOrder
    if (Array.isArray(refOrder)) {
      const kept = refOrder.filter(
        (entry): entry is string => typeof entry === 'string' && keepGlobalRef(entry)
      )
      if (kept.length > 0) data.refOrder = kept
      else delete data.refOrder
    }

    if (
      typeof data.referenceScope === 'string' &&
      data.referenceScope !== 'global'
    ) {
      delete data.referencePath
      delete data.referenceScope
    }

    if (typeof data.sourceScope === 'string' && data.sourceScope !== 'global') {
      delete data.sourcePath
      delete data.sourceScope
      delete data.sourceName
    }
  }

  if (node.type === 'studio') {
    data.workflowSlot = 'generate'
    delete data.timelineId
    delete data.clipCount
    delete data.durationMs
    delete data.references
    delete data.filmStatus
    delete data.upstreamAck
    delete data.outputs
    delete data.selectedOutputId
  }

  if (node.type === 'film') {
    delete data.filmStatus
    delete data.upstreamAck
    delete data.outputs
    delete data.selectedOutputId
  }

  if (node.type === 'video-op') {
    delete data.resultNodeId
  }

  if (node.type === 'stage') {
    const stageId = data.stageId
    if (typeof stageId !== 'string' || !stageIds.has(stageId)) {
      data.objectCount = 0
      data.cameraCount = 0
      data.shotCount = 0
    }
  }
}

function normalizePositions(nodes: WorkflowNode[]): void {
  const topLevel = nodes.filter(
    (node) => !(node as { parentId?: string }).parentId
  )
  if (topLevel.length === 0) return

  const minX = Math.min(...topLevel.map((node) => node.position.x))
  const minY = Math.min(...topLevel.map((node) => node.position.y))
  if (minX === 0 && minY === 0) return

  for (const node of topLevel) {
    node.position = {
      x: node.position.x - minX,
      y: node.position.y - minY
    }
  }
}

function assertAcyclic(nodes: WorkflowNode[], edges: WorkflowEdge[]): void {
  const ids = new Set(nodes.map((node) => node.id))
  const indegree = new Map<string, number>()
  const outgoing = new Map<string, string[]>()

  for (const id of ids) {
    indegree.set(id, 0)
    outgoing.set(id, [])
  }

  for (const edge of edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1)
    outgoing.get(edge.source)?.push(edge.target)
  }

  const queue = [...ids].filter((id) => (indegree.get(id) ?? 0) === 0)
  let visited = 0

  while (queue.length > 0) {
    const id = queue.shift() as string
    visited += 1
    for (const next of outgoing.get(id) ?? []) {
      const value = (indegree.get(next) ?? 0) - 1
      indegree.set(next, value)
      if (value === 0) queue.push(next)
    }
  }

  if (visited === ids.size) return

  const cyclic = [...ids].filter((id) => (indegree.get(id) ?? 0) > 0)
  const titles = nodes
    .filter((node) => cyclic.includes(node.id))
    .map((node) => String((node.data as { title?: string }).title ?? node.id))
    .slice(0, 8)
  throw new Error(`工作流存在循环连接：${titles.join('、')}`)
}

async function collectStages(
  nodes: WorkflowNode[],
  projectPath: string,
  warnings: string[]
): Promise<Record<string, DirectorStageDoc>> {
  const stages: Record<string, DirectorStageDoc> = {}

  for (const node of nodes) {
    if (node.type !== 'stage') continue
    const stageId = node.data.stageId
    if (!stageId) continue

    try {
      const doc = await loadStageFile(projectPath, stageId)
      if (!doc) {
        warnings.push(`场景 ${stageId} 不存在，已保留节点并清空统计`)
        continue
      }

      const cleaned: DirectorStageDoc = {
        ...doc,
        background:
          doc.background.kind === 'color'
            ? doc.background
            : { kind: 'color', value: '#1a1a1a' },
        objects: doc.objects.map((object) => {
          if (!object.assetPath) return object
          const next = { ...object }
          delete next.assetPath
          return next
        })
      }

      const errors = validateStageDoc(cleaned)
      if (errors.length > 0) {
        warnings.push(`场景 ${stageId} 校验失败：${errors[0]}`)
        continue
      }

      stages[stageId] = cleaned
    } catch (error) {
      warnings.push(
        `场景 ${stageId} 读取失败：${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
  }

  return stages
}

export async function buildWorkflow(
  input: WorkflowSaveInput
): Promise<BuildResult> {
  const selected = expandSelection(input)
  const nodes = input.nodes
    .filter((node) => selected.has(node.id))
    .map((node) => structuredClone(node))
  const edges = input.edges
    .filter((edge) => selected.has(edge.source) && selected.has(edge.target))
    .map((edge) => structuredClone(edge))

  if (nodes.length === 0) {
    throw new Error('没有可保存的节点')
  }
  if (nodes.length > MAX_WORKFLOW_NODES) {
    throw new Error(`工作流最多支持 ${MAX_WORKFLOW_NODES} 个节点`)
  }

  const warnings: string[] = []
  const stages = await collectStages(nodes, input.projectPath, warnings)
  const stageIds = new Set(Object.keys(stages))

  for (const node of nodes) {
    cleanNode(node, stageIds)
  }

  normalizePositions(nodes)
  assertAcyclic(nodes, edges)

  const generationCount =
    nodes.filter(
      (node) =>
        node.type === 'video-op' ||
        (node.type === 'cine' &&
          node.data.kind !== 'text' &&
          node.data.kind !== 'study' &&
          node.data.workflowSlot === 'generate')
    ).length
  const uploadSlotCount = nodes.filter(
    (node) =>
      node.type === 'cine' && node.data.workflowSlot === 'upload'
  ).length

  const now = new Date().toISOString()
  const draft = {
    version: 1 as const,
    id: randomUUID(),
    name: input.name.trim().slice(0, 60) || '未命名工作流',
    ...(input.description?.trim()
      ? { description: input.description.trim().slice(0, 500) }
      : {}),
    createdAt: now,
    updatedAt: now,
    canvas: { nodes, edges },
    stages,
    meta: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      generationCount,
      uploadSlotCount,
      missingGlobalAssets: 0,
      sizeBytes: 0
    }
  }

  draft.meta.sizeBytes = Buffer.byteLength(JSON.stringify(draft), 'utf8')
  const packageValue = workflowPackageSchema.parse(draft)
  const thumbnail = buildWorkflowThumbnail(nodes, edges)

  return { package: packageValue, thumbnail, warnings }
}
