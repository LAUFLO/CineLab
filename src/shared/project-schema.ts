import { z } from 'zod'

export const nodeKindSchema = z.enum(['text', 'image', 'video', 'audio'])
export const nodeStatusSchema = z.enum(['idle', 'queued', 'running', 'done', 'error'])

export const cineNodeSchema = z.object({
  id: z.string().min(1).max(120),
  type: z.literal('cine'),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.object({
    kind: nodeKindSchema,
    title: z.string().max(200),
    status: nodeStatusSchema,
    text: z.string().max(20000).optional(),
    outputUrl: z.string().max(2000).optional(),
    outputs: z
      .array(
        z.object({
          id: z.string(),
          path: z.string().max(500),
          kind: z.enum(['image', 'video', 'audio', 'text']),
          createdAt: z.string(),
          model: z.string().max(200)
        })
      )
      .max(100)
      .optional(),
    selectedOutputId: z.string().max(120).optional(),
    progress: z.number().min(0).max(100).optional(),
    error: z.string().max(2000).optional(),
    templates: z.array(z.string().max(100)).max(20)
  }),
  style: z
    .object({
      width: z.number().optional(),
      height: z.number().optional()
    })
    .optional(),
  selected: z.boolean().optional(),
  measured: z
    .object({
      width: z.number().optional(),
      height: z.number().optional()
    })
    .optional()
})

export const cineEdgeSchema = z.object({
  id: z.string().min(1).max(120),
  source: z.string().min(1).max(120),
  target: z.string().min(1).max(120),
  type: z.string().max(60).optional(),
  data: z.record(z.string(), z.unknown()).optional()
})

export const canvasDataSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1).max(120),
  name: z.string().max(200),
  viewport: z.object({
    x: z.number(),
    y: z.number(),
    zoom: z.number().min(0.01).max(10)
  }),
  nodes: z.array(cineNodeSchema).max(5000),
  edges: z.array(cineEdgeSchema).max(10000)
})

export const projectMetaSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1).max(120),
  name: z.string().max(200),
  createdAt: z.string(),
  updatedAt: z.string(),
  canvases: z
    .array(
      z.object({
        id: z.string().min(1).max(120),
        name: z.string().max(200),
        file: z.string().max(200)
      })
    )
    .min(1)
    .max(100),
  activeCanvasId: z.string().min(1).max(120)
})

export type ProjectMeta = z.infer<typeof projectMetaSchema>
export type CanvasData = z.infer<typeof canvasDataSchema>
export type PersistedNode = z.infer<typeof cineNodeSchema>
export type PersistedEdge = z.infer<typeof cineEdgeSchema>

export interface ProjectSnapshot {
  path: string
  meta: ProjectMeta
  canvas: CanvasData
}

export interface RecentProject {
  path: string
  name: string
  lastOpenedAt: string
}
