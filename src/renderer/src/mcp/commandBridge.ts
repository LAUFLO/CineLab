import type { McpWriteCommand } from '@shared/mcp-command'
import type { GenerateRequest } from '@shared/generation'
import { executeAgentTool } from '../agent/canvasBridge'
import { useCanvasStore } from '../stores/canvas'
import { useGenerationStore } from '../stores/generation'
import { useProjectStore } from '../stores/project'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function paramsOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

async function handleCommand(command: McpWriteCommand): Promise<void> {
  const canvas = useCanvasStore.getState()
  const project = useProjectStore.getState()

  try {
    if (command.tool === 'generation_start') {
      const nodeId = String(command.args.nodeId ?? '')
      const modelKey = String(command.args.modelKey ?? '')
      const prompt = String(command.args.prompt ?? '')
      if (!nodeId) throw new Error('缺少 nodeId')
      if (!modelKey) throw new Error('缺少 modelKey')
      if (!canvas.nodes.some((node) => node.id === nodeId)) {
        throw new Error('找不到节点')
      }

      const request: GenerateRequest = {
        nodeId,
        modelKey,
        prompt,
        params: paramsOf(command.args.params)
      }
      await useGenerationStore.getState().run(request)
      window.api.mcp.sendResult({
        id: command.id,
        ok: true,
        result: { nodeId, modelKey }
      })
      return
    }

    if (command.tool === 'node_disconnect') {
      const edgeId = String(command.args.edgeId ?? '')
      if (!edgeId) throw new Error('缺少 edgeId')
      const removed = canvas.removeEdges([edgeId], command.turnId)
      if (removed === 0) throw new Error('找不到这条连线')
      window.api.mcp.sendResult({
        id: command.id,
        ok: true,
        result: { edgeId, removed }
      })
      return
    }

    const result = await executeAgentTool({
      callId: command.id,
      name: command.tool,
      args: command.args,
      turnId: command.turnId,
      permissionMode: 'current',
      scope: {
        projectPath: project.path ?? '',
        canvasId: project.canvasId ?? '',
        selectedNodeIds: canvas.nodes
          .filter((node) => node.selected)
          .map((node) => node.id)
      }
    })

    window.api.mcp.sendResult({
      id: command.id,
      ok: result.ok,
      ...(result.result !== undefined ? { result: result.result } : {}),
      ...(result.error ? { error: result.error } : {})
    })
  } catch (error) {
    window.api.mcp.sendResult({
      id: command.id,
      ok: false,
      error: errorMessage(error)
    })
  }
}

/** 接收主进程转发的 MCP 写命令，落到画布 store */
export function initMcpCommandBridge(): () => void {
  return window.api.mcp.onCommand((command) => {
    void handleCommand(command)
  })
}
