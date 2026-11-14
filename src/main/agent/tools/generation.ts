import type { AgentScope, AgentToolCall } from '@shared/agent'
import { AgentToolError } from './errors'
import { nodeOperationAgentSpec } from '@shared/node-operation-specs'
import { assertSelectedNode } from './scope'

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

export function validateGenerationToolArgs(
  call: AgentToolCall,
  scope: AgentScope
): void {
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
}
