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
import {
  STAGE_EASINGS,
  STAGE_LIMITS,
  STAGE_OBJECT_TYPES
} from '@shared/stage-schema'
import { TIMELINE_TRANSITION_TYPES } from '@shared/timeline-schema'
import {
  nodeOperationAgentSpec,
  validateNodeOperationParams
} from '@shared/node-operation-specs'
import { AgentToolError } from './errors'
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

function assertSelectedNode(scope: AgentScope, nodeId: string): void {
  if (!scope.selectedNodeIds.includes(nodeId)) {
    throw new AgentToolError('scope_denied', '只能修改当前选中的节点')
  }
}

function isStageVec3(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every(
      (item) => typeof item === 'number' && Number.isFinite(item)
    )
  )
}

function assertStageVec3(value: unknown, label: string): void {
  if (value !== undefined && !isStageVec3(value)) {
    throw new AgentToolError(
      'invalid_params',
      `${label} 必须是 3 个有限数字`
    )
  }
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

  if (call.name === 'canvas_update_title') {
    const nodeId = call.args.nodeId
    const title = call.args.title
    if (typeof nodeId !== 'string' || !nodeId.trim()) {
      throw new AgentToolError('invalid_params', 'nodeId 必须是非空字符串')
    }
    if (typeof title !== 'string' || !title.trim()) {
      throw new AgentToolError('invalid_params', 'title 必须是非空字符串')
    }
    if (title.length > 200) {
      throw new AgentToolError('invalid_params', 'title 不能超过 200 个字符')
    }
    assertSelectedNode(scope, nodeId)
  }

  if (call.name === 'canvas_update_text') {
    const nodeId = call.args.nodeId
    const text = call.args.text
    if (typeof nodeId !== 'string' || !nodeId.trim()) {
      throw new AgentToolError('invalid_params', 'nodeId 必须是非空字符串')
    }
    if (typeof text !== 'string') {
      throw new AgentToolError('invalid_params', 'text 必须是字符串')
    }
    if (text.length > 100_000) {
      throw new AgentToolError('invalid_params', 'text 不能超过 100000 个字符')
    }
    assertSelectedNode(scope, nodeId)
  }

  if (call.name === 'canvas_node_operations') {
    const nodeId = call.args.nodeId
    if (typeof nodeId !== 'string' || !nodeId.trim()) {
      throw new AgentToolError('invalid_params', 'nodeId 必须是非空字符串')
    }
    assertSelectedNode(scope, nodeId)
  }

  if (call.name === 'canvas_node_operation') {
    const nodeId = call.args.nodeId
    const operationId = call.args.operationId
    const itemId = call.args.itemId
    const params = call.args.params

    if (typeof nodeId !== 'string' || !nodeId.trim()) {
      throw new AgentToolError('invalid_params', 'nodeId 必须是非空字符串')
    }
    assertSelectedNode(scope, nodeId)

    if (typeof operationId !== 'string' || !operationId.trim()) {
      throw new AgentToolError(
        'invalid_params',
        'operationId 必须是非空字符串'
      )
    }
    const spec = nodeOperationAgentSpec(operationId)
    if (!spec) {
      throw new AgentToolError(
        'invalid_params',
        `未知节点操作：${operationId}`
      )
    }
    if (!spec.executable) {
      throw new AgentToolError(
        'unsupported',
        spec.reason ?? `${operationId} 不能由 Agent 直接执行`
      )
    }
    if (
      itemId !== undefined &&
      (typeof itemId !== 'string' || !itemId.trim())
    ) {
      throw new AgentToolError('invalid_params', 'itemId 必须是非空字符串')
    }
    let paramRecord: Record<string, unknown> = {}
    if (params !== undefined) {
      if (
        !params ||
        typeof params !== 'object' ||
        Array.isArray(params)
      ) {
        throw new AgentToolError('invalid_params', 'params 必须是对象')
      }
      paramRecord = params as Record<string, unknown>
    }
    const paramError = validateNodeOperationParams(
      operationId,
      typeof itemId === 'string' ? itemId : undefined,
      paramRecord
    )
    if (paramError) {
      throw new AgentToolError('invalid_params', paramError)
    }
  }

  if (call.name === 'capability_search') {
    if (
      typeof call.args.query !== 'string' ||
      !call.args.query.trim() ||
      call.args.query.length > 100
    ) {
      throw new AgentToolError(
        'invalid_params',
        'query 必须是非空字符串且不超过 100 字'
      )
    }
    if (call.args.limit !== undefined) {
      const limit = call.args.limit
      if (
        typeof limit !== 'number' ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 30
      ) {
        throw new AgentToolError('invalid_params', 'limit 必须是 1-30 的整数')
      }
    }
  }

  if (call.name === 'capability_catalog') {
    if (
      call.args.space !== undefined &&
      !['canvas', 'clip', 'stage', 'film'].includes(
        String(call.args.space)
      )
    ) {
      throw new AgentToolError('invalid_params', 'space 无效')
    }
    if (
      call.args.nodeId !== undefined &&
      (typeof call.args.nodeId !== 'string' ||
        !call.args.nodeId.trim())
    ) {
      throw new AgentToolError('invalid_params', 'nodeId 必须是非空字符串')
    }
  }

  if (call.name === 'canvas_move_node') {
    const nodeId = call.args.nodeId
    const x = call.args.x
    const y = call.args.y
    if (typeof nodeId !== 'string' || !nodeId.trim()) {
      throw new AgentToolError('invalid_params', 'nodeId 必须是非空字符串')
    }
    if (
      typeof x !== 'number' ||
      !Number.isFinite(x) ||
      typeof y !== 'number' ||
      !Number.isFinite(y)
    ) {
      throw new AgentToolError('invalid_params', 'x 和 y 必须是有限数字')
    }
    assertSelectedNode(scope, nodeId)
  }

  if (call.name === 'canvas_add_node') {
    const kind = call.args.kind
    if (
      typeof kind !== 'string' ||
      !['text', 'image', 'video', 'audio'].includes(kind)
    ) {
      throw new AgentToolError('invalid_params', '节点类型无效')
    }
    const nearNodeId = call.args.nearNodeId
    if (nearNodeId !== undefined) {
      if (typeof nearNodeId !== 'string' || !nearNodeId.trim()) {
        throw new AgentToolError('invalid_params', 'nearNodeId 必须是非空字符串')
      }
    } else {
      const x = call.args.x
      const y = call.args.y
      if (
        typeof x !== 'number' ||
        !Number.isFinite(x) ||
        typeof y !== 'number' ||
        !Number.isFinite(y)
      ) {
        throw new AgentToolError(
          'invalid_params',
          '需要 nearNodeId，或同时提供 x 和 y'
        )
      }
    }
    if (
      call.args.title !== undefined &&
      (typeof call.args.title !== 'string' || call.args.title.length > 200)
    ) {
      throw new AgentToolError('invalid_params', 'title 不能超过 200 个字符')
    }
  }

  if (call.name === 'canvas_connect') {
    const source = call.args.sourceNodeId
    const target = call.args.targetNodeId
    if (typeof source !== 'string' || !source.trim()) {
      throw new AgentToolError('invalid_params', 'sourceNodeId 必须是非空字符串')
    }
    if (typeof target !== 'string' || !target.trim()) {
      throw new AgentToolError('invalid_params', 'targetNodeId 必须是非空字符串')
    }
    if (source === target) {
      throw new AgentToolError('invalid_params', '不能把节点连接到自身')
    }
    assertSelectedNode(scope, source)
    assertSelectedNode(scope, target)
  }

  if (call.name === 'canvas_remove_edge') {
    const edgeId = call.args.edgeId
    const source = call.args.sourceNodeId
    const target = call.args.targetNodeId
    const hasEdgeId = edgeId !== undefined
    const hasEndpoints = source !== undefined || target !== undefined

    if (hasEdgeId) {
      if (typeof edgeId !== 'string' || !edgeId.trim()) {
        throw new AgentToolError('invalid_params', 'edgeId 必须是非空字符串')
      }
    }
    if (hasEndpoints) {
      if (typeof source !== 'string' || !source.trim()) {
        throw new AgentToolError(
          'invalid_params',
          'sourceNodeId 必须是非空字符串'
        )
      }
      if (typeof target !== 'string' || !target.trim()) {
        throw new AgentToolError(
          'invalid_params',
          'targetNodeId 必须是非空字符串'
        )
      }
      if (source === target) {
        throw new AgentToolError('invalid_params', '连线的上下游不能相同')
      }
      assertSelectedNode(scope, source)
      assertSelectedNode(scope, target)
    }
    if (!hasEdgeId && !hasEndpoints) {
      throw new AgentToolError(
        'invalid_params',
        '需要 edgeId，或同时提供 sourceNodeId 和 targetNodeId'
      )
    }
  }

  if (call.name === 'canvas_delete_node') {
    const nodeId = call.args.nodeId
    if (typeof nodeId !== 'string' || !nodeId.trim()) {
      throw new AgentToolError('invalid_params', 'nodeId 必须是非空字符串')
    }
    assertSelectedNode(scope, nodeId)
  }

  if (call.name === 'canvas_group') {
    const nodeIds = call.args.nodeIds
    if (
      !Array.isArray(nodeIds) ||
      nodeIds.length < 2 ||
      nodeIds.length > 20
    ) {
      throw new AgentToolError('invalid_params', 'nodeIds 需要 2-20 个节点')
    }
    const unique = new Set(nodeIds)
    if (unique.size !== nodeIds.length) {
      throw new AgentToolError('invalid_params', 'nodeIds 不能重复')
    }
    for (const id of nodeIds) {
      if (typeof id !== 'string' || !id.trim()) {
        throw new AgentToolError('invalid_params', 'nodeIds 必须是非空字符串')
      }
      assertSelectedNode(scope, id)
    }
  }

  if (call.name === 'canvas_ungroup') {
    const groupId = call.args.groupId
    if (typeof groupId !== 'string' || !groupId.trim()) {
      throw new AgentToolError('invalid_params', 'groupId 必须是非空字符串')
    }
    assertSelectedNode(scope, groupId)
  }

  if (call.name === 'library_search') {
    if (
      call.args.query !== undefined &&
      (typeof call.args.query !== 'string' || call.args.query.length > 100)
    ) {
      throw new AgentToolError('invalid_params', 'query 不能超过 100 个字符')
    }
    if (
      call.args.kind !== undefined &&
      !['image', 'video', 'audio'].includes(String(call.args.kind))
    ) {
      throw new AgentToolError('invalid_params', 'kind 无效')
    }
    if (call.args.limit !== undefined) {
      const limit = call.args.limit
      if (
        typeof limit !== 'number' ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 30
      ) {
        throw new AgentToolError('invalid_params', 'limit 必须是 1-30 的整数')
      }
    }
  }

  if (call.name === 'generation_propose') {
    const nodeId = call.args.nodeId
    const modelKey = call.args.modelKey
    const prompt = call.args.prompt
    const operationId = call.args.operationId
    const itemId = call.args.itemId
    const mask = call.args.mask

    if (typeof nodeId !== 'string' || !nodeId.trim()) {
      throw new AgentToolError('invalid_params', 'nodeId 必须是非空字符串')
    }
    assertSelectedNode(scope, nodeId)

    if (
      typeof modelKey !== 'string' ||
      modelKey.indexOf('/') <= 0 ||
      modelKey.length > 300
    ) {
      throw new AgentToolError('invalid_params', 'modelKey 格式无效')
    }

    if (operationId !== undefined) {
      if (
        typeof operationId !== 'string' ||
        !operationId.trim() ||
        operationId.length > 100
      ) {
        throw new AgentToolError('invalid_params', 'operationId 无效')
      }
      const spec = nodeOperationAgentSpec(operationId)
      if (!spec) {
        throw new AgentToolError(
          'invalid_params',
          `未知节点操作：${operationId}`
        )
      }
      if (!spec.generationProposable) {
        throw new AgentToolError(
          'unsupported',
          `${operationId} 不能通过 generation_propose 执行`
        )
      }
      if (spec.itemRequired && typeof itemId !== 'string') {
        throw new AgentToolError(
          'invalid_params',
          `操作 ${operationId} 需要 itemId`
        )
      }
      if (
        typeof itemId === 'string' &&
        spec.itemOptions &&
        !spec.itemOptions.includes(itemId)
      ) {
        throw new AgentToolError(
          'invalid_params',
          `操作 ${operationId} 不支持 itemId=${itemId}`
        )
      }
    }
    if (
      itemId !== undefined &&
      (typeof itemId !== 'string' || !itemId.trim() || itemId.length > 100)
    ) {
      throw new AgentToolError('invalid_params', 'itemId 无效')
    }

    if (
      prompt !== undefined &&
      (typeof prompt !== 'string' || prompt.length > 8000)
    ) {
      throw new AgentToolError(
        'invalid_params',
        'prompt 不能超过 8000 个字符'
      )
    }
    if (
      (typeof prompt !== 'string' || !prompt.trim()) &&
      typeof operationId !== 'string'
    ) {
      throw new AgentToolError(
        'invalid_params',
        '需要 prompt，或提供 operationId 以复用操作提示词'
      )
    }
    if (mask !== undefined) {
      if (
        typeof mask !== 'string' ||
        !mask.startsWith('data:image/png;base64,') ||
        mask.length > 12_000_000
      ) {
        throw new AgentToolError(
          'invalid_params',
          'mask 必须是 12MB 以内的 PNG data URL'
        )
      }
    }
    if (
      call.args.params !== undefined &&
      (typeof call.args.params !== 'object' ||
        call.args.params === null ||
        Array.isArray(call.args.params))
    ) {
      throw new AgentToolError('invalid_params', 'params 必须是对象')
    }

    if (call.args.count !== undefined) {
      const count = call.args.count
      if (
        typeof count !== 'number' ||
        !Number.isInteger(count) ||
        count < 1 ||
        count > 8
      ) {
        throw new AgentToolError('invalid_params', 'count 必须是 1-8 的整数')
      }
    }

    if (call.args.refNodeIds !== undefined) {
      const ids = call.args.refNodeIds
      if (!Array.isArray(ids) || ids.length > 4) {
        throw new AgentToolError('invalid_params', 'refNodeIds 最多 4 个')
      }
      const unique = new Set(ids)
      if (unique.size !== ids.length) {
        throw new AgentToolError('invalid_params', 'refNodeIds 不能重复')
      }
      for (const id of ids) {
        if (typeof id !== 'string' || !id.trim()) {
          throw new AgentToolError('invalid_params', 'refNodeIds 必须是非空字符串')
        }
      }
    }

    if (call.args.libraryRefs !== undefined) {
      const refs = call.args.libraryRefs
      if (!Array.isArray(refs) || refs.length > 4) {
        throw new AgentToolError('invalid_params', 'libraryRefs 最多 4 个')
      }
      const seen = new Set<string>()
      for (const ref of refs) {
        if (!ref || typeof ref !== 'object' || Array.isArray(ref)) {
          throw new AgentToolError('invalid_params', 'libraryRefs 格式无效')
        }
        const item = ref as Record<string, unknown>
        if (
          typeof item.path !== 'string' ||
          !item.path.trim() ||
          item.path.length > 2000
        ) {
          throw new AgentToolError('invalid_params', 'libraryRefs.path 无效')
        }
        if (
          item.path.includes('..') ||
          item.path.startsWith('/') ||
          item.path.startsWith('\\') ||
          /^[a-zA-Z]:/.test(item.path)
        ) {
          throw new AgentToolError(
            'invalid_params',
            'libraryRefs.path 必须是资产库相对路径'
          )
        }
        if (!['image', 'video'].includes(String(item.kind))) {
          throw new AgentToolError('invalid_params', 'libraryRefs.kind 无效')
        }
        if (
          item.role !== undefined &&
          !['firstFrame', 'lastFrame', 'reference'].includes(String(item.role))
        ) {
          throw new AgentToolError('invalid_params', 'libraryRefs.role 无效')
        }
        const key = `${item.kind}:${item.path}`
        if (seen.has(key)) {
          throw new AgentToolError('invalid_params', 'libraryRefs 不能重复')
        }
        seen.add(key)
      }
    }

    if (
      call.args.negativePrompt !== undefined &&
      (typeof call.args.negativePrompt !== 'string' ||
        call.args.negativePrompt.length > 4000)
    ) {
      throw new AgentToolError(
        'invalid_params',
        'negativePrompt 不能超过 4000 个字符'
      )
    }
  }

  if (call.name === 'generation_catalog') {
    if (
      call.args.capability !== undefined &&
      !['image', 'video', 'audio', 'text'].includes(
        String(call.args.capability)
      )
    ) {
      throw new AgentToolError('invalid_params', 'capability 无效')
    }
  }

  if (call.name === 'stage_capabilities') {
    return
  }

  if (call.name.startsWith('stage_')) {
    const nodeId = call.args.nodeId
    if (typeof nodeId !== 'string' || !nodeId.trim()) {
      throw new AgentToolError('invalid_params', 'nodeId 必须是非空字符串')
    }
    assertSelectedNode(scope, nodeId)

    if (call.name === 'stage_add_object') {
      if (
        typeof call.args.type !== 'string' ||
        !STAGE_OBJECT_TYPES.includes(
          call.args.type as (typeof STAGE_OBJECT_TYPES)[number]
        )
      ) {
        throw new AgentToolError('invalid_params', '对象类型无效')
      }
      if (
        call.args.name !== undefined &&
        (typeof call.args.name !== 'string' ||
          !call.args.name.trim() ||
          call.args.name.length > STAGE_LIMITS.maxNameLength)
      ) {
        throw new AgentToolError('invalid_params', 'name 无效')
      }
      assertStageVec3(call.args.position, 'position')
      assertStageVec3(call.args.rotation, 'rotation')
      assertStageVec3(call.args.scale, 'scale')
      if (
        call.args.pose !== undefined &&
        (typeof call.args.pose !== 'string' ||
          call.args.pose.length > STAGE_LIMITS.maxNameLength)
      ) {
        throw new AgentToolError('invalid_params', 'pose 无效')
      }
      if (
        call.args.color !== undefined &&
        (typeof call.args.color !== 'string' ||
          call.args.color.length > 40)
      ) {
        throw new AgentToolError('invalid_params', 'color 无效')
      }
      if (call.args.count !== undefined) {
        const count = call.args.count
        if (
          typeof count !== 'number' ||
          !Number.isInteger(count) ||
          count < 1 ||
          count > 100
        ) {
          throw new AgentToolError('invalid_params', 'count 必须是 1-100 的整数')
        }
      }
    }

    if (call.name === 'stage_transform_object') {
      if (typeof call.args.objectId !== 'string' || !call.args.objectId.trim()) {
        throw new AgentToolError('invalid_params', 'objectId 必须是非空字符串')
      }
      if (
        call.args.position === undefined &&
        call.args.rotation === undefined &&
        call.args.scale === undefined
      ) {
        throw new AgentToolError('invalid_params', '至少需要 position、rotation 或 scale')
      }
      assertStageVec3(call.args.position, 'position')
      assertStageVec3(call.args.rotation, 'rotation')
      assertStageVec3(call.args.scale, 'scale')
    }

    if (call.name === 'stage_add_camera') {
      if (
        call.args.name !== undefined &&
        (typeof call.args.name !== 'string' ||
          !call.args.name.trim() ||
          call.args.name.length > STAGE_LIMITS.maxNameLength)
      ) {
        throw new AgentToolError('invalid_params', 'name 无效')
      }
      assertStageVec3(call.args.position, 'position')
      assertStageVec3(call.args.target, 'target')
      if (call.args.fov !== undefined) {
        const fov = call.args.fov
        if (
          typeof fov !== 'number' ||
          !Number.isFinite(fov) ||
          fov < 10 ||
          fov > 120
        ) {
          throw new AgentToolError('invalid_params', 'fov 必须在 10-120 之间')
        }
      }
      if (
        call.args.aspect !== undefined &&
        !['16:9', '9:16', '1:1'].includes(String(call.args.aspect))
      ) {
        throw new AgentToolError('invalid_params', 'aspect 无效')
      }
    }

    if (call.name === 'stage_transform_camera') {
      if (
        typeof call.args.cameraId !== 'string' ||
        !call.args.cameraId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'cameraId 必须是非空字符串')
      }
      if (
        call.args.name === undefined &&
        call.args.position === undefined &&
        call.args.target === undefined &&
        call.args.fov === undefined &&
        call.args.aspect === undefined
      ) {
        throw new AgentToolError(
          'invalid_params',
          '至少需要 name、position、target、fov 或 aspect'
        )
      }
      if (
        call.args.name !== undefined &&
        (typeof call.args.name !== 'string' ||
          !call.args.name.trim() ||
          call.args.name.length > STAGE_LIMITS.maxNameLength)
      ) {
        throw new AgentToolError('invalid_params', 'name 无效')
      }
      assertStageVec3(call.args.position, 'position')
      assertStageVec3(call.args.target, 'target')
      if (call.args.fov !== undefined) {
        const fov = call.args.fov
        if (
          typeof fov !== 'number' ||
          !Number.isFinite(fov) ||
          fov < 10 ||
          fov > 120
        ) {
          throw new AgentToolError('invalid_params', 'fov 必须在 10-120 之间')
        }
      }
      if (
        call.args.aspect !== undefined &&
        !['16:9', '9:16', '1:1'].includes(String(call.args.aspect))
      ) {
        throw new AgentToolError('invalid_params', 'aspect 无效')
      }
    }

    if (call.name === 'stage_add_shot') {
      if (
        typeof call.args.cameraId !== 'string' ||
        !call.args.cameraId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'cameraId 必须是非空字符串')
      }
      if (
        typeof call.args.durationMs !== 'number' ||
        !Number.isFinite(call.args.durationMs) ||
        call.args.durationMs < 100 ||
        call.args.durationMs > 600_000
      ) {
        throw new AgentToolError(
          'invalid_params',
          'durationMs 必须在 100-600000 之间'
        )
      }
      if (!['16:9', '9:16', '1:1'].includes(String(call.args.aspect))) {
        throw new AgentToolError('invalid_params', 'aspect 无效')
      }
      if (
        call.args.name !== undefined &&
        (typeof call.args.name !== 'string' ||
          !call.args.name.trim() ||
          call.args.name.length > STAGE_LIMITS.maxNameLength)
      ) {
        throw new AgentToolError('invalid_params', 'name 无效')
      }
    }

    if (call.name === 'stage_update_shot') {
      if (
        typeof call.args.shotId !== 'string' ||
        !call.args.shotId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'shotId 必须是非空字符串')
      }
      if (
        call.args.name === undefined &&
        call.args.cameraId === undefined &&
        call.args.durationMs === undefined &&
        call.args.aspect === undefined
      ) {
        throw new AgentToolError(
          'invalid_params',
          '至少需要 name、cameraId、durationMs 或 aspect'
        )
      }
      if (
        call.args.name !== undefined &&
        (typeof call.args.name !== 'string' ||
          call.args.name.length > STAGE_LIMITS.maxNameLength)
      ) {
        throw new AgentToolError('invalid_params', 'name 无效')
      }
      if (
        call.args.cameraId !== undefined &&
        (typeof call.args.cameraId !== 'string' ||
          !call.args.cameraId.trim())
      ) {
        throw new AgentToolError('invalid_params', 'cameraId 无效')
      }
      if (
        call.args.durationMs !== undefined &&
        (typeof call.args.durationMs !== 'number' ||
          !Number.isFinite(call.args.durationMs) ||
          call.args.durationMs < 100 ||
          call.args.durationMs > 600_000)
      ) {
        throw new AgentToolError('invalid_params', 'durationMs 无效')
      }
      if (
        call.args.aspect !== undefined &&
        !['16:9', '9:16', '1:1'].includes(String(call.args.aspect))
      ) {
        throw new AgentToolError('invalid_params', 'aspect 无效')
      }
    }

    if (call.name === 'stage_remove_shot') {
      if (
        typeof call.args.shotId !== 'string' ||
        !call.args.shotId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'shotId 必须是非空字符串')
      }
    }

    if (call.name === 'stage_set_camera_track') {
      if (
        typeof call.args.shotId !== 'string' ||
        !call.args.shotId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'shotId 必须是非空字符串')
      }
      const keyframes = call.args.keyframes
      if (
        !Array.isArray(keyframes) ||
        keyframes.length < 1 ||
        keyframes.length > 60
      ) {
        throw new AgentToolError(
          'invalid_params',
          'keyframes 需要 1-60 个关键帧'
        )
      }
      for (const frame of keyframes) {
        if (!frame || typeof frame !== 'object' || Array.isArray(frame)) {
          throw new AgentToolError('invalid_params', '关键帧格式无效')
        }
        const item = frame as Record<string, unknown>
        if (
          typeof item.timeMs !== 'number' ||
          !Number.isFinite(item.timeMs) ||
          item.timeMs < 0 ||
          item.timeMs > 600_000
        ) {
          throw new AgentToolError(
            'invalid_params',
            '关键帧 timeMs 必须在 0-600000 之间'
          )
        }
        assertStageVec3(item.position, 'position')
        assertStageVec3(item.target, 'target')
        if (
          typeof item.fov !== 'number' ||
          !Number.isFinite(item.fov) ||
          item.fov < 10 ||
          item.fov > 120
        ) {
          throw new AgentToolError(
            'invalid_params',
            '关键帧 fov 必须在 10-120 之间'
          )
        }
        if (
          item.easing !== undefined &&
          !STAGE_EASINGS.includes(
            item.easing as (typeof STAGE_EASINGS)[number]
          )
        ) {
          throw new AgentToolError('invalid_params', '关键帧 easing 无效')
        }
      }
    }

    if (call.name === 'stage_set_background') {
      if (!['color', 'panorama', 'model'].includes(String(call.args.kind))) {
        throw new AgentToolError('invalid_params', '背景 kind 无效')
      }
      if (
        typeof call.args.value !== 'string' ||
        !call.args.value.trim() ||
        call.args.value.length > 2000
      ) {
        throw new AgentToolError('invalid_params', '背景 value 无效')
      }
    }

    if (call.name === 'stage_update_object') {
      if (
        typeof call.args.objectId !== 'string' ||
        !call.args.objectId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'objectId 必须是非空字符串')
      }
      if (
        call.args.pose === undefined &&
        call.args.color === undefined &&
        call.args.visible === undefined
      ) {
        throw new AgentToolError(
          'invalid_params',
          '至少需要 pose、color 或 visible'
        )
      }
      if (
        call.args.pose !== undefined &&
        (typeof call.args.pose !== 'string' ||
          call.args.pose.length > STAGE_LIMITS.maxNameLength)
      ) {
        throw new AgentToolError('invalid_params', 'pose 无效')
      }
      if (
        call.args.color !== undefined &&
        (typeof call.args.color !== 'string' ||
          call.args.color.length > 40)
      ) {
        throw new AgentToolError('invalid_params', 'color 无效')
      }
      if (
        call.args.visible !== undefined &&
        typeof call.args.visible !== 'boolean'
      ) {
        throw new AgentToolError('invalid_params', 'visible 必须是布尔值')
      }
    }

    if (call.name === 'stage_set_active_camera') {
      if (
        typeof call.args.cameraId !== 'string' ||
        !call.args.cameraId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'cameraId 必须是非空字符串')
      }
    }

    if (call.name === 'stage_remove_object') {
      if (
        typeof call.args.objectId !== 'string' ||
        !call.args.objectId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'objectId 必须是非空字符串')
      }
    }

    if (call.name === 'stage_export_preview') {
      if (
        typeof call.args.shotId !== 'string' ||
        !call.args.shotId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'shotId 必须是非空字符串')
      }
      if (
        call.args.resolution !== undefined &&
        !['720p', '1080p'].includes(String(call.args.resolution))
      ) {
        throw new AgentToolError('invalid_params', 'resolution 无效')
      }
      if (
        call.args.fps !== undefined &&
        call.args.fps !== 24 &&
        call.args.fps !== 30
      ) {
        throw new AgentToolError('invalid_params', 'fps 只能是 24 或 30')
      }
    }
  }

  if (call.name.startsWith('timeline_')) {
    if (!scope.timelineId) {
      throw new AgentToolError('scope_denied', '请先打开剪辑室')
    }

    const assertClipIds = (value: unknown, allowEmpty = false): void => {
      if (!Array.isArray(value)) {
        throw new AgentToolError('invalid_params', 'clipIds 必须是数组')
      }
      if (allowEmpty && value.length === 0) return
      if (
        value.length < 1 ||
        value.length > 100 ||
        value.some(
          (id) => typeof id !== 'string' || !id.trim()
        ) ||
        new Set(value).size !== value.length
      ) {
        throw new AgentToolError('invalid_params', 'clipIds 无效')
      }
    }

    if (call.name === 'timeline_select_clips') {
      assertClipIds(call.args.clipIds, true)
      if (
        Array.isArray(call.args.clipIds) &&
        call.args.clipIds.length > 200
      ) {
        throw new AgentToolError('invalid_params', '一次最多选择 200 个片段')
      }
    }

    if (call.name === 'timeline_set_video') {
      const width = call.args.width
      const height = call.args.height
      const fps = call.args.fps
      const background = call.args.background

      if (
        (width === undefined) !== (height === undefined)
      ) {
        throw new AgentToolError('invalid_params', 'width 和 height 必须同时提供')
      }
      for (const [key, value, max] of [
        ['width', width, 7680],
        ['height', height, 4320]
      ] as const) {
        if (value === undefined) continue
        if (
          typeof value !== 'number' ||
          !Number.isInteger(value) ||
          value < 16 ||
          value > max ||
          value % 2 !== 0
        ) {
          throw new AgentToolError(
            'invalid_params',
            `${key} 必须是 16-${max} 之间的偶数`
          )
        }
      }
      if (fps !== undefined) {
        if (
          typeof fps !== 'number' ||
          !Number.isFinite(fps) ||
          fps < 1 ||
          fps > 120
        ) {
          throw new AgentToolError('invalid_params', 'fps 必须在 1-120 之间')
        }
      }
      if (background !== undefined) {
        if (
          !background ||
          typeof background !== 'object' ||
          Array.isArray(background)
        ) {
          throw new AgentToolError('invalid_params', 'background 必须是对象')
        }
        const item = background as Record<string, unknown>
        if (!['none', 'color', 'image'].includes(String(item.type))) {
          throw new AgentToolError('invalid_params', 'background.type 无效')
        }
        if (
          item.color !== undefined &&
          (typeof item.color !== 'string' || item.color.length > 50)
        ) {
          throw new AgentToolError('invalid_params', 'background.color 无效')
        }
        if (
          item.path !== undefined &&
          (typeof item.path !== 'string' ||
            !item.path.trim() ||
            item.path.length > 2000 ||
            item.path.includes('..') ||
            item.path.startsWith('/') ||
            item.path.startsWith('\\') ||
            /^[a-zA-Z]:/.test(item.path))
        ) {
          throw new AgentToolError(
            'invalid_params',
            'background.path 必须是项目内相对路径'
          )
        }
        if (item.type === 'image' && typeof item.path !== 'string') {
          throw new AgentToolError(
            'invalid_params',
            'background.type=image 时必须提供 path'
          )
        }
        if (item.type === 'color' && typeof item.color !== 'string') {
          throw new AgentToolError(
            'invalid_params',
            'background.type=color 时必须提供 color'
          )
        }
      }
      if (
        width === undefined &&
        fps === undefined &&
        background === undefined
      ) {
        throw new AgentToolError(
          'invalid_params',
          '至少需要 width/height、fps 或 background'
        )
      }
    }

    if (call.name === 'timeline_move_clips') {
      assertClipIds(call.args.clipIds)
      if (
        call.args.deltaMs === undefined &&
        call.args.startMs === undefined
      ) {
        throw new AgentToolError(
          'invalid_params',
          '需要 deltaMs 或 startMs'
        )
      }
      if (
        call.args.deltaMs !== undefined &&
        (typeof call.args.deltaMs !== 'number' ||
          !Number.isFinite(call.args.deltaMs))
      ) {
        throw new AgentToolError('invalid_params', 'deltaMs 必须是有限数字')
      }
      if (
        call.args.startMs !== undefined &&
        (typeof call.args.startMs !== 'number' ||
          !Number.isFinite(call.args.startMs) ||
          call.args.startMs < 0)
      ) {
        throw new AgentToolError('invalid_params', 'startMs 必须是非负数字')
      }
      if (
        call.args.mode !== undefined &&
        !['insert', 'overwrite'].includes(String(call.args.mode))
      ) {
        throw new AgentToolError('invalid_params', 'mode 无效')
      }
    }

    if (call.name === 'timeline_trim_clip') {
      if (
        typeof call.args.clipId !== 'string' ||
        !call.args.clipId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'clipId 必须是非空字符串')
      }
      if (!['start', 'end'].includes(String(call.args.edge))) {
        throw new AgentToolError('invalid_params', 'edge 必须是 start 或 end')
      }
      if (
        typeof call.args.deltaMs !== 'number' ||
        !Number.isFinite(call.args.deltaMs)
      ) {
        throw new AgentToolError('invalid_params', 'deltaMs 必须是有限数字')
      }
      if (
        call.args.ripple !== undefined &&
        typeof call.args.ripple !== 'boolean'
      ) {
        throw new AgentToolError('invalid_params', 'ripple 必须是布尔值')
      }
    }

    if (call.name === 'timeline_split_clips') {
      assertClipIds(call.args.clipIds)
      if (
        typeof call.args.atMs !== 'number' ||
        !Number.isFinite(call.args.atMs) ||
        call.args.atMs < 0
      ) {
        throw new AgentToolError('invalid_params', 'atMs 必须是非负数字')
      }
    }

    if (call.name === 'timeline_remove_clips') {
      assertClipIds(call.args.clipIds)
      if (
        call.args.ripple !== undefined &&
        typeof call.args.ripple !== 'boolean'
      ) {
        throw new AgentToolError('invalid_params', 'ripple 必须是布尔值')
      }
    }

    if (call.name === 'timeline_update_clip') {
      if (
        typeof call.args.clipId !== 'string' ||
        !call.args.clipId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'clipId 必须是非空字符串')
      }
      const patch = call.args.patch
      if (
        typeof patch !== 'object' ||
        patch === null ||
        Array.isArray(patch)
      ) {
        throw new AgentToolError('invalid_params', 'patch 必须是对象')
      }

      const allowed = new Set([
        'name',
        'volume',
        'muted',
        'opacity',
        'fadeInMs',
        'fadeOutMs',
        'speed'
      ])
      const entries = Object.entries(patch)
      if (entries.length === 0) {
        throw new AgentToolError('invalid_params', 'patch 不能为空')
      }
      for (const [key, value] of entries) {
        if (!allowed.has(key)) {
          throw new AgentToolError('invalid_params', `不支持修改 ${key}`)
        }
        if (key === 'name' && (typeof value !== 'string' || value.length > 200)) {
          throw new AgentToolError('invalid_params', 'name 无效')
        }
        if (key === 'muted' && typeof value !== 'boolean') {
          throw new AgentToolError('invalid_params', 'muted 必须是布尔值')
        }
        if (
          (key === 'volume' ||
            key === 'opacity' ||
            key === 'fadeInMs' ||
            key === 'fadeOutMs' ||
            key === 'speed') &&
          (typeof value !== 'number' || !Number.isFinite(value))
        ) {
          throw new AgentToolError('invalid_params', `${key} 必须是数字`)
        }
        if (
          key === 'volume' &&
          typeof value === 'number' &&
          (value < 0 || value > 4)
        ) {
          throw new AgentToolError('invalid_params', 'volume 必须在 0-4 之间')
        }
        if (
          key === 'opacity' &&
          typeof value === 'number' &&
          (value < 0 || value > 1)
        ) {
          throw new AgentToolError('invalid_params', 'opacity 必须在 0-1 之间')
        }
        if (
          (key === 'fadeInMs' || key === 'fadeOutMs') &&
          typeof value === 'number' &&
          value < 0
        ) {
          throw new AgentToolError('invalid_params', `${key} 不能为负`)
        }
        if (
          key === 'speed' &&
          typeof value === 'number' &&
          (value < 0.1 || value > 10)
        ) {
          throw new AgentToolError('invalid_params', 'speed 必须在 0.1-10 之间')
        }
      }
    }

    if (call.name === 'timeline_set_track') {
      if (
        typeof call.args.trackId !== 'string' ||
        !call.args.trackId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'trackId 必须是非空字符串')
      }
      if (
        !['visible', 'muted', 'locked'].includes(String(call.args.flag))
      ) {
        throw new AgentToolError('invalid_params', 'track flag 无效')
      }
      if (typeof call.args.value !== 'boolean') {
        throw new AgentToolError('invalid_params', 'value 必须是布尔值')
      }
    }

    if (call.name === 'timeline_add_marker') {
      if (
        typeof call.args.atMs !== 'number' ||
        !Number.isFinite(call.args.atMs) ||
        call.args.atMs < 0
      ) {
        throw new AgentToolError('invalid_params', 'atMs 必须是非负数字')
      }
      if (
        call.args.label !== undefined &&
        (typeof call.args.label !== 'string' ||
          call.args.label.length > 200)
      ) {
        throw new AgentToolError('invalid_params', 'label 过长')
      }
      if (
        call.args.color !== undefined &&
        (typeof call.args.color !== 'string' ||
          call.args.color.length > 50)
      ) {
        throw new AgentToolError('invalid_params', 'color 无效')
      }
    }

    if (call.name === 'timeline_auto_subtitles') {
      if (
        call.args.clipId !== undefined &&
        (typeof call.args.clipId !== 'string' ||
          !call.args.clipId.trim())
      ) {
        throw new AgentToolError('invalid_params', 'clipId 必须是非空字符串')
      }
    }

    if (call.name === 'timeline_remove_silence') {
      if (call.args.clipIds !== undefined) {
        assertClipIds(call.args.clipIds)
      }
      for (const key of ['paddingMs', 'minDurationMs'] as const) {
        const value = call.args[key]
        if (
          value !== undefined &&
          (typeof value !== 'number' ||
            !Number.isFinite(value) ||
            value < 0 ||
            value > 10_000)
        ) {
          throw new AgentToolError(
            'invalid_params',
            `${key} 必须是 0-10000 的数字`
          )
        }
      }
      if (
        call.args.ripple !== undefined &&
        typeof call.args.ripple !== 'boolean'
      ) {
        throw new AgentToolError('invalid_params', 'ripple 必须是布尔值')
      }
    }

    if (call.name === 'timeline_set_transition') {
      if (
        typeof call.args.clipId !== 'string' ||
        !call.args.clipId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'clipId 必须是非空字符串')
      }
      if (
        ![...TIMELINE_TRANSITION_TYPES, 'none'].includes(
          String(call.args.type)
        )
      ) {
        throw new AgentToolError('invalid_params', '转场类型无效')
      }
      if (
        call.args.durationMs !== undefined &&
        (typeof call.args.durationMs !== 'number' ||
          !Number.isFinite(call.args.durationMs) ||
          call.args.durationMs < 100 ||
          call.args.durationMs > 10_000)
      ) {
        throw new AgentToolError(
          'invalid_params',
          'durationMs 必须在 100-10000 之间'
        )
      }
    }

    if (call.name === 'timeline_split_by_shots') {
      if (
        typeof call.args.clipId !== 'string' ||
        !call.args.clipId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'clipId 必须是非空字符串')
      }
      for (const key of ['minShotMs', 'edgePaddingMs'] as const) {
        const value = call.args[key]
        if (
          value !== undefined &&
          (typeof value !== 'number' ||
            !Number.isFinite(value) ||
            value < 0 ||
            value > 10_000)
        ) {
          throw new AgentToolError(
            'invalid_params',
            `${key} 必须是 0-10000 的数字`
          )
        }
      }
    }

    if (call.name === 'timeline_beat_markers') {
      if (
        typeof call.args.clipId !== 'string' ||
        !call.args.clipId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'clipId 必须是非空字符串')
      }
      if (
        call.args.label !== undefined &&
        (typeof call.args.label !== 'string' ||
          call.args.label.length > 200)
      ) {
        throw new AgentToolError('invalid_params', 'label 过长')
      }
      if (
        call.args.color !== undefined &&
        (typeof call.args.color !== 'string' ||
          call.args.color.length > 50)
      ) {
        throw new AgentToolError('invalid_params', 'color 无效')
      }
    }

    if (call.name === 'timeline_beat_split') {
      if (
        typeof call.args.clipId !== 'string' ||
        !call.args.clipId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'clipId 必须是非空字符串')
      }
      if (
        call.args.trackId !== undefined &&
        (typeof call.args.trackId !== 'string' ||
          !call.args.trackId.trim())
      ) {
        throw new AgentToolError('invalid_params', 'trackId 必须是非空字符串')
      }
      if (
        call.args.minGapMs !== undefined &&
        (typeof call.args.minGapMs !== 'number' ||
          !Number.isFinite(call.args.minGapMs) ||
          call.args.minGapMs < 0 ||
          call.args.minGapMs > 10_000)
      ) {
        throw new AgentToolError(
          'invalid_params',
          'minGapMs 必须是 0-10000 的数字'
        )
      }
    }

    if (call.name === 'timeline_export') {
      if (
        call.args.codec !== undefined &&
        !['h264', 'hevc', 'av1'].includes(String(call.args.codec))
      ) {
        throw new AgentToolError('invalid_params', 'codec 无效')
      }
    }
  }

  if (call.name.startsWith('film_')) {
    const nodeId = call.args.nodeId
    const studyId = call.args.studyId

    if (nodeId !== undefined) {
      if (typeof nodeId !== 'string' || !nodeId.trim()) {
        throw new AgentToolError('invalid_params', 'nodeId 必须是非空字符串')
      }
    }
    if (studyId !== undefined) {
      if (typeof studyId !== 'string' || !studyId.trim()) {
        throw new AgentToolError('invalid_params', 'studyId 必须是非空字符串')
      }
    }

    if (
      call.name === 'film_study_get' ||
      call.name === 'film_study_export' ||
      call.name === 'film_study_update_segment' ||
      call.name === 'film_study_extract_subtitles'
    ) {
      if (!nodeId && !studyId) {
        throw new AgentToolError(
          'invalid_params',
          '需要 nodeId 或 studyId'
        )
      }
    }

    if (call.name === 'film_study_auto') {
      if (typeof nodeId !== 'string' || !nodeId.trim()) {
        throw new AgentToolError('invalid_params', 'nodeId 必须是非空字符串')
      }
      assertSelectedNode(scope, nodeId)
      if (call.args.interval !== undefined) {
        const interval = call.args.interval
        if (
          typeof interval !== 'number' ||
          !Number.isFinite(interval) ||
          interval < 0 ||
          interval > 300
        ) {
          throw new AgentToolError(
            'invalid_params',
            'interval 必须是 0-300 的秒数'
          )
        }
      }
      if (
        call.args.modelKey !== undefined &&
        (typeof call.args.modelKey !== 'string' ||
          call.args.modelKey.length > 300)
      ) {
        throw new AgentToolError('invalid_params', 'modelKey 无效')
      }
      if (call.args.outputs !== undefined) {
        const outputs = call.args.outputs
        if (
          !outputs ||
          typeof outputs !== 'object' ||
          Array.isArray(outputs)
        ) {
          throw new AgentToolError('invalid_params', 'outputs 必须是对象')
        }
        for (const [key, value] of Object.entries(outputs)) {
          if (!['storyboard', 'sheet', 'motion', 'music'].includes(key)) {
            throw new AgentToolError(
              'invalid_params',
              `不支持的拉片输出 ${key}`
            )
          }
          if (typeof value !== 'boolean') {
            throw new AgentToolError(
              'invalid_params',
              `outputs.${key} 必须是布尔值`
            )
          }
        }
      }
    }

    if (call.name === 'film_study_update_segment') {
      const segmentId = call.args.segmentId
      if (typeof segmentId !== 'string' || !segmentId.trim()) {
        throw new AgentToolError('invalid_params', 'segmentId 必须是非空字符串')
      }
      const patch = call.args.patch
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        throw new AgentToolError('invalid_params', 'patch 必须是对象')
      }
      const allowed = new Set([
        'title',
        'type',
        'startTime',
        'endTime',
        'segmentFunction',
        'keyBeats',
        'creativeIntent',
        'techniques',
        'audienceExperience',
        'notes',
        'primaryLine',
        'structureRole',
        'shotSize',
        'cameraAngle',
        'cameraMove',
        'lighting',
        'visualDescription',
        'imagePrompt',
        'voiceOver',
        'musicCue'
      ])
      const entries = Object.entries(patch as Record<string, unknown>)
      if (entries.length === 0) {
        throw new AgentToolError('invalid_params', 'patch 不能为空')
      }
      for (const [key, value] of entries) {
        if (!allowed.has(key)) {
          throw new AgentToolError('invalid_params', `不支持修改 ${key}`)
        }
        if (key === 'startTime' || key === 'endTime') {
          if (
            typeof value !== 'number' ||
            !Number.isFinite(value) ||
            value < 0 ||
            value > 86_400
          ) {
            throw new AgentToolError(
              'invalid_params',
              `${key} 必须是 0-86400 的秒数`
            )
          }
        } else if (
          typeof value !== 'string' ||
          value.length > 8000
        ) {
          throw new AgentToolError(
            'invalid_params',
            `${key} 必须是不超过 8000 字符的字符串`
          )
        }
      }
      const start = (patch as Record<string, unknown>).startTime
      const end = (patch as Record<string, unknown>).endTime
      if (
        typeof start === 'number' &&
        typeof end === 'number' &&
        end <= start
      ) {
        throw new AgentToolError('invalid_params', 'endTime 必须大于 startTime')
      }
    }

    if (call.name === 'film_study_export') {
      if (
        call.args.format !== undefined &&
        !['markdown', 'analysis', 'bundle'].includes(
          String(call.args.format)
        )
      ) {
        throw new AgentToolError('invalid_params', 'format 无效')
      }
    }
  }

  if (call.name === 'skill_read') {
    if (typeof call.args.name !== 'string' || !call.args.name.trim()) {
      throw new AgentToolError('invalid_params', 'name 必须是非空字符串')
    }
    if (
      call.args.path !== undefined &&
      typeof call.args.path !== 'string'
    ) {
      throw new AgentToolError('invalid_params', 'path 必须是字符串')
    }
    for (const key of ['offset', 'limit'] as const) {
      const value = call.args[key]
      if (
        value !== undefined &&
        (typeof value !== 'number' ||
          !Number.isFinite(value) ||
          value < 0)
      ) {
        throw new AgentToolError(
          'invalid_params',
          `${key} 必须是非负有限数字`
        )
      }
    }
  }
}
