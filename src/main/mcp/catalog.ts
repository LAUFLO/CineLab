/**
 * MCP 工具目录。
 *
 * 工具清单不再手写：由 `auto-tools.ts` 从 `AGENT_TOOLS` 投影，
 * 再合并 8 个 MCP 专属工具。设置页、文档生成和测试都读这里。
 */
export type { McpToolCategory, McpToolMeta } from './exposure'
export { MCP_TOOL_CATALOG, mcpToolCatalog } from './auto-tools'
