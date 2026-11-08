import type { AgentScope, AgentToolCall } from '@shared/agent'
import type { Capability } from '@shared/provider-schema'
import { listProviders } from '../settings/store'
import { listSkills, readSkill } from './skills'

export interface MainToolResult {
  ok: boolean
  result?: unknown
  error?: string
}

function outputKindOf(capability: Capability): string {
  if (capability.startsWith('image.')) return 'image'
  if (capability.startsWith('video.')) return 'video'
  if (capability.startsWith('audio.')) return 'audio'
  return 'text'
}

async function generationCatalog(capability?: string): Promise<MainToolResult> {
  const providers = await listProviders()
  const models: Array<Record<string, unknown>> = []

  for (const provider of providers) {
    if (!provider.hasKey) continue
    for (const model of provider.models) {
      const output = outputKindOf(model.capability)
      if (capability && output !== capability) continue
      models.push({
        modelKey: `${provider.id}/${model.id}`,
        providerId: provider.id,
        providerName: provider.name,
        modelId: model.id,
        name: model.name,
        capability: model.capability,
        output,
        inputs: model.inputs ?? [],
        operations: model.operations ?? [],
        params: model.params.map((param) => ({
          key: param.key,
          label: param.label,
          type: param.type,
          ...(param.defaultValue !== undefined
            ? { defaultValue: param.defaultValue }
            : {}),
          ...(param.options
            ? { options: param.options.map((option) => option.value) }
            : {}),
          ...(param.min !== undefined ? { min: param.min } : {}),
          ...(param.max !== undefined ? { max: param.max } : {}),
          ...(param.allowCustom ? { allowCustom: true } : {})
        }))
      })
    }
  }

  return {
    ok: true,
    result: {
      models,
      ...(models.length === 0
        ? { message: '没有可用的生成模型，请先在设置中配置供应商和 API Key' }
        : {})
    }
  }
}

export async function executeMainTool(
  call: AgentToolCall,
  scope: AgentScope
): Promise<MainToolResult> {
  if (call.name === 'generation_catalog') {
    return generationCatalog(
      typeof call.args.capability === 'string'
        ? call.args.capability
        : undefined
    )
  }

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
