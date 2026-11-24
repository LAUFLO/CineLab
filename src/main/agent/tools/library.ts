import type { AgentToolDefinition } from '@shared/agent-tools'

const limitParameter = {
  type: 'integer',
  minimum: 1,
  maximum: 100,
  description: '最多返回多少个，默认 50'
}

const kindParameter = {
  type: 'string',
  enum: ['text', 'image', 'video', 'audio'],
  description: '只返回指定节点类型的模板'
}

const categoryParameter = {
  type: 'string',
  description: '只返回指定分类的风格，例如 电影感 / 动画与手绘 / 国风与东方'
}

/**
 * 提示词模板与风格库的只读工具。
 * 数据来自资产库，主进程直接读取，不依赖渲染进程窗口。
 */
export const LIBRARY_TOOLS: AgentToolDefinition[] = [
  {
    id: 'library.presetList',
    name: 'preset_list',
    description:
      '列出资产库中的提示词模板（预设），可按节点类型过滤。只返回名称、类型和摘要；需要全文时用 preset_read。',
    profiles: ['canvas'],
    readOnly: true,
    scope: 'library',
    modes: ['read-only', 'current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        kind: kindParameter,
        limit: limitParameter
      },
      additionalProperties: false
    },
    replay: 'safe',
    executor: 'main',
    mcp: { title: '列出提示词模板', category: '提示词' }
  },
  {
    id: 'library.presetSearch',
    name: 'preset_search',
    description:
      '按关键词搜索提示词模板，匹配名称和正文。只返回摘要；需要全文时用 preset_read。',
    profiles: ['canvas'],
    readOnly: true,
    scope: 'library',
    modes: ['read-only', 'current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词，匹配名称或正文'
        },
        kind: kindParameter,
        limit: limitParameter
      },
      required: ['query'],
      additionalProperties: false
    },
    replay: 'safe',
    executor: 'main',
    mcp: { title: '搜索提示词模板', category: '提示词' }
  },
  {
    id: 'library.presetRead',
    name: 'preset_read',
    description:
      '读取一个提示词模板的完整正文。id 来自 preset_list 或 preset_search 的返回值。',
    profiles: ['canvas'],
    readOnly: true,
    scope: 'library',
    modes: ['read-only', 'current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '模板 id，例如 提示词/雪夜电影感.prompt.json'
        }
      },
      required: ['id'],
      additionalProperties: false
    },
    replay: 'safe',
    executor: 'main',
    mcp: { title: '读取提示词模板', category: '提示词' }
  },
  {
    id: 'library.styleList',
    name: 'style_list',
    description:
      '列出风格库中的官方与自定义风格，可按分类过滤。返回风格名称、分类、来源和提示词片段。',
    profiles: ['canvas'],
    readOnly: true,
    scope: 'library',
    modes: ['read-only', 'current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        category: categoryParameter,
        limit: limitParameter
      },
      additionalProperties: false
    },
    replay: 'safe',
    executor: 'main',
    mcp: { title: '列出风格', category: '风格' }
  },
  {
    id: 'library.styleSearch',
    name: 'style_search',
    description:
      '按关键词搜索风格，匹配名称、分类和提示词片段。',
    profiles: ['canvas'],
    readOnly: true,
    scope: 'library',
    modes: ['read-only', 'current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词，匹配名称、分类或提示词'
        },
        category: categoryParameter,
        limit: limitParameter
      },
      required: ['query'],
      additionalProperties: false
    },
    replay: 'safe',
    executor: 'main',
    mcp: { title: '搜索风格', category: '风格' }
  },
  {
    id: 'library.styleRead',
    name: 'style_read',
    description:
      '读取一个风格的完整信息，包括提示词片段。id 来自 style_list 或 style_search 的返回值。',
    profiles: ['canvas'],
    readOnly: true,
    scope: 'library',
    modes: ['read-only', 'current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '风格 id，官方为 slug，自定义为 风格/<目录名>'
        }
      },
      required: ['id'],
      additionalProperties: false
    },
    replay: 'safe',
    executor: 'main',
    mcp: { title: '读取风格', category: '风格' }
  }
]
