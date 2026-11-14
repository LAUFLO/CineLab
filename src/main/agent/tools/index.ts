import type {
  AgentPermissionMode,
  AgentProfileId,
  AgentScope,
  AgentToolCall
} from '@shared/agent'
import {
  filterAgentTools,
  toModelTools,
  type AgentToolDefinition
} from '@shared/agent-tools'
import { nodeOperationAgentSpec } from '@shared/node-operation-specs'
import { AgentToolError } from './errors'
import { validateCanvasToolArgs } from './canvas'
import { validateCapabilityToolArgs } from './capability'
import { validateGenerationToolArgs } from './generation'
import { validateStageToolArgs } from './stage'
import { validateTimelineToolArgs } from './timeline'
import { validateFilmToolArgs } from './film'
import { validateSkillToolArgs } from './skills'
import { CANVAS_TOOLS } from './canvas'
import { GENERATION_TOOLS } from './generation'
import { STAGE_TOOLS } from './stage'
import { TIMELINE_TOOLS } from './timeline'
import { FILM_TOOLS } from './film'
import { CAPABILITY_TOOLS } from './capability'
import { SKILL_TOOLS } from './skills'

export { AgentToolError } from './errors'
export { CANVAS_TOOLS } from './canvas'
export { GENERATION_TOOLS } from './generation'
export { STAGE_TOOLS } from './stage'
export { TIMELINE_TOOLS, isTimelineWriteTool } from './timeline'
export { FILM_TOOLS } from './film'
export { CAPABILITY_TOOLS } from './capability'
export { SKILL_TOOLS } from './skills'

export const AGENT_TOOLS = [
  ...CANVAS_TOOLS,
  ...GENERATION_TOOLS,
  ...STAGE_TOOLS,
  ...TIMELINE_TOOLS,
  ...FILM_TOOLS,
  ...CAPABILITY_TOOLS,
  ...SKILL_TOOLS
]

export function toolDefinitionsForModel(
  profile: AgentProfileId,
  mode: AgentPermissionMode
): ReturnType<typeof toModelTools> {
  return toModelTools(filterAgentTools(AGENT_TOOLS, profile, mode))
}

export function getTool(name: string): AgentToolDefinition | undefined {
  return AGENT_TOOLS.find((tool) => tool.name === name)
}

/** 返回需要用户确认的原因；null 表示可以直接执行 */
export function toolConfirmationReason(
  call: AgentToolCall
): string | null {
  const tool = getTool(call.name)
  if (!tool) return null

  const clipIds = Array.isArray(call.args.clipIds)
    ? call.args.clipIds
    : []

  if (call.name === 'timeline_remove_clips') {
    return `将删除 ${clipIds.length} 个时间线片段，成片时长会改变。`
  }
  if (call.name === 'timeline_remove_silence') {
    return clipIds.length > 0
      ? `将检测并删除 ${clipIds.length} 个片段所在轨道的静音，成片时长会缩短。`
      : '将检测并删除时间线中的静音区间，成片时长会缩短。'
  }
  if (call.name === 'timeline_export') {
    return '将渲染并导出成片，时间取决于时间线长度。'
  }
  if (call.name === 'canvas_delete_node') {
    return '将删除画布节点及其所有连线。'
  }
  if (call.name === 'canvas_remove_edge') {
    return '将删除画布连线，下游节点对上游的引用会被清理。'
  }
  if (call.name === 'canvas_update_text') {
    return '将覆盖文本节点的正文内容。'
  }
  if (call.name === 'canvas_node_operation') {
    const operationId = String(call.args.operationId ?? '')
    const spec = nodeOperationAgentSpec(operationId)
    if (spec?.requiresConfirm) {
      return `节点操作「${operationId}」会修改或生成素材，耗时可能较长。`
    }
    return null
  }
  if (call.name === 'stage_remove_object') {
    return '将删除导演台对象及其动作轨。'
  }
  if (call.name === 'stage_remove_shot') {
    return '将删除导演台镜头及其运镜和动作轨。'
  }
  if (call.name === 'stage_set_camera_track') {
    return '将整体替换镜头的机位关键帧轨道。'
  }
  if (call.name === 'stage_export_preview') {
    return '将渲染并导出白模预演视频，耗时取决于镜头长度。'
  }
  if (call.name === 'timeline_split_by_shots') {
    return '将按镜头分析视频并切分片段，片段结构会改变。'
  }
  if (call.name === 'timeline_beat_split') {
    return '将按节拍切分片段，片段结构会改变。'
  }
  if (call.name === 'film_study_auto') {
    return '将执行逐帧拉片并创建或替换分镜输出，耗时较长。'
  }
  if (call.name === 'film_study_extract_subtitles') {
    return '将从源视频提取字幕并覆盖当前拉片字幕，耗时较长。'
  }
  if (
    clipIds.length > 10 &&
    (call.name === 'timeline_move_clips' ||
      call.name === 'timeline_split_clips')
  ) {
    return `将一次修改 ${clipIds.length} 个时间线片段。`
  }
  if (tool.requiresConfirm) {
    return '该操作会删除或覆盖已有内容。'
  }
  return null
}


export function assertToolAllowed(
  call: AgentToolCall,
  scope: AgentScope,
  permissionMode: AgentPermissionMode
): void {
  const tool = getTool(call.name)
  if (!tool) {
    throw new AgentToolError('not_found', `未知工具：${call.name}`)
  }

  if (!tool.modes.includes(permissionMode)) {
    throw new AgentToolError('scope_denied', '当前权限模式不能调用该工具')
  }

  if (!tool.readOnly && permissionMode === 'read-only') {
    throw new AgentToolError('scope_denied', '当前是只读模式，不能修改画布')
  }

  validateCanvasToolArgs(call, scope)
  validateCapabilityToolArgs(call)
  validateGenerationToolArgs(call, scope)
  validateStageToolArgs(call, scope)
  validateTimelineToolArgs(call, scope)
  validateFilmToolArgs(call, scope)
  validateSkillToolArgs(call)
}
