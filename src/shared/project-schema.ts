import { z } from 'zod'

export const nodeKindSchema = z.enum([
  'text',
  'image',
  'video',
  'audio',
  'study'
])

export const outputRefSchema = z.object({
  id: z.string(),
  path: z.string().max(500),
  scope: z.enum(['project', 'global']).optional(),
  kind: z.enum(['image', 'video', 'audio', 'text']),
  createdAt: z.string(),
  model: z.string().max(200),
  width: z.number().optional(),
  height: z.number().optional(),
  duration: z.number().optional(),
  fps: z.number().optional(),
  hasAudio: z.boolean().optional(),
  op: z.string().optional(),
  parentOutputId: z.string().optional()
})
export const nodeStatusSchema = z.enum(['idle', 'queued', 'running', 'done', 'error'])
export const groupColorSchema = z.enum([
  'blue',
  'cyan',
  'teal',
  'green',
  'lime',
  'amber',
  'orange',
  'rose',
  'violet',
  'slate'
])

export const cineNodeSchema = z.object({
  id: z.string().min(1).max(120),
  type: z.literal('cine'),
  parentId: z.string().min(1).max(120).optional(),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.object({
    kind: nodeKindSchema,
    title: z.string().max(200),
    status: nodeStatusSchema,
    text: z.string().max(20000).optional(),
    prompt: z.string().max(20000).optional(),
    studyId: z.string().max(120).optional(),
    sourceNodeId: z.string().max(120).optional(),
    sourcePath: z.string().max(500).optional(),
    sourceScope: z.enum(['project', 'global']).optional(),
    sourceName: z.string().max(200).optional(),
    studyInterval: z.number().optional(),
    studyModelKey: z.string().max(200).optional(),
    studyOutputs: z
      .object({
        storyboard: z.boolean().optional(),
        sheet: z.boolean().optional(),
        motion: z.boolean().optional(),
        music: z.boolean().optional()
      })
      .optional(),
    studyAnalyzed: z.boolean().optional(),
    studyAnalysisError: z.string().max(2000).optional(),
    studyOutputNodeIds: z.array(z.string().max(120)).max(80).optional(),
    studySummary: z
      .object({
        studyId: z.string().max(120),
        frameCount: z.number(),
        segmentCount: z.number(),
        interval: z.number(),
        duration: z.number(),
        fps: z.number()
      })
      .optional(),
    outputUrl: z.string().max(2000).optional(),
    outputs: z.array(outputRefSchema).max(100).optional(),
    selectedOutputId: z.string().max(120).optional(),
    progress: z.number().min(0).max(100).optional(),
    error: z.string().max(2000).optional(),
    templates: z.array(z.string().max(100)).max(20),
    assetOnly: z.boolean().optional()
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

export const studioNodeSchema = z.object({
  id: z.string().min(1).max(120),
  type: z.literal('studio'),
  parentId: z.string().min(1).max(120).optional(),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.object({
    kind: z.literal('studio'),
    title: z.string().max(200),
    status: nodeStatusSchema,
    timelineId: z.string().min(1).max(120),
    filmNodeId: z.string().max(120).optional(),
    clipCount: z.number().int().min(0).optional(),
    durationMs: z.number().min(0).optional(),
    references: z.record(z.string().max(120), z.string().max(120)).optional(),
    filmStatus: z
      .enum(['pending', 'rendering', 'ready', 'stale', 'empty', 'missing'])
      .optional(),
    outputs: z.array(outputRefSchema).max(100).optional(),
    selectedOutputId: z.string().max(120).optional(),
    upstreamAck: z.string().max(2000).optional(),
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

export const filmNodeSchema = z.object({
  id: z.string().min(1).max(120),
  type: z.literal('film'),
  parentId: z.string().min(1).max(120).optional(),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.object({
    kind: z.literal('film'),
    title: z.string().max(200),
    status: nodeStatusSchema,
    studioNodeId: z.string().max(120).optional(),
    filmStatus: z
      .enum(['pending', 'rendering', 'ready', 'stale', 'empty', 'missing'])
      .optional(),
    outputs: z.array(outputRefSchema).max(100).optional(),
    selectedOutputId: z.string().max(120).optional(),
    upstreamAck: z.string().max(2000).optional(),
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

export const videoOpNodeSchema = z.object({
  id: z.string().min(1).max(120),
  type: z.literal('video-op'),
  parentId: z.string().min(1).max(120).optional(),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.object({
    kind: z.literal('video-op'),
    title: z.string().max(200),
    status: nodeStatusSchema,
    operation: z.enum(['shot-retake', 'element-replace', 'extend']),
    sourceNodeId: z.string().max(120),
    resultNodeId: z.string().max(120).optional(),
    range: z
      .object({ start: z.number(), end: z.number() })
      .optional(),
    duration: z.number().optional(),
    direction: z.enum(['forward', 'backward']).optional(),
    referencePath: z.string().max(500).optional(),
    referenceScope: z.enum(['project', 'global']).optional(),
    modelKey: z.string().max(300).optional(),
    prompt: z.string().max(20000).optional(),
    expanded: z.boolean().optional(),
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

export const groupNodeSchema = z.object({
  id: z.string().min(1).max(120),
  type: z.literal('group'),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.object({
    title: z.string().max(200),
    color: groupColorSchema,
    mode: z.enum(['normal', 'storyboard']).optional(),
    ratio: z.enum(['16:9', '9:16', '1:1', '4:3']).optional(),
    gridCols: z.number().int().min(1).max(10).optional(),
    gridRows: z.number().int().min(1).max(10).optional(),
    showIndex: z.boolean().optional()
  }),
  style: z.object({
    width: z.number().positive(),
    height: z.number().positive()
  }),
  selected: z.boolean().optional(),
  measured: z
    .object({
      width: z.number().optional(),
      height: z.number().optional()
    })
    .optional()
})

export const canvasNodeSchema = z.union([
  cineNodeSchema,
  studioNodeSchema,
  filmNodeSchema,
  videoOpNodeSchema,
  groupNodeSchema
])

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
  nodes: z.array(canvasNodeSchema).max(5000),
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
  activeCanvasId: z.string().min(1).max(120),
  cover: z.string().max(200).optional()
})

export type ProjectMeta = z.infer<typeof projectMetaSchema>
export type CanvasData = z.infer<typeof canvasDataSchema>
export type PersistedCineNode = z.infer<typeof cineNodeSchema>
export type PersistedStudioNode = z.infer<typeof studioNodeSchema>
export type PersistedFilmNode = z.infer<typeof filmNodeSchema>
export type PersistedNode =
  | PersistedCineNode
  | PersistedStudioNode
  | PersistedFilmNode
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
  cover?: string
}
