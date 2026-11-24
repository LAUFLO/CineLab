import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import {
  listLocalAdapterStatuses,
  localAdapterLogs,
  reloadLocalAdapter
} from '../local-adapters/registry'
import { getPreferences } from '../settings/preferences'

function result(value: unknown): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(value, null, 2)
      }
    ]
  }
}

/** 注册 S2c 先暴露的本地适配器工具 */
export function registerCineLabTools(server: McpServer): void {
  server.registerTool(
    'local_adapter_list',
    {
      title: '列出本地适配器',
      description:
        '返回本地适配器的状态、版本、模型和错误信息。只读，不修改任何文件。',
      annotations: { readOnlyHint: true }
    },
    async () => result({ adapters: listLocalAdapterStatuses() })
  )

  server.registerTool(
    'local_adapter_reload',
    {
      title: '重新加载本地适配器',
      description:
        '重新构建并加载指定本地适配器。适配器目录不存在或构建失败时返回错误。',
      inputSchema: {
        id: z.string().min(1).describe('适配器 ID，即 adapters 目录名')
      },
      annotations: { readOnlyHint: false }
    },
    async ({ id }) => {
      const preferences = await getPreferences()
      if (preferences.mcp.readOnly) {
        return {
          content: [{ type: 'text', text: 'MCP 当前为只读模式' }],
          isError: true
        }
      }
      await reloadLocalAdapter(id)
      return result({
        ok: true,
        adapters: listLocalAdapterStatuses()
      })
    }
  )

  server.registerTool(
    'local_adapter_logs',
    {
      title: '读取本地适配器日志',
      description: '读取最近的构建、加载和进程输出日志。只读。',
      inputSchema: {
        id: z.string().optional().describe('只读取指定适配器'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe('最多返回多少行，默认 50')
      },
      annotations: { readOnlyHint: true }
    },
    async ({ id, limit }) =>
      result({ logs: localAdapterLogs(id, limit ?? 50) })
  )
}
