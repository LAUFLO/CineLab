import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import {
  canvasDataSchema,
  projectMetaSchema,
  type ProjectSnapshot
} from '@shared/project-schema'
import { modelModeIds } from '@shared/provider-schema'
import {
  summarizeCanvasEdge,
  summarizeCanvasNode
} from '@shared/canvas-summary'
import { getCurrentProjectRoot, readRecent } from '../project/manager'
import { listProviders } from '../settings/store'

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(file, 'utf8')) as unknown
}

async function currentProject(): Promise<ProjectSnapshot | null> {
  const root = getCurrentProjectRoot()
  if (!root) return null

  const meta = projectMetaSchema.parse(await readJson(join(root, 'project.json')))
  const active =
    meta.canvases.find((canvas) => canvas.id === meta.activeCanvasId) ??
    meta.canvases[0]
  const canvas = canvasDataSchema.parse(
    await readJson(join(root, active.file))
  )

  return { path: root, meta, canvas }
}

function result(value: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }]
  }
}

function errorResult(message: string): CallToolResult {
  return {
    content: [{ type: 'text', text: message }],
    isError: true
  }
}

function nodeKind(node: unknown): string | undefined {
  const data = (node as { data?: { kind?: unknown } }).data
  return typeof data?.kind === 'string' ? data.kind : undefined
}

/** 注册只读的项目 / 画布 / 模型工具 */
export function registerCineLabAppTools(server: McpServer): void {
  server.registerTool(
    'project_list',
    {
      title: '列出最近项目',
      description: '返回最近打开的 CineLab 项目路径、名称和最近打开时间。只读。',
      annotations: { readOnlyHint: true }
    },
    async () => {
      const projects = await readRecent()
      return result({
        projects: projects.map((project) => ({
          path: project.path,
          name: project.name,
          lastOpenedAt: project.lastOpenedAt
        }))
      })
    }
  )

  server.registerTool(
    'project_current',
    {
      title: '读取当前项目',
      description:
        '返回当前打开项目的名称、画布列表、当前画布和节点/连线数量。只读。',
      annotations: { readOnlyHint: true }
    },
    async () => {
      const snapshot = await currentProject()
      if (!snapshot) return errorResult('没有打开的项目')

      return result({
        path: snapshot.path,
        id: snapshot.meta.id,
        name: snapshot.meta.name,
        activeCanvasId: snapshot.meta.activeCanvasId,
        canvases: snapshot.meta.canvases.map((canvas) => ({
          id: canvas.id,
          name: canvas.name,
          file: canvas.file
        })),
        nodeCount: snapshot.canvas.nodes.length,
        edgeCount: snapshot.canvas.edges.length
      })
    }
  )

  server.registerTool(
    'canvas_get',
    {
      title: '读取当前画布',
      description:
        '返回当前画布的节点摘要、连线摘要和视口；不返回 outputs、prompt 或媒体数据。只读。',
      inputSchema: {
        includeEdges: z
          .boolean()
          .optional()
          .describe('是否返回连线，默认 true'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .optional()
          .describe('最多返回多少节点/连线，默认 200')
      },
      annotations: { readOnlyHint: true }
    },
    async ({ includeEdges, limit }) => {
      const snapshot = await currentProject()
      if (!snapshot) return errorResult('没有打开的项目')

      const max = limit ?? 200
      const nodes = snapshot.canvas.nodes.slice(0, max).map(summarizeCanvasNode)
      const edges =
        includeEdges === false
          ? undefined
          : snapshot.canvas.edges.slice(0, max).map(summarizeCanvasEdge)

      return result({
        project: { path: snapshot.path, name: snapshot.meta.name },
        canvas: {
          id: snapshot.canvas.id,
          name: snapshot.canvas.name,
          viewport: snapshot.canvas.viewport,
          nodeCount: snapshot.canvas.nodes.length,
          edgeCount: snapshot.canvas.edges.length,
          truncated:
            snapshot.canvas.nodes.length > max ||
            snapshot.canvas.edges.length > max,
          nodes,
          ...(edges ? { edges } : {})
        }
      })
    }
  )

  server.registerTool(
    'node_list',
    {
      title: '列出当前画布节点',
      description:
        '返回当前画布的节点摘要，可按 kind 过滤；不返回 outputs、prompt 或媒体数据。只读。',
      inputSchema: {
        kind: z
          .string()
          .optional()
          .describe('节点 kind，例如 text / image / video / audio / study'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .optional()
          .describe('最多返回多少节点，默认 200')
      },
      annotations: { readOnlyHint: true }
    },
    async ({ kind, limit }) => {
      const snapshot = await currentProject()
      if (!snapshot) return errorResult('没有打开的项目')

      const filtered = kind
        ? snapshot.canvas.nodes.filter((node) => nodeKind(node) === kind)
        : snapshot.canvas.nodes
      const max = limit ?? 200

      return result({
        project: { path: snapshot.path, name: snapshot.meta.name },
        canvas: { id: snapshot.canvas.id, name: snapshot.canvas.name },
        total: filtered.length,
        truncated: filtered.length > max,
        nodes: filtered.slice(0, max).map(summarizeCanvasNode)
      })
    }
  )

  server.registerTool(
    'model_list',
    {
      title: '列出模型',
      description:
        '返回当前配置的供应商和模型能力；不返回 API Key、Secret 或请求头。只读。',
      annotations: { readOnlyHint: true }
    },
    async () => {
      const providers = await listProviders()
      return result({
        providers: providers.map((provider) => ({
          id: provider.id,
          name: provider.name,
          models: provider.models.map((model) => ({
            id: model.id,
            name: model.name,
            capability: model.capability,
            inputs: model.inputs ?? [],
            modes: modelModeIds(model)
          }))
        }))
      })
    }
  )
}
