import type { AgentScope, AgentToolCall } from '@shared/agent'
import { listSkills, readSkill } from './skills'

export interface MainToolResult {
  ok: boolean
  result?: unknown
  error?: string
}

export async function executeMainTool(
  call: AgentToolCall,
  scope: AgentScope
): Promise<MainToolResult> {
  if (call.name === 'skill_list') {
    return {
      ok: true,
      result: {
        skills: await listSkills(scope.projectPath)
      }
    }
  }

  if (call.name === 'skill_read') {
    const name = String(call.args.name ?? '').trim()
    const skills = await listSkills(scope.projectPath)
    const skill = skills.find((item) => item.name === name)
    if (skill?.disableModelInvocation) {
      return {
        ok: false,
        error: '该技能只能由用户显式选择后读取'
      }
    }
    const path =
      typeof call.args.path === 'string' ? call.args.path : undefined
    const offset =
      typeof call.args.offset === 'number' ? call.args.offset : undefined
    const limit =
      typeof call.args.limit === 'number' ? call.args.limit : undefined
    return {
      ok: true,
      result: await readSkill({
        root: scope.projectPath,
        name,
        ...(path ? { path } : {}),
        ...(offset !== undefined ? { offset } : {}),
        ...(limit !== undefined ? { limit } : {})
      })
    }
  }

  return {
    ok: false,
    error: `未实现的主进程工具：${call.name}`
  }
}
