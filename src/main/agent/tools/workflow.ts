import type { AgentToolDefinition } from '@shared/agent-tools'

export const WORKFLOW_TOOLS: AgentToolDefinition[] = [
  {
    id: 'workflow.list',
    name: 'workflow_list',
    description:
      '列出用户保存的工作流，返回名称、节点数、生成节点数和更新时间。可用 query 按名称过滤。',
    profiles: ['canvas'],
    readOnly: true,
    scope: 'library',
    modes: ['read-only', 'current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '按名称过滤，可选'
        },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 100,
          description: '最多返回多少个，默认 50'
        }
      },
      additionalProperties: false
    },
    replay: 'safe',
    executor: 'main',
    mcp: {
      title: '列出工作流',
      category: '项目',
      expose: true
    }
  },
  {
    id: 'workflow.save',
    name: 'workflow_save',
    description:
      '把当前项目画布保存为工作流。只保存节点结构、提示词、模型和参数，不保存生成结果和项目内素材。',
    profiles: ['canvas'],
    readOnly: false,
    scope: 'project',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          minLength: 1,
          maxLength: 60,
          description: '工作流名称'
        },
        description: {
          type: 'string',
          maxLength: 500,
          description: '工作流描述，可选'
        }
      },
      required: ['name'],
      additionalProperties: false
    },
    replay: 'unsafe',
    requiresConfirm: true,
    executor: 'main',
    mcp: {
      title: '保存工作流',
      category: '项目',
      expose: true
    }
  },
  {
    id: 'workflow.apply',
    name: 'workflow_apply',
    description:
      '把指定工作流追加到当前项目画布，返回新增节点 ID 和提示。工作流中的素材节点会变成待上传占位。',
    profiles: ['canvas'],
    readOnly: false,
    scope: 'project',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          minLength: 1,
          description: '工作流目录名，可从 workflow_list 获取'
        }
      },
      required: ['slug'],
      additionalProperties: false
    },
    replay: 'unsafe',
    requiresConfirm: true,
    executor: 'main',
    mcp: {
      title: '应用工作流',
      category: '项目',
      expose: true
    }
  }
]
