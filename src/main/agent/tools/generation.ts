import type { AgentToolDefinition } from '@shared/agent-tools'

export const GENERATION_TOOLS: AgentToolDefinition[] = [
  {
    id: 'generation.catalog',
    name: 'generation_catalog',
    description:
      '列出当前已配置、可用的生成模型，包括能力、输入和参数。生成前先用它确认 modelKey 和参数。',
    profiles: ['canvas'],
    readOnly: true,
    scope: 'generation',
    modes: ['read-only', 'current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        capability: {
          type: 'string',
          enum: ['image', 'video', 'audio', 'text'],
          description: '只看某一类生成模型；省略时返回全部'
        }
      },
      additionalProperties: false
    },
    replay: 'safe',
    executor: 'main'
  },
  {
    id: 'library.search',
    name: 'library_search',
    description:
      '搜索全局资产库中的图片、视频和音频。返回相对路径、名称和类型；把图片/视频 path 放进 generation_propose 的 libraryRefs，即可在生成时自动创建素材节点并连线。',
    profiles: ['canvas'],
    readOnly: true,
    scope: 'library',
    modes: ['read-only', 'current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '按名称或路径搜索，最多 100 字；省略时返回最近素材'
        },
        kind: {
          type: 'string',
          enum: ['image', 'video', 'audio'],
          description: '只看某一类素材'
        },
        limit: {
          type: 'number',
          description: '返回数量，默认 20，最大 30'
        }
      },
      additionalProperties: false
    },
    replay: 'safe',
    executor: 'main'
  },
  {
    id: 'generation.propose',
    name: 'generation_propose',
    description:
      '登记一个生成提案，不会立即生成或扣费。用户确认提案后才会提交。目标节点必须是选中节点或本轮新建节点。可用 operationId 复用节点工具栏的模型类操作提示词；传 itemId 选择菜单项。也可用 refNodeIds 引用画布节点，或用 libraryRefs 引用资产库素材；引用素材会自动补建素材节点并连接到目标节点，同时把提示词写回目标节点。未指定参考时自动使用直接上游节点的最新输出。',
    profiles: ['canvas'],
    readOnly: false,
    scope: 'generation',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: '目标生成节点 ID，必须来自 canvas_get 的 selectedNodes'
        },
        modelKey: {
          type: 'string',
          description: '模型标识，格式 providerId/modelId，必须来自 generation_catalog'
        },
        prompt: {
          type: 'string',
          description:
            '生成提示词，最多 8000 个字符；传 operationId 时可省略，自动使用该操作的提示词'
        },
        operationId: {
          type: 'string',
          description:
            '节点工具栏模型类操作 ID，例如 grid-generate、character-sheet、relight；必须来自 canvas_node_operations 且 generationProposable=true'
        },
        itemId: {
          type: 'string',
          description: '操作菜单项 ID，例如 multi / front / golden，必须来自该操作的 menu'
        },
        mask: {
          type: 'string',
          description:
            'PNG data URL 蒙版，仅图片编辑操作使用；透明区域表示需要重绘'
        },
        params: {
          type: 'object',
          description: '模型参数覆盖，键必须来自 generation_catalog'
        },
        count: {
          type: 'number',
          description: '生成数量 1-8；仅模型声明了数量参数时生效'
        },
        refNodeIds: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 4,
          description: '画布参考节点 ID，可选；引用附件时直接使用附件 nodeId'
        },
        libraryRefs: {
          type: 'array',
          maxItems: 4,
          description: '资产库参考素材，可选；路径必须来自 library_search',
          items: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: '资产库相对路径，例如 场景/街景.png'
              },
              kind: {
                type: 'string',
                enum: ['image', 'video'],
                description: '素材类型'
              },
              role: {
                type: 'string',
                enum: ['firstFrame', 'lastFrame', 'reference'],
                description: '图片角色，默认 reference'
              }
            },
            required: ['path', 'kind'],
            additionalProperties: false
          }
        },
        negativePrompt: {
          type: 'string',
          description: '负向提示词，可选'
        }
      },
      required: ['nodeId', 'modelKey'],
      additionalProperties: false
    },
    replay: 'safe'
  }
]

const stageNodeIdParameter = {
  type: 'string',
  description: '导演台画布节点 ID，必须来自 canvas_get 的 selectedNodes'
}

