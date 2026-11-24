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
import { AGENT_CAPABILITIES } from '../agent/capabilities/registry'
import { listSkills, readSkill } from '../agent/skills'
import { listAllAssets } from '../library/store'

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

  server.registerTool(
    'library_search',
    {
      title: '搜索资产库',
      description:
        '按名称或路径搜索全局资产库中的图片、视频和音频，返回相对路径、名称和类型。只读。',
      inputSchema: {
        query: z
          .string()
          .max(100)
          .optional()
          .describe('名称或路径关键词，省略时返回最近素材'),
        kind: z
          .enum(['image', 'video', 'audio'])
          .optional()
          .describe('素材类型'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('最多返回多少条，默认 50')
      },
      annotations: { readOnlyHint: true }
    },
    async ({ query, kind, limit }) => {
      const assets = await listAllAssets()
      const keyword = query?.trim().toLowerCase() ?? ''
      const filtered = assets.filter((asset) => {
        if (asset.kind === 'template') return false
        if (kind && asset.kind !== kind) return false
        if (!keyword) return true
        return (
          asset.name.toLowerCase().includes(keyword) ||
          asset.path.toLowerCase().includes(keyword)
        )
      })
      filtered.sort((left, right) =>
        right.modifiedAt.localeCompare(left.modifiedAt)
      )
      const max = limit ?? 50
      return result({
        total: filtered.length,
        truncated: filtered.length > max,
        assets: filtered.slice(0, max).map((asset) => ({
          path: asset.path,
          name: asset.name,
          kind: asset.kind,
          size: asset.size,
          modifiedAt: asset.modifiedAt,
          tags: asset.tags ?? []
        }))
      })
    }
  )

  server.registerTool(
    'capability_catalog',
    {
      title: '能力目录',
      description:
        '列出 CineBot 已开放的能力，包含工具名、模块、只读与确认规则。只读。',
      annotations: { readOnlyHint: true }
    },
    async () => {
      return result({
        total: AGENT_CAPABILITIES.length,
        capabilities: AGENT_CAPABILITIES.map((item) => ({
          toolName: item.toolName,
          capabilityId: item.id,
          scope: item.scope,
          readOnly: item.readOnly,
          confirmation: item.confirmation,
          description: item.description
        }))
      })
    }
  )

  server.registerTool(
    'capability_search',
    {
      title: '搜索能力',
      description: '按关键词搜索 CineBot 能力，返回匹配的工具与说明。只读。',
      inputSchema: {
        query: z.string().min(1).max(100).describe('关键词'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe('最多返回多少条，默认 20')
      },
      annotations: { readOnlyHint: true }
    },
    async ({ query, limit }) => {
      const keyword = query.trim().toLowerCase()
      const matched = AGENT_CAPABILITIES.filter(
        (item) =>
          item.toolName.toLowerCase().includes(keyword) ||
          item.id.toLowerCase().includes(keyword) ||
          item.description.toLowerCase().includes(keyword)
      )
      const max = limit ?? 20
      return result({
        total: matched.length,
        truncated: matched.length > max,
        capabilities: matched.slice(0, max).map((item) => ({
          toolName: item.toolName,
          capabilityId: item.id,
          scope: item.scope,
          readOnly: item.readOnly,
          description: item.description
        }))
      })
    }
  )

  server.registerTool(
    'skill_list',
    {
      title: '列出技能',
      description:
        '列出内置、全局和当前项目的技能，可按 scope 过滤。只读。',
      inputSchema: {
        scope: z
          .enum(['builtin', 'global', 'project'])
          .optional()
          .describe('技能作用域')
      },
      annotations: { readOnlyHint: true }
    },
    async ({ scope }) => {
      const root = getCurrentProjectRoot() ?? ''
      const skills = await listSkills(root)
      const filtered = scope
        ? skills.filter((skill) => skill.scope === scope)
        : skills
      return result({
        total: filtered.length,
        skills: filtered.map((skill) => ({
          name: skill.name,
          description: skill.description,
          scope: skill.scope
        }))
      })
    }
  )

  server.registerTool(
    'skill_read',
    {
      title: '读取技能',
      description:
        '读取一个技能的 SKILL.md 或引用文件，支持 offset/limit 分段。只读。',
      inputSchema: {
        name: z.string().min(1).describe('技能名称'),
        path: z
          .string()
          .optional()
          .describe('技能内相对路径，默认 SKILL.md'),
        offset: z.number().int().min(0).optional().describe('起始字节偏移'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100000)
          .optional()
          .describe('最多读取字节数')
      },
      annotations: { readOnlyHint: true }
    },
    async ({ name, path, offset, limit }) => {
      const root = getCurrentProjectRoot() ?? ''
      const content = await readSkill({ root, name, path, offset, limit })
      return result(content)
    }
  )
}
