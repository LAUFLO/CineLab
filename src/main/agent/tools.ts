import type {
  AgentPermissionMode,
  AgentProfileId,
  AgentScope,
  AgentToolCall
} from '@shared/agent'
import {
  filterAgentTools,
  toModelTools,
  type AgentToolDefinition
} from '@shared/agent-tools'
import {
  STAGE_LIMITS,
  STAGE_OBJECT_TYPES
} from '@shared/stage-schema'

export class AgentToolError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'AgentToolError'
    this.code = code
  }
}

/**
 * 画布工具的注册表。工具执行仍在渲染进程，
 * 主进程只负责定义、过滤、参数校验和权限校验。
 */
export const CANVAS_TOOLS: AgentToolDefinition[] = [
  {
    id: 'canvas.get',
    name: 'canvas_get',
    description:
      '读取当前画布的节点摘要和当前选中节点。修改节点前先调用它确认节点 ID。',
    profiles: ['canvas'],
    readOnly: true,
    scope: 'canvas',
    modes: ['read-only', 'current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'canvas.updateTitle',
    name: 'canvas_update_title',
    description:
      '修改当前画布中一个选中节点的标题。nodeId 必须来自 canvas_get 返回的 selectedNodes；只允许修改选中节点。',
    profiles: ['canvas'],
    readOnly: false,
    scope: 'canvas',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: '要修改的节点 ID，必须来自 canvas_get 的 selectedNodes'
        },
        title: {
          type: 'string',
          description: '新标题，1-200 个字符'
        }
      },
      required: ['nodeId', 'title'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'canvas.moveNode',
    name: 'canvas_move_node',
    description:
      '移动当前画布中一个选中节点到指定画布坐标。只允许移动选中节点。',
    profiles: ['canvas'],
    readOnly: false,
    scope: 'canvas',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description: '要移动的节点 ID，必须来自 canvas_get 的 selectedNodes'
        },
        x: { type: 'number', description: '画布 X 坐标' },
        y: { type: 'number', description: '画布 Y 坐标' }
      },
      required: ['nodeId', 'x', 'y'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'canvas.addNode',
    name: 'canvas_add_node',
    description:
      '在当前画布创建文本、图片、视频或音频节点。创建后返回 nodeId，可在同一轮继续连接或修改。',
    profiles: ['canvas'],
    readOnly: false,
    scope: 'canvas',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['text', 'image', 'video', 'audio'],
          description: '节点类型'
        },
        title: {
          type: 'string',
          description: '节点标题，1-200 个字符；省略时自动命名'
        },
        x: { type: 'number', description: '画布 X 坐标' },
        y: { type: 'number', description: '画布 Y 坐标' }
      },
      required: ['kind', 'x', 'y'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'canvas.connect',
    name: 'canvas_connect',
    description:
      '把两个选中或本轮新建的节点连接起来。sourceNodeId 是上游，targetNodeId 是下游。',
    profiles: ['canvas'],
    readOnly: false,
    scope: 'canvas',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        sourceNodeId: { type: 'string', description: '上游节点 ID' },
        targetNodeId: { type: 'string', description: '下游节点 ID' }
      },
      required: ['sourceNodeId', 'targetNodeId'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'canvas.deleteNode',
    name: 'canvas_delete_node',
    description:
      '删除一个选中或本轮新建的节点，以及它的所有连线。',
    profiles: ['canvas'],
    readOnly: false,
    scope: 'canvas',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: '要删除的节点 ID' }
      },
      required: ['nodeId'],
      additionalProperties: false
    },
    replay: 'unsafe'
  },
  {
    id: 'canvas.group',
    name: 'canvas_group',
    description:
      '把两个或更多选中或本轮新建的顶层节点分到同一个组里。',
    profiles: ['canvas'],
    readOnly: false,
    scope: 'canvas',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeIds: {
          type: 'array',
          items: { type: 'string' },
          minItems: 2,
          maxItems: 20,
          description: '要分组的节点 ID'
        }
      },
      required: ['nodeIds'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'canvas.ungroup',
    name: 'canvas_ungroup',
    description: '解散一个分组，子节点恢复为顶层节点。',
    profiles: ['canvas'],
    readOnly: false,
    scope: 'canvas',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        groupId: { type: 'string', description: '要解散的分组节点 ID' }
      },
      required: ['groupId'],
      additionalProperties: false
    },
    replay: 'safe'
  }
]

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
    id: 'generation.propose',
    name: 'generation_propose',
    description:
      '登记一个生成提案，不会立即生成或扣费。用户确认提案后才会提交。目标节点必须是选中节点或本轮新建节点；未指定参考节点时自动使用直接上游节点的最新输出。',
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
          description: '生成提示词，最多 8000 个字符'
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
          description: '参考节点 ID，可选；省略时使用直接上游节点的最新输出'
        },
        negativePrompt: {
          type: 'string',
          description: '负向提示词，可选'
        }
      },
      required: ['nodeId', 'modelKey', 'prompt'],
      additionalProperties: false
    },
    replay: 'safe'
  }
]

const stageNodeIdParameter = {
  type: 'string',
  description: '导演台画布节点 ID，必须来自 canvas_get 的 selectedNodes'
}

const stageVec3Parameter = {
  type: 'array',
  items: { type: 'number' },
  minItems: 3,
  maxItems: 3,
  description: '3 个有限数字：[x, y, z]'
}

export const STAGE_TOOLS: AgentToolDefinition[] = [
  {
    id: 'stage.get',
    name: 'stage_get',
    description:
      '读取导演台场景的对象、机位、镜头和当前激活机位。所有 stage 工具都需要先确认 nodeId。',
    profiles: ['canvas', 'stage'],
    readOnly: true,
    scope: 'stage',
    modes: ['read-only', 'current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: stageNodeIdParameter
      },
      required: ['nodeId'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'stage.capabilities',
    name: 'stage_capabilities',
    description:
      '返回导演台支持的对象类型、姿势预设、关键帧缓动、数量限制和预览参数。',
    profiles: ['canvas', 'stage'],
    readOnly: true,
    scope: 'stage',
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
    id: 'stage.addObject',
    name: 'stage_add_object',
    description:
      '向导演台场景添加人物、立方体、球体、平面或群众。坐标单位为米，y 轴向上；不传坐标时放在原点。',
    profiles: ['canvas', 'stage'],
    readOnly: false,
    scope: 'stage',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: stageNodeIdParameter,
        type: { type: 'string', enum: STAGE_OBJECT_TYPES },
        name: { type: 'string', description: '对象名称；省略时自动命名' },
        position: stageVec3Parameter,
        rotation: stageVec3Parameter,
        scale: stageVec3Parameter,
        pose: { type: 'string', description: '姿势预设名称，可选' },
        color: { type: 'string', description: '十六进制颜色，例如 #60a5fa' },
        count: {
          type: 'number',
          description: '群众数量 1-100；仅 type=crowd 时使用'
        }
      },
      required: ['nodeId', 'type'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'stage.transformObject',
    name: 'stage_transform_object',
    description:
      '修改导演台对象的位置、旋转或缩放，支持只传其中一部分。旋转使用弧度。',
    profiles: ['canvas', 'stage'],
    readOnly: false,
    scope: 'stage',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: stageNodeIdParameter,
        objectId: { type: 'string', description: '对象 ID，来自 stage_get' },
        position: stageVec3Parameter,
        rotation: stageVec3Parameter,
        scale: stageVec3Parameter
      },
      required: ['nodeId', 'objectId'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'stage.addCamera',
    name: 'stage_add_camera',
    description:
      '向导演台场景添加机位。坐标单位为米；不传时使用默认正面机位。',
    profiles: ['canvas', 'stage'],
    readOnly: false,
    scope: 'stage',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: stageNodeIdParameter,
        name: { type: 'string', description: '机位名称；省略时自动命名' },
        position: stageVec3Parameter,
        target: stageVec3Parameter,
        fov: { type: 'number', description: '视场角 10-120，默认 50' },
        aspect: { type: 'string', enum: ['16:9', '9:16', '1:1'] }
      },
      required: ['nodeId'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'stage.setActiveCamera',
    name: 'stage_set_active_camera',
    description: '切换导演台当前机位。cameraId 必须来自 stage_get。',
    profiles: ['canvas', 'stage'],
    readOnly: false,
    scope: 'stage',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: stageNodeIdParameter,
        cameraId: { type: 'string', description: '机位 ID' }
      },
      required: ['nodeId', 'cameraId'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'stage.removeObject',
    name: 'stage_remove_object',
    description: '删除导演台场景中的一个对象及其动作轨。',
    profiles: ['canvas', 'stage'],
    readOnly: false,
    scope: 'stage',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: stageNodeIdParameter,
        objectId: { type: 'string', description: '对象 ID' }
      },
      required: ['nodeId', 'objectId'],
      additionalProperties: false
    },
    replay: 'unsafe'
  }
]

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

export const AGENT_TOOLS = [
  ...CANVAS_TOOLS,
  ...GENERATION_TOOLS,
  ...STAGE_TOOLS,
  ...SKILL_TOOLS
]

export function toolDefinitionsForModel(
  profile: AgentProfileId,
  mode: AgentPermissionMode
): ReturnType<typeof toModelTools> {
  return toModelTools(filterAgentTools(AGENT_TOOLS, profile, mode))
}

export function getTool(name: string): AgentToolDefinition | undefined {
  return AGENT_TOOLS.find((tool) => tool.name === name)
}

function assertSelectedNode(scope: AgentScope, nodeId: string): void {
  if (!scope.selectedNodeIds.includes(nodeId)) {
    throw new AgentToolError('scope_denied', '只能修改当前选中的节点')
  }
}

function isStageVec3(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every(
      (item) => typeof item === 'number' && Number.isFinite(item)
    )
  )
}

function assertStageVec3(value: unknown, label: string): void {
  if (value !== undefined && !isStageVec3(value)) {
    throw new AgentToolError(
      'invalid_params',
      `${label} 必须是 3 个有限数字`
    )
  }
}

export function assertToolAllowed(
  call: AgentToolCall,
  scope: AgentScope,
  permissionMode: AgentPermissionMode
): void {
  const tool = getTool(call.name)
  if (!tool) {
    throw new AgentToolError('not_found', `未知工具：${call.name}`)
  }

  if (!tool.modes.includes(permissionMode)) {
    throw new AgentToolError('scope_denied', '当前权限模式不能调用该工具')
  }

  if (!tool.readOnly && permissionMode === 'read-only') {
    throw new AgentToolError('scope_denied', '当前是只读模式，不能修改画布')
  }

  if (call.name === 'canvas_update_title') {
    const nodeId = call.args.nodeId
    const title = call.args.title
    if (typeof nodeId !== 'string' || !nodeId.trim()) {
      throw new AgentToolError('invalid_params', 'nodeId 必须是非空字符串')
    }
    if (typeof title !== 'string' || !title.trim()) {
      throw new AgentToolError('invalid_params', 'title 必须是非空字符串')
    }
    if (title.length > 200) {
      throw new AgentToolError('invalid_params', 'title 不能超过 200 个字符')
    }
    assertSelectedNode(scope, nodeId)
  }

  if (call.name === 'canvas_move_node') {
    const nodeId = call.args.nodeId
    const x = call.args.x
    const y = call.args.y
    if (typeof nodeId !== 'string' || !nodeId.trim()) {
      throw new AgentToolError('invalid_params', 'nodeId 必须是非空字符串')
    }
    if (
      typeof x !== 'number' ||
      !Number.isFinite(x) ||
      typeof y !== 'number' ||
      !Number.isFinite(y)
    ) {
      throw new AgentToolError('invalid_params', 'x 和 y 必须是有限数字')
    }
    assertSelectedNode(scope, nodeId)
  }

  if (call.name === 'canvas_add_node') {
    const kind = call.args.kind
    if (
      typeof kind !== 'string' ||
      !['text', 'image', 'video', 'audio'].includes(kind)
    ) {
      throw new AgentToolError('invalid_params', '节点类型无效')
    }
    const x = call.args.x
    const y = call.args.y
    if (
      typeof x !== 'number' ||
      !Number.isFinite(x) ||
      typeof y !== 'number' ||
      !Number.isFinite(y)
    ) {
      throw new AgentToolError('invalid_params', 'x 和 y 必须是有限数字')
    }
    if (
      call.args.title !== undefined &&
      (typeof call.args.title !== 'string' || call.args.title.length > 200)
    ) {
      throw new AgentToolError('invalid_params', 'title 不能超过 200 个字符')
    }
  }

  if (call.name === 'canvas_connect') {
    const source = call.args.sourceNodeId
    const target = call.args.targetNodeId
    if (typeof source !== 'string' || !source.trim()) {
      throw new AgentToolError('invalid_params', 'sourceNodeId 必须是非空字符串')
    }
    if (typeof target !== 'string' || !target.trim()) {
      throw new AgentToolError('invalid_params', 'targetNodeId 必须是非空字符串')
    }
    if (source === target) {
      throw new AgentToolError('invalid_params', '不能把节点连接到自身')
    }
    assertSelectedNode(scope, source)
    assertSelectedNode(scope, target)
  }

  if (call.name === 'canvas_delete_node') {
    const nodeId = call.args.nodeId
    if (typeof nodeId !== 'string' || !nodeId.trim()) {
      throw new AgentToolError('invalid_params', 'nodeId 必须是非空字符串')
    }
    assertSelectedNode(scope, nodeId)
  }

  if (call.name === 'canvas_group') {
    const nodeIds = call.args.nodeIds
    if (
      !Array.isArray(nodeIds) ||
      nodeIds.length < 2 ||
      nodeIds.length > 20
    ) {
      throw new AgentToolError('invalid_params', 'nodeIds 需要 2-20 个节点')
    }
    const unique = new Set(nodeIds)
    if (unique.size !== nodeIds.length) {
      throw new AgentToolError('invalid_params', 'nodeIds 不能重复')
    }
    for (const id of nodeIds) {
      if (typeof id !== 'string' || !id.trim()) {
        throw new AgentToolError('invalid_params', 'nodeIds 必须是非空字符串')
      }
      assertSelectedNode(scope, id)
    }
  }

  if (call.name === 'canvas_ungroup') {
    const groupId = call.args.groupId
    if (typeof groupId !== 'string' || !groupId.trim()) {
      throw new AgentToolError('invalid_params', 'groupId 必须是非空字符串')
    }
    assertSelectedNode(scope, groupId)
  }

  if (call.name === 'generation_propose') {
    const nodeId = call.args.nodeId
    const modelKey = call.args.modelKey
    const prompt = call.args.prompt

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
    if (
      typeof prompt !== 'string' ||
      !prompt.trim() ||
      prompt.length > 8000
    ) {
      throw new AgentToolError(
        'invalid_params',
        'prompt 不能为空且不能超过 8000 个字符'
      )
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
        assertSelectedNode(scope, id)
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

  if (call.name === 'stage_capabilities') {
    return
  }

  if (call.name.startsWith('stage_')) {
    const nodeId = call.args.nodeId
    if (typeof nodeId !== 'string' || !nodeId.trim()) {
      throw new AgentToolError('invalid_params', 'nodeId 必须是非空字符串')
    }
    assertSelectedNode(scope, nodeId)

    if (call.name === 'stage_add_object') {
      if (
        typeof call.args.type !== 'string' ||
        !STAGE_OBJECT_TYPES.includes(
          call.args.type as (typeof STAGE_OBJECT_TYPES)[number]
        )
      ) {
        throw new AgentToolError('invalid_params', '对象类型无效')
      }
      if (
        call.args.name !== undefined &&
        (typeof call.args.name !== 'string' ||
          !call.args.name.trim() ||
          call.args.name.length > STAGE_LIMITS.maxNameLength)
      ) {
        throw new AgentToolError('invalid_params', 'name 无效')
      }
      assertStageVec3(call.args.position, 'position')
      assertStageVec3(call.args.rotation, 'rotation')
      assertStageVec3(call.args.scale, 'scale')
      if (
        call.args.pose !== undefined &&
        (typeof call.args.pose !== 'string' ||
          call.args.pose.length > STAGE_LIMITS.maxNameLength)
      ) {
        throw new AgentToolError('invalid_params', 'pose 无效')
      }
      if (
        call.args.color !== undefined &&
        (typeof call.args.color !== 'string' ||
          call.args.color.length > 40)
      ) {
        throw new AgentToolError('invalid_params', 'color 无效')
      }
      if (call.args.count !== undefined) {
        const count = call.args.count
        if (
          typeof count !== 'number' ||
          !Number.isInteger(count) ||
          count < 1 ||
          count > 100
        ) {
          throw new AgentToolError('invalid_params', 'count 必须是 1-100 的整数')
        }
      }
    }

    if (call.name === 'stage_transform_object') {
      if (typeof call.args.objectId !== 'string' || !call.args.objectId.trim()) {
        throw new AgentToolError('invalid_params', 'objectId 必须是非空字符串')
      }
      if (
        call.args.position === undefined &&
        call.args.rotation === undefined &&
        call.args.scale === undefined
      ) {
        throw new AgentToolError('invalid_params', '至少需要 position、rotation 或 scale')
      }
      assertStageVec3(call.args.position, 'position')
      assertStageVec3(call.args.rotation, 'rotation')
      assertStageVec3(call.args.scale, 'scale')
    }

    if (call.name === 'stage_add_camera') {
      if (
        call.args.name !== undefined &&
        (typeof call.args.name !== 'string' ||
          !call.args.name.trim() ||
          call.args.name.length > STAGE_LIMITS.maxNameLength)
      ) {
        throw new AgentToolError('invalid_params', 'name 无效')
      }
      assertStageVec3(call.args.position, 'position')
      assertStageVec3(call.args.target, 'target')
      if (call.args.fov !== undefined) {
        const fov = call.args.fov
        if (
          typeof fov !== 'number' ||
          !Number.isFinite(fov) ||
          fov < 10 ||
          fov > 120
        ) {
          throw new AgentToolError('invalid_params', 'fov 必须在 10-120 之间')
        }
      }
      if (
        call.args.aspect !== undefined &&
        !['16:9', '9:16', '1:1'].includes(String(call.args.aspect))
      ) {
        throw new AgentToolError('invalid_params', 'aspect 无效')
      }
    }

    if (call.name === 'stage_set_active_camera') {
      if (
        typeof call.args.cameraId !== 'string' ||
        !call.args.cameraId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'cameraId 必须是非空字符串')
      }
    }

    if (call.name === 'stage_remove_object') {
      if (
        typeof call.args.objectId !== 'string' ||
        !call.args.objectId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'objectId 必须是非空字符串')
      }
    }
  }

  if (call.name === 'skill_read') {
    if (typeof call.args.name !== 'string' || !call.args.name.trim()) {
      throw new AgentToolError('invalid_params', 'name 必须是非空字符串')
    }
    if (
      call.args.path !== undefined &&
      typeof call.args.path !== 'string'
    ) {
      throw new AgentToolError('invalid_params', 'path 必须是字符串')
    }
    for (const key of ['offset', 'limit'] as const) {
      const value = call.args[key]
      if (
        value !== undefined &&
        (typeof value !== 'number' ||
          !Number.isFinite(value) ||
          value < 0)
      ) {
        throw new AgentToolError(
          'invalid_params',
          `${key} 必须是非负有限数字`
        )
      }
    }
  }
}
