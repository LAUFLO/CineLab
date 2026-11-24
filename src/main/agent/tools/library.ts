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
  },
  {
    id: 'library.presetCreate',
    name: 'preset_create',
    description:
      '创建一个提示词模板（预设）。名称会作为文件名，重复名称会覆盖同名模板。',
    profiles: ['canvas'],
    readOnly: false,
    scope: 'library',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 80, description: '模板名称' },
        kind: {
          type: 'string',
          enum: ['text', 'image', 'video', 'audio'],
          description: '适用的节点类型'
        },
        prompt: {
          type: 'string',
          minLength: 1,
          maxLength: 8000,
          description: '模板正文'
        }
      },
      required: ['name', 'kind', 'prompt'],
      additionalProperties: false
    },
    replay: 'unsafe',
    requiresConfirm: true,
    executor: 'main',
    mcp: { title: '创建提示词模板', category: '提示词' }
  },
  {
    id: 'library.presetUpdate',
    name: 'preset_update',
    description:
      '修改一个提示词模板。只传需要修改的字段，其余保持原值。id 来自 preset_list。',
    profiles: ['canvas'],
    readOnly: false,
    scope: 'library',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '模板 id，例如 提示词/雪夜电影感.prompt.json'
        },
        name: { type: 'string', minLength: 1, maxLength: 80 },
        kind: {
          type: 'string',
          enum: ['text', 'image', 'video', 'audio']
        },
        prompt: { type: 'string', minLength: 1, maxLength: 8000 }
      },
      required: ['id'],
      additionalProperties: false
    },
    replay: 'unsafe',
    requiresConfirm: true,
    executor: 'main',
    mcp: { title: '修改提示词模板', category: '提示词' }
  },
  {
    id: 'library.presetDelete',
    name: 'preset_delete',
    description: '删除一个提示词模板。执行前需要用户确认。',
    profiles: ['canvas'],
    readOnly: false,
    scope: 'library',
    modes: ['current', 'full-access'],
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
    replay: 'unsafe',
    requiresConfirm: true,
    executor: 'main',
    mcp: {
      title: '删除提示词模板',
      category: '提示词',
      destructive: true
    }
  },
  {
    id: 'library.styleCreate',
    name: 'style_create',
    description:
      '创建一个自定义风格。名称和提示词片段会写入资产库「风格」目录。',
    profiles: ['canvas'],
    readOnly: false,
    scope: 'library',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 80, description: '风格名称' },
        category: {
          type: 'string',
          enum: [
            '电影感',
            '动画与手绘',
            '复古媒介',
            '科幻与未来',
            '奇幻与超现实',
            '国风与东方'
          ],
          description: '风格分类'
        },
        prompt: {
          type: 'string',
          minLength: 1,
          maxLength: 8000,
          description: '风格提示词片段，只描述画风，不包含具体主体'
        }
      },
      required: ['name', 'category', 'prompt'],
      additionalProperties: false
    },
    replay: 'unsafe',
    requiresConfirm: true,
    executor: 'main',
    mcp: { title: '创建风格', category: '风格' }
  },
  {
    id: 'library.styleUpdate',
    name: 'style_update',
    description:
      '修改一个自定义风格。只传需要修改的字段，其余保持原值。官方风格不能修改。',
    profiles: ['canvas'],
    readOnly: false,
    scope: 'library',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '风格 id，自定义风格形如 风格/<目录名>'
        },
        name: { type: 'string', minLength: 1, maxLength: 80 },
        category: {
          type: 'string',
          enum: [
            '电影感',
            '动画与手绘',
            '复古媒介',
            '科幻与未来',
            '奇幻与超现实',
            '国风与东方'
          ]
        },
        prompt: { type: 'string', minLength: 1, maxLength: 8000 }
      },
      required: ['id'],
      additionalProperties: false
    },
    replay: 'unsafe',
    requiresConfirm: true,
    executor: 'main',
    mcp: { title: '修改风格', category: '风格' }
  },
  {
    id: 'library.styleDelete',
    name: 'style_delete',
    description: '删除一个自定义风格。官方风格不能删除，执行前需要用户确认。',
    profiles: ['canvas'],
    readOnly: false,
    scope: 'library',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '风格 id，自定义风格形如 风格/<目录名>'
        }
      },
      required: ['id'],
      additionalProperties: false
    },
    replay: 'unsafe',
    requiresConfirm: true,
    executor: 'main',
    mcp: {
      title: '删除风格',
      category: '风格',
      destructive: true
    }
  }
]
