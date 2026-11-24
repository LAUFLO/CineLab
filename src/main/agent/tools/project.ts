import type { AgentToolDefinition } from '@shared/agent-tools'

/**
 * 项目管理工具。
 * 创建/打开会切换当前项目，导出会生成压缩包；三者都需要用户确认。
 */
export const PROJECT_TOOLS: AgentToolDefinition[] = [
  {
    id: 'project.create',
    name: 'project_create',
    description:
      '创建一个新项目并切换过去。parentDir 省略时使用默认项目目录。',
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
          maxLength: 80,
          description: '项目名称'
        },
        parentDir: {
          type: 'string',
          description: '项目父目录绝对路径；省略时使用默认项目目录'
        },
        template: {
          type: 'string',
          enum: ['blank', 'storyboard', 'product', 'character'],
          description: '项目模板，默认 blank'
        }
      },
      required: ['name'],
      additionalProperties: false
    },
    replay: 'unsafe',
    requiresConfirm: true,
    executor: 'renderer',
    mcp: { title: '创建项目', category: '项目' }
  },
  {
    id: 'project.open',
    name: 'project_open',
    description: '打开一个已有项目并切换过去。path 是项目目录绝对路径。',
    profiles: ['canvas'],
    readOnly: false,
    scope: 'project',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          minLength: 1,
          description: '项目目录绝对路径'
        }
      },
      required: ['path'],
      additionalProperties: false
    },
    replay: 'unsafe',
    requiresConfirm: true,
    executor: 'renderer',
    mcp: { title: '打开项目', category: '项目' }
  },
  {
    id: 'project.export',
    name: 'project_export',
    description:
      '把当前项目导出为压缩包，返回文件路径。导出会包含项目画布、素材和封面。',
    profiles: ['canvas'],
    readOnly: false,
    scope: 'project',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false
    },
    replay: 'unsafe',
    requiresConfirm: true,
    executor: 'renderer',
    mcp: { title: '导出项目', category: '项目' }
  }
]
