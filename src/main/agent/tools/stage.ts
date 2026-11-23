import type { AgentScope, AgentToolCall } from '@shared/agent'
import { AgentToolError } from './errors'
import { assertSelectedNode } from './scope'

import type { AgentToolDefinition } from '@shared/agent-tools'
import { STAGE_EASINGS, STAGE_LIMITS, STAGE_OBJECT_TYPES } from '@shared/stage-schema'


const stageNodeIdParameter = {
  type: 'string',
  description:
    '导演台画布节点 ID；导演台模式下由系统提示直接给出，其他模式来自 canvas_get 的 selectedNodes'
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
      '导出导演台的白模预演：scope=shot 导出当前镜头，scope=program 导出整片并生成每镜片段；可选分镜图、鸟瞰、镜头表和脚本。回画布自动建视频/图片/文本节点。导出耗时较长，执行前需要用户确认。',
    profiles: ['canvas', 'stage'],
    readOnly: false,
    scope: 'stage',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: stageNodeIdParameter,
        scope: {
          type: 'string',
          enum: ['shot', 'program'],
          description: '默认 shot；program 导出整片和每镜片段'
        },
        shotId: {
          type: 'string',
          description: 'scope=shot 时必填；镜头 ID 来自 stage_get 的 shots'
        },
        resolution: { type: 'string', enum: ['720p', '1080p'] },
        fps: { type: 'number', enum: [24, 30] },
        items: {
          type: 'object',
          properties: {
            previs: { type: 'boolean' },
            clips: { type: 'boolean' },
            frames: { type: 'boolean' },
            overview: { type: 'boolean' },
            shotList: { type: 'boolean' },
            script: { type: 'boolean' }
          },
          additionalProperties: false,
          description: '缺省 previs/clips/frames/shotList=true，overview/script=false'
        },
        frameDensity: {
          type: 'string',
          enum: ['three', 'first-only'],
          description: '分镜图每镜三张或仅首帧'
        }
      },
      required: ['nodeId'],
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
  },
  {
    id: 'stage.setShotIntent',
    name: 'stage_set_shot_intent',
    description:
      '用语义描述设置镜头：主体、单/双/群构图、机位关系、景别、高度和瞄准。优先用它，不要直接猜相机坐标。',
    profiles: ['canvas', 'stage'],
    readOnly: false,
    scope: 'stage',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: stageNodeIdParameter,
        shotId: { type: 'string', description: '镜头 ID，来自 stage_get' },
        intent: {
          type: 'object',
          description:
            '语义镜头：{ version: 1, keys: [{ timeMs, subjectIds, framing, relation, side?, towardId?, distance?, height?, aim?, angleOffsetDeg?, fovDeg? }] }'
        }
      },
      required: ['nodeId', 'shotId', 'intent'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'stage.clearShotIntent',
    name: 'stage_clear_shot_intent',
    description: '把语义镜头转回手工关键帧，保留当前相机轨迹。',
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
    replay: 'safe'
  },
  {
    id: 'stage.autoCoverage',
    name: 'stage_auto_coverage',
    description:
      '按主体自动排一组分镜：单人全景/中景/近景，两人正反打，3-8 人群戏。只替换 source=auto 的镜头，手工镜头保留。',
    profiles: ['canvas', 'stage'],
    readOnly: false,
    scope: 'stage',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: stageNodeIdParameter,
        subjectIds: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 8,
          description: '主体对象 ID，来自 stage_get 的 objects'
        },
        mode: {
          type: 'string',
          enum: ['auto', 'single', 'dialogue', 'group']
        },
        pace: { type: 'number', minimum: 0.6, maximum: 1.6 },
        replace: {
          type: 'boolean',
          description: '默认 true；只替换自动分镜镜头'
        }
      },
      required: ['nodeId', 'subjectIds'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'stage.dialogueCoverage',
    name: 'stage_dialogue_coverage',
    description:
      '按「角色：台词」脚本切分镜：两人正反打、多人全景+说话人近景，台词写入字幕。只替换 source=auto 的镜头。',
    profiles: ['canvas', 'stage'],
    readOnly: false,
    scope: 'stage',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: stageNodeIdParameter,
        script: {
          type: 'string',
          description: '每行「角色：台词」，角色名与场景人物名一致'
        },
        pace: { type: 'number', minimum: 0.6, maximum: 1.6 }
      },
      required: ['nodeId', 'script'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'stage.setWorld',
    name: 'stage_set_world',
    description:
      '设置导演台的程序化 previs 世界（街道、城市、江户、雨夜、火星等）。world 结构见 stage_capabilities。',
    profiles: ['canvas', 'stage'],
    readOnly: false,
    scope: 'stage',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: stageNodeIdParameter,
        world: {
          type: 'object',
          properties: {
            generatorVersion: {
              type: 'string',
              enum: ['modern-v1', 'styled-v1'],
              description: '缺省按 style 推导，一般不用传'
            },
            style: {
              type: 'string',
              enum: ['modern_city', 'jp_modern', 'edo', 'custom'],
              description: '街区风格；没有 market 这类值，菜市场请用 stage_scene_preset'
            },
            layout: {
              type: 'string',
              enum: ['street', 'crossroad', 't_junction', 'plaza']
            },
            density: { type: 'string', enum: ['low', 'medium', 'high'] },
            seed: { type: 'number', description: '随机种子' },
            extentM: {
              type: 'array',
              items: { type: 'number' },
              minItems: 2,
              maxItems: 2,
              description: '[宽, 深]，单位米，60–200'
            },
            timeOfDay: { type: 'string', enum: ['day', 'dusk', 'night'] },
            weather: { type: 'string', enum: ['rain', 'snow'] },
            stageAnchor: { type: 'object' },
            landmarks: { type: 'array', items: { type: 'object' } },
            water: { type: 'boolean' },
            overrides: { type: 'array', items: { type: 'object' } }
          },
          required: ['style', 'layout', 'density', 'seed', 'extentM']
        }
      },
      required: ['nodeId', 'world'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'stage.addObjects',
    name: 'stage_add_objects',
    description:
      '一次向导演台场景批量添加多个对象，按用户描述自由搭建具体场景。参数与 stage_add_object 一致，只是数组；用 box / sphere / plane 组合道具和建筑，用 human / crowd 摆放人物。',
    profiles: ['canvas', 'stage'],
    readOnly: false,
    scope: 'stage',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: stageNodeIdParameter,
        objects: {
          type: 'array',
          minItems: 1,
          maxItems: 60,
          description: '要添加的对象列表；先规划完整布局，再一次性提交。',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: STAGE_OBJECT_TYPES },
              name: { type: 'string' },
              position: stageVec3Parameter,
              rotation: stageVec3Parameter,
              scale: stageVec3Parameter,
              pose: { type: 'string', description: '人物姿态预设，可选' },
              color: {
                type: 'string',
                description: '十六进制颜色，如 #60a5fa'
              },
              count: {
                type: 'number',
                description: '群众数量 1-100，仅 crowd 使用'
              }
            },
            required: ['type'],
            additionalProperties: false
          }
        }
      },
      required: ['nodeId', 'objects'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'stage.randomizeWorld',
    name: 'stage_randomize_world',
    description: '用新的随机种子重新生成当前世界。',
    profiles: ['canvas', 'stage'],
    readOnly: false,
    scope: 'stage',
    modes: ['current', 'full-access'],
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
    id: 'stage.fromSceneImage',
    name: 'stage_from_scene_image',
    description:
      '根据上游参考图生成白膜场景：调用多模态模型解析场景图，写入世界、物体和机位。',
    profiles: ['canvas', 'stage'],
    readOnly: false,
    scope: 'stage',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        nodeId: stageNodeIdParameter,
        imagePath: { type: 'string', description: '图片相对路径' },
        imageScope: {
          type: 'string',
          enum: ['project', 'global'],
          description: '图片所在范围，缺省 project'
        },
        modelKey: {
          type: 'string',
          description: 'providerId/modelId；省略时自动选第一个文本模型'
        },
        seed: { type: 'number', description: '世界随机种子' }
      },
      required: ['nodeId', 'imagePath'],
      additionalProperties: false
    },
    replay: 'safe'
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

    if (call.name === 'stage_set_shot_intent') {
      if (
        typeof call.args.shotId !== 'string' ||
        !call.args.shotId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'shotId 必须是非空字符串')
      }
      const intent = call.args.intent
      if (!intent || typeof intent !== 'object' || Array.isArray(intent)) {
        throw new AgentToolError('invalid_params', 'intent 必须是对象')
      }
      const keys = (intent as Record<string, unknown>).keys
      if (!Array.isArray(keys) || keys.length === 0) {
        throw new AgentToolError('invalid_params', 'intent.keys 不能为空')
      }
      const framings = ['single', 'two_shot', 'group']
      const relations = [
        'front',
        'front_side',
        'side',
        'back_side',
        'behind',
        'over_shoulder',
        'hold'
      ]
      keys.forEach((rawKey, index) => {
        const key = rawKey as Record<string, unknown>
        if (!key || typeof key !== 'object' || Array.isArray(key)) {
          throw new AgentToolError(
            'invalid_params',
            `intent.keys[${index}] 必须是对象`
          )
        }
        if (
          typeof key.timeMs !== 'number' ||
          !Number.isFinite(key.timeMs) ||
          key.timeMs < 0
        ) {
          throw new AgentToolError(
            'invalid_params',
            `intent.keys[${index}].timeMs 无效`
          )
        }
        if (
          !Array.isArray(key.subjectIds) ||
          key.subjectIds.length === 0 ||
          key.subjectIds.some((id) => typeof id !== 'string')
        ) {
          throw new AgentToolError(
            'invalid_params',
            `intent.keys[${index}].subjectIds 无效`
          )
        }
        if (!framings.includes(String(key.framing))) {
          throw new AgentToolError(
            'invalid_params',
            `intent.keys[${index}].framing 无效`
          )
        }
        if (!relations.includes(String(key.relation))) {
          throw new AgentToolError(
            'invalid_params',
            `intent.keys[${index}].relation 无效`
          )
        }
        if (
          key.side !== undefined &&
          key.side !== 'left' &&
          key.side !== 'right'
        ) {
          throw new AgentToolError(
            'invalid_params',
            `intent.keys[${index}].side 无效`
          )
        }
        if (
          key.towardId !== undefined &&
          typeof key.towardId !== 'string'
        ) {
          throw new AgentToolError(
            'invalid_params',
            `intent.keys[${index}].towardId 无效`
          )
        }
      })
    }

    if (call.name === 'stage_clear_shot_intent') {
      if (
        typeof call.args.shotId !== 'string' ||
        !call.args.shotId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'shotId 必须是非空字符串')
      }
    }

    if (call.name === 'stage_set_world') {
      const world = call.args.world
      if (!world || typeof world !== 'object' || Array.isArray(world)) {
        throw new AgentToolError('invalid_params', 'world 必须是对象')
      }
    }

    if (call.name === 'stage_add_objects') {
      const objects = call.args.objects
      if (!Array.isArray(objects) || objects.length === 0) {
        throw new AgentToolError('invalid_params', 'objects 必须是非空数组')
      }
      if (objects.length > 60) {
        throw new AgentToolError('invalid_params', 'objects 最多 60 个')
      }
      for (const entry of objects) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          throw new AgentToolError('invalid_params', 'objects 的每一项必须是对象')
        }
        const item = entry as Record<string, unknown>
        if (
          typeof item.type !== 'string' ||
          !(STAGE_OBJECT_TYPES as readonly string[]).includes(item.type)
        ) {
          throw new AgentToolError(
            'invalid_params',
            '每个对象必须提供合法 type'
          )
        }
        assertStageVec3(item.position, 'position')
        assertStageVec3(item.rotation, 'rotation')
        assertStageVec3(item.scale, 'scale')
        if (
          item.count !== undefined &&
          (typeof item.count !== 'number' ||
            item.count < 1 ||
            item.count > 100)
        ) {
          throw new AgentToolError('invalid_params', 'count 必须是 1-100 的数字')
        }
      }
    }

    if (call.name === 'stage_from_scene_image') {
      if (
        typeof call.args.imagePath !== 'string' ||
        !call.args.imagePath.trim()
      ) {
        throw new AgentToolError('invalid_params', 'imagePath 必须是非空字符串')
      }
      if (
        call.args.imageScope !== undefined &&
        !['project', 'global'].includes(String(call.args.imageScope))
      ) {
        throw new AgentToolError('invalid_params', 'imageScope 无效')
      }
      if (
        call.args.seed !== undefined &&
        (typeof call.args.seed !== 'number' || !Number.isFinite(call.args.seed))
      ) {
        throw new AgentToolError('invalid_params', 'seed 必须是数字')
      }
    }


  }
}
