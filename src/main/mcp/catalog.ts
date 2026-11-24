/**
 * MCP 工具目录。
 *
 * 工具清单不再手写：`AGENT_TOOLS` 的每个定义自带 `mcp` 元数据，
 * `auto-tools.ts` 从它投影，再合并 8 个 MCP 专属工具。
 * 设置页、文档生成和测试都读这里。
 */
export type { McpToolCategory } from '@shared/agent-tools'
export type { McpToolMeta } from './tool-types'
export { MCP_TOOL_CATALOG, mcpToolCatalog } from './auto-tools'
