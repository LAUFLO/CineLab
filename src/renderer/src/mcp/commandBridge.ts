import type { McpWriteCommand } from '@shared/mcp-command'
import type { GenerateRequest } from '@shared/generation'
import { executeAgentTool } from '../agent/canvasBridge'
import { createStudioAtViewportCenter } from '../studio/nodes'
import { useCanvasStore } from '../stores/canvas'
import { useGenerationStore } from '../stores/generation'
import { useProjectStore } from '../stores/project'
import { useStageStore } from '../stage/stageStore'
import { useStudioStore } from '../stores/studio'
import { useTimelineStore } from '../stores/timeline'

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

    if (command.tool === 'timeline_open') {
      const targetNodeId =
        typeof command.args.nodeId === 'string'
          ? command.args.nodeId.trim()
          : ''

      if (targetNodeId) {
        const node = canvas.nodes.find((item) => item.id === targetNodeId)
        if (!node || node.type !== 'studio') {
          throw new Error('找不到这个剪辑室节点')
        }
        useStudioStore.getState().openStudio(targetNodeId)
        window.api.mcp.sendResult({
          id: command.id,
          ok: true,
          result: { studioNodeId: targetNodeId }
        })
        return
      }

      const x = typeof command.args.x === 'number' ? command.args.x : undefined
      const y = typeof command.args.y === 'number' ? command.args.y : undefined
      const title =
        typeof command.args.title === 'string' ? command.args.title : undefined
      const studioNodeId =
        x !== undefined && y !== undefined
          ? useCanvasStore.getState().addStudioNode({ x, y }, title)
          : createStudioAtViewportCenter()
      useStudioStore.getState().openStudio(studioNodeId)
      window.api.mcp.sendResult({
        id: command.id,
        ok: true,
        result: { studioNodeId }
      })
      return
    }

    if (command.tool === 'stage_open') {
      const targetNodeId =
        typeof command.args.nodeId === 'string'
          ? command.args.nodeId.trim()
          : ''

      if (targetNodeId) {
        const node = canvas.nodes.find((item) => item.id === targetNodeId)
        if (!node || node.type !== 'stage') {
          throw new Error('找不到这个导演台节点')
        }
        await useStageStore.getState().openStage(targetNodeId)
        window.api.mcp.sendResult({
          id: command.id,
          ok: true,
          result: { nodeId: targetNodeId }
        })
        return
      }

      const name =
        typeof command.args.name === 'string' && command.args.name.trim()
          ? command.args.name.trim()
          : `导演台 ${canvas.nodes.filter((node) => node.type === 'stage').length + 1}`
      const x = typeof command.args.x === 'number' ? command.args.x : 120
      const y = typeof command.args.y === 'number' ? command.args.y : 120
      const doc = await window.api.stage.create(name)
      const nodeId = useCanvasStore.getState().addStageNode(doc, { x, y })
      await useStageStore.getState().openStage(nodeId)
      window.api.mcp.sendResult({
        id: command.id,
        ok: true,
        result: { nodeId, stageId: doc.stageId, name }
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
          .map((node) => node.id),
        allowAnyNode: true,
        ...(useTimelineStore.getState().doc?.id
          ? { timelineId: useTimelineStore.getState().doc?.id }
          : {}),
        ...(useStudioStore.getState().nodeId
          ? { studioNodeId: useStudioStore.getState().nodeId ?? undefined }
          : {}),
        ...(useStageStore.getState().nodeId
          ? { stageNodeId: useStageStore.getState().nodeId ?? undefined }
          : {})
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
