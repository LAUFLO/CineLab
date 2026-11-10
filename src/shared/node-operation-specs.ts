import type { NodeKind } from './canvas-schema'

/**
 * 节点操作对 Agent 的暴露方式。
 * UI 仍然可以通过 dialog/回调执行全部操作；这里只描述 Agent 能否在无人值守下执行。
 */
export interface NodeOperationAgentSpec {
  /** Agent 是否能直接执行；false 表示只能通过 UI 交互或改用生成提案 */
  executable: boolean
  /** 执行前是否需要用户确认 */
  requiresConfirm?: boolean
  /** 不能直接执行时给模型的原因 */
  reason?: string
  /** 必须从菜单里选择一个 item */
  itemRequired?: boolean
  /** 允许的 itemId；省略时不限制 */
  itemOptions?: string[]
  /** 额外参数 */
  params?: NodeOperationParamSpec[]
}

export type NodeOperationParamType =
  | 'number'
  | 'string'
  | 'boolean'
  | 'rect'

export interface NodeOperationParamSpec {
  key: string
  label: string
  type: NodeOperationParamType
  required?: boolean
  description?: string
  min?: number
  max?: number
  options?: string[]
}

export interface NodeOperationKindSpec {
  kind: NodeKind
  /** 该类型节点可被 Agent 执行的操作 */
  operations: string[]
}

const RECT_PARAM: NodeOperationParamSpec = {
  key: 'rect',
  label: '矩形区域',
  type: 'rect',
  description: '原图像素坐标：{ x, y, width, height }'
}

export const NODE_OPERATION_AGENT_SPECS: Record<string, NodeOperationAgentSpec> = {
  'grid-split': {
    executable: true,
    itemRequired: true,
    itemOptions: ['2x2', '3x3', '4x4', '5x5'],
    params: []
  },
  crop: {
    executable: true,
    itemRequired: true,
    itemOptions: ['1:1', '16:9', '9:16', '4:3', '3:4', 'free'],
    params: [RECT_PARAM]
  },
  'motion-capture': {
    executable: true,
    requiresConfirm: true,
    params: [
      {
        key: 'quality',
        label: '档位',
        type: 'string',
        options: ['fast', 'standard', 'long'],
        description: '默认 fast'
      },
      {
        key: 'fps',
        label: '帧率',
        type: 'number',
        min: 0,
        max: 60,
        description: '0 表示跟随源视频，或固定 24'
      }
    ]
  },
  'clip-trim': {
    executable: true,
    params: [
      {
        key: 'start',
        label: '开始秒数',
        type: 'number',
        required: true,
        min: 0
      },
      {
        key: 'end',
        label: '结束秒数',
        type: 'number',
        required: true,
        min: 0
      }
    ]
  },
  'split-av': { executable: true, params: [] },
  'frame-study': {
    executable: true,
    itemRequired: true,
    itemOptions: ['first', 'last', 'current'],
    params: [
      {
        key: 'time',
        label: '当前帧秒数',
        type: 'number',
        min: 0,
        description: '仅 current 模式使用'
      }
    ]
  },
  'film-study': {
    executable: true,
    requiresConfirm: true,
    params: [
      {
        key: 'interval',
        label: '分镜间隔秒数',
        type: 'number',
        min: 0,
        max: 300,
        description: '0 表示自动镜头检测'
      }
    ]
  },
  'video-crop': {
    executable: true,
    itemRequired: true,
    itemOptions: ['16:9', '9:16', '1:1', 'source']
  },
  subtitle: {
    executable: true,
    requiresConfirm: true,
    itemRequired: true,
    itemOptions: ['smart', 'box'],
    params: [
      RECT_PARAM,
      {
        key: 'title',
        label: '操作名称',
        type: 'string',
        description: '可选，用于节点标题'
      }
    ]
  },
  'layer-split': { executable: true, requiresConfirm: true },
  'shot-retake': { executable: true },
  'element-replace': { executable: true },
  'object-remove': {
    executable: true,
    requiresConfirm: true,
    params: [{ ...RECT_PARAM, required: true }]
  },
  matting: { executable: true, requiresConfirm: true },
  extend: { executable: true },
  outpaint: {
    executable: true,
    requiresConfirm: true,
    itemRequired: true,
    itemOptions: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9']
  },
  cutout: { executable: true, requiresConfirm: true },

  // 需要模型或蒙版交互，面向 Agent 统一走 generation_propose
  'grid-generate': {
    executable: false,
    reason: '需要选择生成模型，请用 generation_propose 并传入对应操作提示词'
  },
  'character-sheet': {
    executable: false,
    reason: '需要选择生成模型，请用 generation_propose'
  },
  'time-shift': {
    executable: false,
    reason: '需要选择生成模型，请用 generation_propose'
  },
  'multi-angle': {
    executable: false,
    reason: '需要选择生成模型，请用 generation_propose'
  },
  panorama: {
    executable: false,
    reason: '需要选择生成模型，请用 generation_propose'
  },
  'color-grade': {
    executable: false,
    reason: '需要选择生成模型，请用 generation_propose'
  },
  relight: {
    executable: false,
    reason: '需要选择生成模型，请用 generation_propose'
  },
  portrait: {
    executable: false,
    reason: '需要选择生成模型，请用 generation_propose'
  },
  inpaint: {
    executable: false,
    reason: '需要蒙版交互和生成模型，请在界面中使用'
  },
  erase: {
    executable: false,
    reason: '需要蒙版交互和生成模型，请在界面中使用'
  },
  'element-edit': {
    executable: false,
    reason: '需要蒙版交互和生成模型，请在界面中使用'
  }
}

export function nodeOperationAgentSpec(
  operationId: string
): NodeOperationAgentSpec | undefined {
  return NODE_OPERATION_AGENT_SPECS[operationId]
}

export function isAgentOperationParamSpec(
  value: unknown
): value is NodeOperationParamSpec {
  return Boolean(value) && typeof value === 'object'
}

/** 参数校验：主进程和渲染执行器共用 */
export function validateNodeOperationParams(
  operationId: string,
  itemId: string | undefined,
  params: Record<string, unknown>
): string | null {
  const spec = NODE_OPERATION_AGENT_SPECS[operationId]
  if (!spec) return `未知节点操作：${operationId}`

  if (spec.itemRequired && !itemId) {
    return `操作 ${operationId} 需要 itemId`
  }
  if (itemId && spec.itemOptions && !spec.itemOptions.includes(itemId)) {
    return `操作 ${operationId} 不支持 itemId=${itemId}`
  }

  for (const param of spec.params ?? []) {
    const value = params[param.key]
    if (value === undefined) {
      if (param.required) return `缺少参数 ${param.key}`
      continue
    }
    if (param.type === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return `参数 ${param.key} 必须是数字`
      }
      if (param.min !== undefined && value < param.min) {
        return `参数 ${param.key} 不能小于 ${param.min}`
      }
      if (param.max !== undefined && value > param.max) {
        return `参数 ${param.key} 不能大于 ${param.max}`
      }
    } else if (param.type === 'string') {
      if (typeof value !== 'string' || !value.trim()) {
        return `参数 ${param.key} 必须是非空字符串`
      }
      if (param.options && !param.options.includes(value)) {
        return `参数 ${param.key} 只能是 ${param.options.join(' / ')}`
      }
    } else if (param.type === 'boolean') {
      if (typeof value !== 'boolean') {
        return `参数 ${param.key} 必须是布尔值`
      }
    } else if (param.type === 'rect') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return `参数 ${param.key} 必须是矩形对象`
      }
      const rect = value as Record<string, unknown>
      for (const key of ['x', 'y', 'width', 'height'] as const) {
        if (
          typeof rect[key] !== 'number' ||
          !Number.isFinite(rect[key] as number)
        ) {
          return `参数 ${param.key}.${key} 必须是数字`
        }
      }
      if ((rect.width as number) <= 0 || (rect.height as number) <= 0) {
        return `参数 ${param.key} 的宽高必须大于 0`
      }
    }
  }

  if (operationId === 'crop' && itemId === 'free' && !params.rect) {
    return '自由裁剪需要 params.rect'
  }
  if (operationId === 'subtitle' && itemId === 'box' && !params.rect) {
    return '框选去字幕需要 params.rect'
  }
  if (operationId === 'clip-trim') {
    const start = params.start
    const end = params.end
    if (typeof start === 'number' && typeof end === 'number' && end <= start) {
      return 'params.end 必须大于 params.start'
    }
  }

  return null
}
