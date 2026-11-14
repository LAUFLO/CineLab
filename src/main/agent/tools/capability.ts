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

