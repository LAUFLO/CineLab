import type { AgentToolDefinition } from '@shared/agent-tools'

/**
 * 技能管理工具。
 * 只操作全局/项目技能，不改内置技能，也不会切换当前项目。
 */
export const SKILL_ADMIN_TOOLS: AgentToolDefinition[] = [
  {
    id: 'skill.toggle',
    name: 'skill_toggle',
    description:
      '启用或禁用一个全局或项目技能。内置技能只能禁用，不能编辑。',
    profiles: ['canvas'],
    readOnly: false,
    scope: 'skill',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          minLength: 1,
          description: '技能名称，来自 skill_list'
        },
        scope: {
          type: 'string',
          enum: ['global', 'project'],
          description: '技能所在范围'
        },
        enabled: {
          type: 'boolean',
          description: 'true 启用，false 禁用'
        }
      },
      required: ['name', 'scope', 'enabled'],
      additionalProperties: false
    },
    replay: 'unsafe',
    requiresConfirm: true,
    executor: 'main',
    mcp: { title: '启用/禁用技能', category: '技能' }
  },
  {
    id: 'skill.create',
    name: 'skill_create',
    description:
      '在全局或项目范围创建一个 SKILL.md 技能。名称必须唯一，正文最多 256KB。',
    profiles: ['canvas'],
    readOnly: false,
    scope: 'skill',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          minLength: 1,
          maxLength: 80,
          description: '技能名称，只能包含字母、数字、下划线和短横线'
        },
        description: {
          type: 'string',
          minLength: 1,
          maxLength: 500,
          description: '技能描述，用于 Agent 判断何时使用'
        },
        scope: {
          type: 'string',
          enum: ['global', 'project'],
          description: '创建到全局还是当前项目'
        },
        version: {
          type: 'string',
          description: '技能版本，默认 1.0.0'
        },
        body: {
          type: 'string',
          minLength: 1,
          maxLength: 262144,
          description: 'SKILL.md 正文（Markdown）'
        }
      },
      required: ['name', 'description', 'scope', 'body'],
      additionalProperties: false
    },
    replay: 'unsafe',
    requiresConfirm: true,
    executor: 'main',
    mcp: { title: '创建技能', category: '技能' }
  },
  {
    id: 'skill.import',
    name: 'skill_import',
    description:
      '从本地文件夹或 ZIP 导入一个技能。需要用户确认；同名技能可用 overwrite 覆盖。',
    profiles: ['canvas'],
    readOnly: false,
    scope: 'skill',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '本地技能文件夹或 ZIP 压缩包的绝对路径'
        },
        kind: {
          type: 'string',
          enum: ['folder', 'zip'],
          description: '来源类型'
        },
        scope: {
          type: 'string',
          enum: ['global', 'project'],
          description: '安装到全局还是当前项目'
        },
        overwrite: {
          type: 'boolean',
          description: '同名技能是否覆盖，默认 false'
        }
      },
      required: ['path', 'kind', 'scope'],
      additionalProperties: false
    },
    replay: 'unsafe',
    requiresConfirm: true,
    executor: 'main',
    mcp: { title: '导入技能', category: '技能' }
  }
]
