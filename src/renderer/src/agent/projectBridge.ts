import type { AgentToolCallRequest, AgentTurnChange } from '@shared/agent'
import type { ProjectTemplateId } from '@shared/project-templates'
import { useProjectStore } from '../stores/project'

export interface ProjectToolResult {
  ok: boolean
  result?: unknown
  error?: string
  change?: AgentTurnChange
}

const handlers: Record<
  string,
  (call: AgentToolCallRequest) => Promise<ProjectToolResult>
> = {
  project_create: async (call) => {
    const snapshot = await useProjectStore.getState().createByAgent({
      name: String(call.args.name ?? ''),
      ...(typeof call.args.parentDir === 'string'
        ? { parentDir: call.args.parentDir }
        : {}),
      template: (call.args.template as ProjectTemplateId) ?? 'blank'
    })
    return {
      ok: true,
      result: {
        path: snapshot.path,
        name: snapshot.meta.name,
        canvasId: snapshot.canvas.id
      }
    }
  },

  project_open: async (call) => {
    const snapshot = await useProjectStore.getState().openByAgent(
      String(call.args.path ?? '')
    )
    return {
      ok: true,
      result: {
        path: snapshot.path,
        name: snapshot.meta.name,
        canvasId: snapshot.canvas.id
      }
    }
  },

  project_export: async () => {
    const state = useProjectStore.getState()
    if (!state.name || !state.path) {
      return { ok: false, error: '没有打开的项目' }
    }
    const result = await window.api.export.project(state.name)
    if (result.canceled) {
      return { ok: false, error: '导出已取消' }
    }
    return { ok: true, result }
  }
}

export async function executeProjectTool(
  call: AgentToolCallRequest
): Promise<ProjectToolResult> {
  const handler = handlers[call.name]
  if (!handler) {
    return { ok: false, error: `未实现的项目工具：${call.name}` }
  }
  try {
    return await handler(call)
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : '项目操作失败'
    }
  }
}
