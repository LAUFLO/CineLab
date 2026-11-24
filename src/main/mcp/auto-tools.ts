import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  type CallToolResult
} from '@modelcontextprotocol/sdk/types.js'
import type { AgentScope } from '@shared/agent'
import { executeMainTool } from '../agent/main-tools'
import { AGENT_TOOLS } from '../agent/tools'
import { getCurrentProjectRoot } from '../project/manager'
import { MCP_EXCLUSIVE_TOOLS } from './exclusive-tools'
import { validateJsonSchema } from './schema-validate'
import type { McpToolDefinition, McpToolMeta } from './tool-types'
import {
  errorResult,
  registerMcpCommandIpc,
  runRead,
  runWrite
} from './write-runner'

function currentScope(): AgentScope {
  return {
    projectPath: getCurrentProjectRoot() ?? '',
    canvasId: '',
    selectedNodeIds: []
  }
}

async function runMainTool(
  name: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  const result = await executeMainTool(
    { callId: `mcp-${name}`, name, args },
    currentScope()
  )
  if (!result.ok) return errorResult(result.error ?? '执行失败')
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result.result ?? { ok: true }, null, 2)
      }
    ]
  }
}

function projectedTools(): McpToolDefinition[] {
  const tools: McpToolDefinition[] = []

  for (const tool of AGENT_TOOLS) {
    const meta = tool.mcp
    if (!meta || meta.expose === false) continue

    const readOnly = tool.readOnly
    const viaMain = tool.executor === 'main'

    tools.push({
      name: tool.name,
      title: meta.title,
      description: meta.description ?? tool.description,
      inputSchema: tool.parameters,
      category: meta.category,
      readOnly,
      destructive: meta.destructive,
      confirm: !readOnly,
      execute: readOnly
        ? (args) =>
            viaMain ? runMainTool(tool.name, args) : runRead(tool.name, args)
        : (args) =>
            viaMain
              ? runMainTool(tool.name, args)
              : runWrite(
                  tool.name,
                  meta.title,
                  args,
                  meta.destructive === true
                )
    })
  }

  return tools
}

export function buildMcpTools(): McpToolDefinition[] {
  return [...projectedTools(), ...MCP_EXCLUSIVE_TOOLS]
}

export const MCP_TOOL_CATALOG: McpToolMeta[] = buildMcpTools().map((tool) => ({
  name: tool.name,
  title: tool.title,
  category: tool.category,
  readOnly: tool.readOnly,
  ...(tool.destructive ? { destructive: true } : {}),
  confirm: tool.confirm
}))

export function mcpToolCatalog(): McpToolMeta[] {
  return MCP_TOOL_CATALOG
}

/**
 * 用低层 Server 注册 tools/list 与 tools/call。
 *
 * 不使用 McpServer.registerTool：它要求 zod schema，
 * 而我们要把 AGENT_TOOLS 的 JSON Schema 原样输出给客户端。
 */
export function registerMcpTools(server: McpServer): void {
  registerMcpCommandIpc()

  const tools = buildMcpTools()
  const byName = new Map(tools.map((tool) => [tool.name, tool]))

  // 低层注册不会自动声明 tools capability
  server.server.registerCapabilities({ tools: {} })

  server.server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema as {
        type: 'object'
        properties?: Record<string, object>
        required?: string[]
      },
      annotations: {
        readOnlyHint: tool.readOnly,
        destructiveHint: tool.destructive === true
      }
    }))
  }))

  server.server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = byName.get(request.params.name)
    if (!tool) {
      throw new McpError(
        ErrorCode.MethodNotFound,
        `未知工具：${request.params.name}`
      )
    }

    const parsed = validateJsonSchema(
      tool.inputSchema,
      request.params.arguments
    )
    if (!parsed.ok) return errorResult(parsed.error)

    try {
      return await tool.execute(parsed.value)
    } catch (error) {
      return errorResult(
        error instanceof Error ? error.message : '执行失败'
      )
    }
  })
}
