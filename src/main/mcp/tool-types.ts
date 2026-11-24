import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { McpToolCategory } from '@shared/agent-tools'

/** 设置页与文档使用的工具元数据 */
export interface McpToolMeta {
  name: string
  title: string
  category: McpToolCategory
  readOnly: boolean
  destructive?: boolean
  confirm: boolean
}

export interface McpToolDefinition {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  category: McpToolCategory
  readOnly: boolean
  destructive?: boolean
  /** 执行前是否需要应用内确认 */
  confirm: boolean
  execute: (args: Record<string, unknown>) => Promise<CallToolResult>
}
