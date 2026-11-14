import type { AgentToolDefinition } from '@shared/agent-tools'

export const SKILL_TOOLS: AgentToolDefinition[] = [
  {
    id: 'skill.list',
    name: 'skill_list',
    description:
      '列出当前项目可用的技能。返回技能名称、作用域和描述；需要正文时再用 skill_read。',
    profiles: ['canvas'],
    readOnly: true,
    scope: 'skill',
    modes: ['read-only', 'current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false
    },
    replay: 'safe',
    executor: 'main'
  },
  {
    id: 'skill.read',
    name: 'skill_read',
    description:
      '读取技能正文或 references 文件。先用 skill_list 确认技能名称；path 省略时读取 SKILL.md。',
    profiles: ['canvas'],
    readOnly: true,
    scope: 'skill',
    modes: ['read-only', 'current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: '技能名称，必须来自 skill_list'
        },
        path: {
          type: 'string',
          description: '技能内相对路径，默认 SKILL.md；可读 references/ 和 assets/'
        },
        offset: {
          type: 'number',
          description: '正文起始字符位置，默认 0'
        },
        limit: {
          type: 'number',
          description: '本次读取字符数，默认 8000，最大 20000'
        }
      },
      required: ['name'],
      additionalProperties: false
    },
    replay: 'safe',
    executor: 'main'
  }
]

