import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import {
  canvasDataSchema,
  projectMetaSchema,
  type ProjectSnapshot
} from '@shared/project-schema'
import { getCurrentProjectRoot, readRecent } from '../project/manager'
import {
  listLocalAdapterStatuses,
  localAdapterLogs,
  reloadLocalAdapter
} from '../local-adapters/registry'
import { getPreferences } from '../settings/preferences'
import { errorResult, result, runWrite } from './write-runner'
import type { McpToolDefinition } from './tool-types'

const emptySchema = {
  type: 'object',
  properties: {},
  additionalProperties: false
}

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
  const canvas = canvasDataSchema.parse(await readJson(join(root, active.file)))

  return { path: root, meta, canvas }
}

/**
 * MCP 专属工具：这些能力不在 CineBot 的 70 个工具里，
 * 但外部 Agent 需要它们来切换工作台、查看项目和重载适配器。
 */
export const MCP_EXCLUSIVE_TOOLS: McpToolDefinition[] = [
  {
    name: 'project_list',
    title: '最近项目',
    description:
      '返回最近打开的 CineLab 项目路径、名称和最近打开时间。只读。',
    inputSchema: emptySchema,
    category: '项目',
    readOnly: true,
    confirm: false,
    execute: async () => {
      const projects = await readRecent()
      return result({
        projects: projects.map((project) => ({
          path: project.path,
          name: project.name,
          lastOpenedAt: project.lastOpenedAt
        }))
      })
    }
  },
  {
    name: 'project_current',
    title: '当前项目',
    description:
      '返回当前打开项目的名称、画布列表、当前画布和节点/连线数量。只读。',
    inputSchema: emptySchema,
    category: '项目',
    readOnly: true,
    confirm: false,
    execute: async () => {
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
  },
  {
    name: 'local_adapter_list',
    title: '列出本地适配器',
    description:
      '返回本地适配器的状态、版本、模型和错误信息。只读，不修改任何文件。',
    inputSchema: emptySchema,
    category: '适配器',
    readOnly: true,
    confirm: false,
    execute: async () => result({ adapters: listLocalAdapterStatuses() })
  },
  {
    name: 'local_adapter_reload',
    title: '重载本地适配器',
    description:
      '重新构建并加载指定本地适配器。适配器目录不存在或构建失败时返回错误。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', minLength: 1, description: '适配器 ID，即 adapters 目录名' }
      },
      required: ['id'],
      additionalProperties: false
    },
    category: '适配器',
    readOnly: false,
    confirm: false,
    execute: async (args) => {
      const preferences = await getPreferences()
      if (preferences.mcp.readOnly) {
        return errorResult(
          'MCP 当前为只读模式，请在设置中关闭只读后再执行写操作'
        )
      }
      await reloadLocalAdapter(String(args.id))
      return result({
        ok: true,
        adapters: listLocalAdapterStatuses()
      })
    }
  },
  {
    name: 'local_adapter_logs',
    title: '读取适配器日志',
    description: '读取最近的构建、加载和进程输出日志。只读。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '只读取指定适配器' },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 200,
          description: '最多返回多少行，默认 50'
        }
      },
      additionalProperties: false
    },
    category: '适配器',
    readOnly: true,
    confirm: false,
    execute: async (args) => {
      const id = typeof args.id === 'string' ? args.id : undefined
      const limit = typeof args.limit === 'number' ? args.limit : 50
      return result({ logs: localAdapterLogs(id, limit) })
    }
  },
  {
    name: 'timeline_open',
    title: '打开剪辑室',
    description:
      '创建并打开一个剪辑室节点；已打开时直接返回。执行前会弹出确认框。',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: '画布坐标 X' },
        y: { type: 'number', description: '画布坐标 Y' },
        title: { type: 'string', maxLength: 200, description: '节点标题' }
      },
      additionalProperties: false
    },
    category: '剪辑室',
    readOnly: false,
    confirm: true,
    execute: async (args) =>
      runWrite('timeline_open', '创建并打开剪辑室', args)
  },
  {
    name: 'stage_open',
    title: '打开导演台',
    description:
      '创建并打开一个导演台节点。执行前会弹出确认框。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', maxLength: 200, description: '导演台名称' },
        x: { type: 'number', description: '画布坐标 X' },
        y: { type: 'number', description: '画布坐标 Y' }
      },
      additionalProperties: false
    },
    category: '导演台',
    readOnly: false,
    confirm: true,
    execute: async (args) =>
      runWrite(
        'stage_open',
        `创建并打开导演台${args.name ? `「${String(args.name)}」` : ''}`,
        args
      )
  },
  {
    name: 'generation_start',
    title: '提交生成',
    description:
      '对已有画布节点提交生成。执行前会弹出确认框；模型和参数由 CineLab 校验。',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', minLength: 1 },
        modelKey: { type: 'string', minLength: 1 },
        prompt: { type: 'string', maxLength: 20_000 },
        params: {
          type: 'object',
          additionalProperties: true
        }
      },
      required: ['nodeId', 'modelKey', 'prompt'],
      additionalProperties: false
    },
    category: '生成',
    readOnly: false,
    confirm: true,
    execute: async (args) =>
      runWrite(
        'generation_start',
        `提交生成：${String(args.modelKey)}`,
        args
      )
  }
]
