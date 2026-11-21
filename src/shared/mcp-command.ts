export interface McpWriteCommand {
  id: string
  tool: string
  args: Record<string, unknown>
  turnId: string
}

export interface McpWriteResult {
  id: string
  ok: boolean
  result?: unknown
  error?: string
}
