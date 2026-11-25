import { z } from 'zod'
import {
  canvasNodeSchema,
  cineEdgeSchema,
  type CanvasData
} from './project-schema'

export const WORKFLOW_VERSION = 1
export const WORKFLOW_FOLDER = '工作流'
export const MAX_WORKFLOW_NODES = 500
export const MAX_WORKFLOW_EDGES = 1000
export const MAX_WORKFLOW_BYTES = 200 * 1024 * 1024

export type WorkflowSlot = 'upload' | 'generate'

export const workflowSlotSchema = z.enum(['upload', 'generate'])

export const workflowMetaSchema = z.object({
  nodeCount: z.number().int().min(0),
  edgeCount: z.number().int().min(0),
  generationCount: z.number().int().min(0),
  uploadSlotCount: z.number().int().min(0),
  missingGlobalAssets: z.number().int().min(0).default(0),
  sizeBytes: z.number().int().min(0).default(0)
})

export const workflowPackageSchema = z.object({
  version: z.literal(WORKFLOW_VERSION),
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(60),
  description: z.string().max(500).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  canvas: z.object({
    nodes: z.array(canvasNodeSchema).max(MAX_WORKFLOW_NODES),
    edges: z.array(cineEdgeSchema).max(MAX_WORKFLOW_EDGES)
  }),
  stages: z.record(z.string(), z.unknown()).default({}),
  meta: workflowMetaSchema
})

export type WorkflowPackage = z.infer<typeof workflowPackageSchema>
export type WorkflowNode = WorkflowPackage['canvas']['nodes'][number]
export type WorkflowEdge = WorkflowPackage['canvas']['edges'][number]
export type WorkflowMeta = WorkflowPackage['meta']

export interface WorkflowSummary {
  slug: string
  id: string
  name: string
  description?: string
  createdAt: string
  updatedAt: string
  meta: WorkflowMeta
  thumbnail?: string
}

export interface WorkflowSaveInput {
  name: string
  description?: string
  /** 当前画布全部节点；selectedIds 为空时保存整画布 */
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  selectedIds?: string[]
  projectPath: string
  includeLinkedText?: boolean
  /** 覆盖已有工作流目录 */
  overwriteSlug?: string
}

export interface WorkflowApplyResult {
  canvas: CanvasData
  nodeIds: string[]
  warnings: string[]
}

export interface WorkflowImportResult {
  summary: WorkflowSummary
  warnings: string[]
}

export function workflowNodeSlot(node: WorkflowNode): WorkflowSlot | null {
  if (node.type !== 'cine') return null
  return node.data.workflowSlot ?? null
}
