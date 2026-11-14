import type { AgentToolCall } from '@shared/agent'
import { AgentToolError } from './errors'

import type { AgentToolDefinition } from '@shared/agent-tools'

export const CAPABILITY_TOOLS: AgentToolDefinition[] = [
  {
    id: 'capability.catalog',
    name: 'capability_catalog',
    description:
      '返回当前空间和选中节点可用的能力：节点操作、时间线操作、导演台镜头和拉片信息。不确定下一步能做什么时先调用它。',
    profiles: ['canvas', 'clip', 'stage', 'film'],
    readOnly: true,
    scope: 'project',
    modes: ['read-only', 'current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        space: {
          type: 'string',
          enum: ['canvas', 'clip', 'stage', 'film'],
          description: '只看某个空间；省略时返回当前空间'
        },
        nodeId: {
          type: 'string',
          description: '可选，查询该节点可用的操作'
        }
      },
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'capability.search',
    name: 'capability_search',
    description:
      '按关键词搜索 CineBot 已注册的工具。返回工具名、说明、作用域、只读性和确认级别；不确定工具名时使用。',
    profiles: ['canvas', 'clip', 'stage', 'film'],
    readOnly: true,
    scope: 'project',
    modes: ['read-only', 'current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词，例如 裁剪、时间线、拉片、机位'
        },
        limit: { type: 'number', description: '返回数量，默认 10，最大 30' }
      },
      required: ['query'],
      additionalProperties: false
    },
    replay: 'safe',
    executor: 'main'
  }
]

export function validateCapabilityToolArgs(
  call: AgentToolCall
): void {
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
}
