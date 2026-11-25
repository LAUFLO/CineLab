import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { CanvasData } from '@shared/project-schema'
import type { WorkflowNode, WorkflowPackage } from '@shared/workflow-schema'
import {
  validateStageDoc,
  type DirectorStageDoc
} from '@shared/stage-schema'
import { saveStageFile } from '../stage/storage'
import { getLibraryRoot } from '../library/config'
import { listProviders } from '../settings/store'

export interface InstantiateOptions {
  projectPath: string
  /** 追加到当前画布时，顶层节点的偏移量 */
  offset?: { x: number; y: number }
}

export interface InstantiateResult {
  nodes: CanvasData['nodes']
  edges: CanvasData['edges']
  nodeIds: string[]
  warnings: string[]
}

function globalFilePath(libraryRoot: string, path: string): string {
  return join(libraryRoot, ...path.split('/'))
}

async function pruneGlobalRefs(
  data: Record<string, unknown>,
  libraryRoot: string,
  warnings: string[],
  label: string
): Promise<void> {
  const refOrder = data.refOrder
  if (Array.isArray(refOrder)) {
    const kept: string[] = []
    for (const entry of refOrder) {
      if (typeof entry !== 'string' || !entry.startsWith('global:')) continue
      const path = entry.slice('global:'.length)
      if (existsSync(globalFilePath(libraryRoot, path))) {
        kept.push(entry)
      } else {
        warnings.push(`${label} 引用的全局素材已删除：${path}`)
      }
    }
    if (kept.length > 0) data.refOrder = kept
    else delete data.refOrder
  }

  if (
    typeof data.referenceScope === 'string' &&
    data.referenceScope === 'global' &&
    typeof data.referencePath === 'string' &&
    !existsSync(globalFilePath(libraryRoot, data.referencePath))
  ) {
    warnings.push(`${label} 引用的全局素材已删除：${data.referencePath}`)
    delete data.referencePath
    delete data.referenceScope
  }

  if (
    typeof data.sourceScope === 'string' &&
    data.sourceScope === 'global' &&
    typeof data.sourcePath === 'string' &&
    !existsSync(globalFilePath(libraryRoot, data.sourcePath))
  ) {
    warnings.push(`${label} 引用的全局素材已删除：${data.sourcePath}`)
    delete data.sourcePath
    delete data.sourceScope
    delete data.sourceName
  }
}

export async function instantiateWorkflow(
  pkg: WorkflowPackage,
  options: InstantiateOptions
): Promise<InstantiateResult> {
  const warnings: string[] = []
  const libraryRoot = await getLibraryRoot()
  const stageMap = new Map<string, string>()
  const providers = await listProviders()
  const modelIndex = new Map<string, string>()
  for (const provider of providers) {
    for (const model of provider.models) {
      modelIndex.set(model.id, `${provider.id}/${model.id}`)
    }
  }

  for (const [oldId, doc] of Object.entries(pkg.stages)) {
    const stageDoc = doc as DirectorStageDoc
    const errors = validateStageDoc(stageDoc)
    if (errors.length > 0) {
      warnings.push(`场景 ${oldId} 校验失败，已转为待重新创建：${errors[0]}`)
      continue
    }

    const stageId = `stage_${randomUUID()}`
    await saveStageFile(options.projectPath, {
      ...stageDoc,
      stageId,
      updatedAt: new Date().toISOString()
    })
    stageMap.set(oldId, stageId)
  }

  const stamp = Date.now().toString(36)
  const idMap = new Map<string, string>()
  pkg.canvas.nodes.forEach((node, index) => {
    idMap.set(node.id, `node_${stamp}_${index + 1}`)
  })

  const nodes: CanvasData['nodes'] = []
  for (const source of pkg.canvas.nodes) {
    const node = structuredClone(source) as WorkflowNode
    node.id = idMap.get(source.id) as string
    const parentId = (node as { parentId?: string }).parentId
    if (parentId) {
      ;(node as { parentId?: string }).parentId =
        idMap.get(parentId) ?? undefined
    }

    if (options.offset && !(node as { parentId?: string }).parentId) {
      node.position = {
        x: node.position.x + options.offset.x,
        y: node.position.y + options.offset.y
      }
    }

    const data = node.data as Record<string, unknown>
    const label = String(data.title ?? node.id)

    if (node.type === 'stage' && typeof data.stageId === 'string') {
      const mapped = stageMap.get(data.stageId)
      if (mapped) {
        data.stageId = mapped
      } else {
        warnings.push(`节点「${label}」的场景文档缺失，需要重新创建`)
      }
    }

    if (node.type === 'studio') {
      data.timelineId = `timeline_${randomUUID()}`
    }

    if (node.type === 'video-op') {
      const sourceId = idMap.get(String(data.sourceNodeId ?? ''))
      data.sourceNodeId = sourceId ?? ''
      if (typeof data.resultNodeId === 'string') {
        data.resultNodeId = idMap.get(data.resultNodeId) ?? undefined
      }
    }

    if (node.type === 'film' && typeof data.studioNodeId === 'string') {
      data.studioNodeId = idMap.get(data.studioNodeId) ?? undefined
    }

    if (node.type === 'cine') {
      if (Array.isArray(data.studyOutputNodeIds)) {
        data.studyOutputNodeIds = data.studyOutputNodeIds
          .map((id) => (typeof id === 'string' ? idMap.get(id) : undefined))
          .filter((id): id is string => Boolean(id))
      }

      if (typeof data.modelKey === 'string') {
        const [providerId, modelId] = data.modelKey.split('/')
        const provider = providers.find((item) => item.id === providerId)
        const exists = provider?.models.some((model) => model.id === modelId)
        if (!exists) {
          const fallback = modelIndex.get(modelId)
          if (fallback) {
            data.modelKey = fallback
            warnings.push(`节点「${label}」的模型已按模型 ID 重新匹配`)
          } else {
            delete data.modelKey
            warnings.push(`节点「${label}」的模型不可用，已回退默认模型`)
          }
        }
      }

      await pruneGlobalRefs(data, libraryRoot, warnings, label)

      const hasOutput = Array.isArray(data.outputs) && data.outputs.length > 0
      if (data.assetOnly === true && !hasOutput) {
        data.workflowSlot = 'upload'
      } else if (data.workflowSlot === undefined && data.assetOnly !== true) {
        data.workflowSlot = 'generate'
      }
    }

    nodes.push(node)
  }

  const idSet = new Set(nodes.map((node) => node.id))
  const edges = pkg.canvas.edges
    .map((edge, index) => {
      const next = structuredClone(edge)
      next.id = `edge_${stamp}_${index + 1}`
      next.source = idMap.get(edge.source) ?? edge.source
      next.target = idMap.get(edge.target) ?? edge.target
      return next
    })
    .filter((edge) => idSet.has(edge.source) && idSet.has(edge.target))

  return {
    nodes,
    edges,
    nodeIds: nodes.map((node) => node.id),
    warnings
  }
}
