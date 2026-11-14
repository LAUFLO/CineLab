import type { AgentScope, AgentToolCall } from '@shared/agent'
import { AgentToolError } from './errors'
import { assertSelectedNode } from './scope'

import type { AgentToolDefinition } from '@shared/agent-tools'
import { STAGE_EASINGS, STAGE_LIMITS, STAGE_OBJECT_TYPES } from '@shared/stage-schema'

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
    id: 'stage.transformCamera',
    name: 'stage_transform_camera',
    description:
      '调整一个已有机位的位置、朝向目标、视场角、画幅或名称，支持只传其中一部分。cameraId 必须来自 stage_get。',
    profiles: ['canvas', 'stage'],
    readOnly: false,
    scope: 'stage',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: stageNodeIdParameter,
        cameraId: { type: 'string', description: '机位 ID，来自 stage_get' },
        name: { type: 'string', description: '机位名称；省略时不修改' },
        position: stageVec3Parameter,
        target: stageVec3Parameter,
        fov: { type: 'number', description: '视场角 10-120；省略时不修改' },
        aspect: { type: 'string', enum: ['16:9', '9:16', '1:1'] }
      },
      required: ['nodeId', 'cameraId'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'stage.addShot',
    name: 'stage_add_shot',
    description:
      '向导演台场景添加一个镜头，绑定已有机位并设置时长和画幅。',
    profiles: ['canvas', 'stage'],
    readOnly: false,
    scope: 'stage',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: stageNodeIdParameter,
        cameraId: { type: 'string', description: '机位 ID，来自 stage_get' },
        name: { type: 'string', description: '镜头名称；省略时自动命名' },
        durationMs: {
          type: 'number',
          description: '镜头时长毫秒，100-600000'
        },
        aspect: { type: 'string', enum: ['16:9', '9:16', '1:1'] }
      },
      required: ['nodeId', 'cameraId', 'durationMs', 'aspect'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'stage.updateShot',
    name: 'stage_update_shot',
    description:
      '修改导演台镜头的名称、机位、时长或画幅，支持只传其中一部分。',
    profiles: ['canvas', 'stage'],
    readOnly: false,
    scope: 'stage',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: stageNodeIdParameter,
        shotId: { type: 'string', description: '镜头 ID，来自 stage_get' },
        name: { type: 'string', description: '镜头名称' },
        cameraId: { type: 'string', description: '新的机位 ID' },
        durationMs: { type: 'number', description: '镜头时长毫秒' },
        aspect: { type: 'string', enum: ['16:9', '9:16', '1:1'] }
      },
      required: ['nodeId', 'shotId'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'stage.removeShot',
    name: 'stage_remove_shot',
    description: '删除导演台的一个镜头及其运镜和动作轨。',
    profiles: ['canvas', 'stage'],
    readOnly: false,
    scope: 'stage',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: stageNodeIdParameter,
        shotId: { type: 'string', description: '镜头 ID' }
      },
      required: ['nodeId', 'shotId'],
      additionalProperties: false
    },
    replay: 'unsafe',
    requiresConfirm: true
  },
  {
    id: 'stage.setCameraTrack',
    name: 'stage_set_camera_track',
    description:
      '整体替换一个镜头的机位关键帧轨道，用于运镜。关键帧时间单位为毫秒。',
    profiles: ['canvas', 'stage'],
    readOnly: false,
    scope: 'stage',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: stageNodeIdParameter,
        shotId: { type: 'string', description: '镜头 ID' },
        keyframes: {
          type: 'array',
          minItems: 1,
          maxItems: 60,
          description: '机位关键帧',
          items: {
            type: 'object',
            properties: {
              timeMs: { type: 'number', description: '相对镜头起点的毫秒' },
              position: stageVec3Parameter,
              target: stageVec3Parameter,
              fov: { type: 'number', description: '视场角 10-120' },
              easing: {
                type: 'string',
                enum: ['linear', 'ease-in', 'ease-out', 'ease-in-out']
              }
            },
            required: ['timeMs', 'position', 'target', 'fov'],
            additionalProperties: false
          }
        }
      },
      required: ['nodeId', 'shotId', 'keyframes'],
      additionalProperties: false
    },
    replay: 'unsafe',
    requiresConfirm: true
  },
  {
    id: 'stage.setBackground',
    name: 'stage_set_background',
    description:
      '设置导演台背景：纯色 color、全景图 panorama 或模型 model。value 为颜色值、项目相对路径或模型标识。',
    profiles: ['canvas', 'stage'],
    readOnly: false,
    scope: 'stage',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: stageNodeIdParameter,
        kind: { type: 'string', enum: ['color', 'panorama', 'model'] },
        value: { type: 'string', description: '背景值，最多 2000 字符' }
      },
      required: ['nodeId', 'kind', 'value'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'stage.updateObject',
    name: 'stage_update_object',
    description:
      '修改导演台对象的姿势、颜色或可见性，支持只传其中一部分。位置/旋转/缩放请用 stage_transform_object。',
    profiles: ['canvas', 'stage'],
    readOnly: false,
    scope: 'stage',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: stageNodeIdParameter,
        objectId: { type: 'string', description: '对象 ID，来自 stage_get' },
        pose: { type: 'string', description: '姿势预设名称' },
        color: { type: 'string', description: '十六进制颜色，例如 #60a5fa' },
        visible: { type: 'boolean', description: '是否可见' }
      },
      required: ['nodeId', 'objectId'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'stage.exportPreview',
    name: 'stage_export_preview',    description:
      '把导演台的一个镜头渲染导出为白模预演视频，并自动在画布上创建一个视频节点。shotId 必须来自 stage_get；导出耗时较长，执行前需要用户确认。',
    profiles: ['canvas', 'stage'],
    readOnly: false,
    scope: 'stage',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: stageNodeIdParameter,
        shotId: { type: 'string', description: '镜头 ID，来自 stage_get 的 shots' },
        resolution: { type: 'string', enum: ['720p', '1080p'] },
        fps: { type: 'number', enum: [24, 30] }
      },
      required: ['nodeId', 'shotId'],
      additionalProperties: false
    },
    replay: 'unsafe',
    requiresConfirm: true
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
    replay: 'unsafe',
    requiresConfirm: true
  }
]

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

export function validateStageToolArgs(
  call: AgentToolCall,
  scope: AgentScope
): void {
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

    if (call.name === 'stage_transform_camera') {
      if (
        typeof call.args.cameraId !== 'string' ||
        !call.args.cameraId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'cameraId 必须是非空字符串')
      }
      if (
        call.args.name === undefined &&
        call.args.position === undefined &&
        call.args.target === undefined &&
        call.args.fov === undefined &&
        call.args.aspect === undefined
      ) {
        throw new AgentToolError(
          'invalid_params',
          '至少需要 name、position、target、fov 或 aspect'
        )
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

    if (call.name === 'stage_add_shot') {
      if (
        typeof call.args.cameraId !== 'string' ||
        !call.args.cameraId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'cameraId 必须是非空字符串')
      }
      if (
        typeof call.args.durationMs !== 'number' ||
        !Number.isFinite(call.args.durationMs) ||
        call.args.durationMs < 100 ||
        call.args.durationMs > 600_000
      ) {
        throw new AgentToolError(
          'invalid_params',
          'durationMs 必须在 100-600000 之间'
        )
      }
      if (!['16:9', '9:16', '1:1'].includes(String(call.args.aspect))) {
        throw new AgentToolError('invalid_params', 'aspect 无效')
      }
      if (
        call.args.name !== undefined &&
        (typeof call.args.name !== 'string' ||
          !call.args.name.trim() ||
          call.args.name.length > STAGE_LIMITS.maxNameLength)
      ) {
        throw new AgentToolError('invalid_params', 'name 无效')
      }
    }

    if (call.name === 'stage_update_shot') {
      if (
        typeof call.args.shotId !== 'string' ||
        !call.args.shotId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'shotId 必须是非空字符串')
      }
      if (
        call.args.name === undefined &&
        call.args.cameraId === undefined &&
        call.args.durationMs === undefined &&
        call.args.aspect === undefined
      ) {
        throw new AgentToolError(
          'invalid_params',
          '至少需要 name、cameraId、durationMs 或 aspect'
        )
      }
      if (
        call.args.name !== undefined &&
        (typeof call.args.name !== 'string' ||
          call.args.name.length > STAGE_LIMITS.maxNameLength)
      ) {
        throw new AgentToolError('invalid_params', 'name 无效')
      }
      if (
        call.args.cameraId !== undefined &&
        (typeof call.args.cameraId !== 'string' ||
          !call.args.cameraId.trim())
      ) {
        throw new AgentToolError('invalid_params', 'cameraId 无效')
      }
      if (
        call.args.durationMs !== undefined &&
        (typeof call.args.durationMs !== 'number' ||
          !Number.isFinite(call.args.durationMs) ||
          call.args.durationMs < 100 ||
          call.args.durationMs > 600_000)
      ) {
        throw new AgentToolError('invalid_params', 'durationMs 无效')
      }
      if (
        call.args.aspect !== undefined &&
        !['16:9', '9:16', '1:1'].includes(String(call.args.aspect))
      ) {
        throw new AgentToolError('invalid_params', 'aspect 无效')
      }
    }

    if (call.name === 'stage_remove_shot') {
      if (
        typeof call.args.shotId !== 'string' ||
        !call.args.shotId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'shotId 必须是非空字符串')
      }
    }

    if (call.name === 'stage_set_camera_track') {
      if (
        typeof call.args.shotId !== 'string' ||
        !call.args.shotId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'shotId 必须是非空字符串')
      }
      const keyframes = call.args.keyframes
      if (
        !Array.isArray(keyframes) ||
        keyframes.length < 1 ||
        keyframes.length > 60
      ) {
        throw new AgentToolError(
          'invalid_params',
          'keyframes 需要 1-60 个关键帧'
        )
      }
      for (const frame of keyframes) {
        if (!frame || typeof frame !== 'object' || Array.isArray(frame)) {
          throw new AgentToolError('invalid_params', '关键帧格式无效')
        }
        const item = frame as Record<string, unknown>
        if (
          typeof item.timeMs !== 'number' ||
          !Number.isFinite(item.timeMs) ||
          item.timeMs < 0 ||
          item.timeMs > 600_000
        ) {
          throw new AgentToolError(
            'invalid_params',
            '关键帧 timeMs 必须在 0-600000 之间'
          )
        }
        assertStageVec3(item.position, 'position')
        assertStageVec3(item.target, 'target')
        if (
          typeof item.fov !== 'number' ||
          !Number.isFinite(item.fov) ||
          item.fov < 10 ||
          item.fov > 120
        ) {
          throw new AgentToolError(
            'invalid_params',
            '关键帧 fov 必须在 10-120 之间'
          )
        }
        if (
          item.easing !== undefined &&
          !STAGE_EASINGS.includes(
            item.easing as (typeof STAGE_EASINGS)[number]
          )
        ) {
          throw new AgentToolError('invalid_params', '关键帧 easing 无效')
        }
      }
    }

    if (call.name === 'stage_set_background') {
      if (!['color', 'panorama', 'model'].includes(String(call.args.kind))) {
        throw new AgentToolError('invalid_params', '背景 kind 无效')
      }
      if (
        typeof call.args.value !== 'string' ||
        !call.args.value.trim() ||
        call.args.value.length > 2000
      ) {
        throw new AgentToolError('invalid_params', '背景 value 无效')
      }
    }

    if (call.name === 'stage_update_object') {
      if (
        typeof call.args.objectId !== 'string' ||
        !call.args.objectId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'objectId 必须是非空字符串')
      }
      if (
        call.args.pose === undefined &&
        call.args.color === undefined &&
        call.args.visible === undefined
      ) {
        throw new AgentToolError(
          'invalid_params',
          '至少需要 pose、color 或 visible'
        )
      }
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
      if (
        call.args.visible !== undefined &&
        typeof call.args.visible !== 'boolean'
      ) {
        throw new AgentToolError('invalid_params', 'visible 必须是布尔值')
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

    if (call.name === 'stage_export_preview') {
      if (
        typeof call.args.shotId !== 'string' ||
        !call.args.shotId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'shotId 必须是非空字符串')
      }
      if (
        call.args.resolution !== undefined &&
        !['720p', '1080p'].includes(String(call.args.resolution))
      ) {
        throw new AgentToolError('invalid_params', 'resolution 无效')
      }
      if (
        call.args.fps !== undefined &&
        call.args.fps !== 24 &&
        call.args.fps !== 30
      ) {
        throw new AgentToolError('invalid_params', 'fps 只能是 24 或 30')
      }
    }
  }
}
