import type { AgentScope, AgentToolCall } from '@shared/agent'
import { AgentToolError } from './errors'

import type { AgentToolDefinition } from '@shared/agent-tools'
import { TIMELINE_TRANSITION_TYPES } from '@shared/timeline-schema'

const timelineClipIdsParameter = {
  type: 'array',
  items: { type: 'string' },
  minItems: 1,
  maxItems: 100,
  description: '片段 ID 列表，必须来自 timeline_get'
}

export const TIMELINE_TOOLS: AgentToolDefinition[] = [
  {
    id: 'timeline.get',
    name: 'timeline_get',
    description:
      '读取当前剪辑室时间线：视频设置、轨道、片段、标记、选中片段和播放头。修改前先调用。',
    profiles: ['clip'],
    readOnly: true,
    scope: 'timeline',
    modes: ['read-only', 'current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'timeline.setVideo',
    name: 'timeline_set_video',
    description:
      '设置时间线画幅、分辨率、帧率或背景。width 和 height 必须成对出现且为偶数；只传其中一项或只改 fps/background 也可以。',
    profiles: ['clip'],
    readOnly: false,
    scope: 'timeline',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        width: { type: 'number', description: '画面宽度 16-7680，偶数' },
        height: { type: 'number', description: '画面高度 16-4320，偶数' },
        fps: { type: 'number', description: '帧率 1-120' },
        background: {
          type: 'object',
          description: '时间线背景设置',
          properties: {
            type: { type: 'string', enum: ['none', 'color', 'image'] },
            color: { type: 'string', description: '背景颜色，例如 #000000' },
            path: { type: 'string', description: '背景图片的项目内相对路径' }
          },
          required: ['type'],
          additionalProperties: false
        }
      },
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'timeline.selectClips',
    name: 'timeline_select_clips',
    description: '设置时间线当前选中的片段；传空数组清空选择。',
    profiles: ['clip'],
    readOnly: true,
    scope: 'timeline',
    modes: ['read-only', 'current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        clipIds: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 200,
          description: '要选中的片段 ID；空数组表示清空'
        }
      },
      required: ['clipIds'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'timeline.moveClips',
    name: 'timeline_move_clips',
    description:
      '移动一个或多个片段。deltaMs 表示相对移动；startMs 表示把最靠前的片段移到该时间，其他片段保持相对间距。',
    profiles: ['clip'],
    readOnly: false,
    scope: 'timeline',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        clipIds: timelineClipIdsParameter,
        deltaMs: { type: 'number', description: '相对移动毫秒，可为负数' },
        startMs: { type: 'number', description: '目标起始时间（毫秒）' },
        mode: {
          type: 'string',
          enum: ['insert', 'overwrite'],
          description: '插入或覆盖模式，默认 insert'
        }
      },
      required: ['clipIds'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'timeline.trimClip',
    name: 'timeline_trim_clip',
    description:
      '从片段头或尾裁剪/延长指定毫秒。deltaMs 为正表示延长，为负表示缩短。',
    profiles: ['clip'],
    readOnly: false,
    scope: 'timeline',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        clipId: { type: 'string', description: '片段 ID' },
        edge: { type: 'string', enum: ['start', 'end'] },
        deltaMs: { type: 'number', description: '裁剪毫秒，可为负数' },
        ripple: { type: 'boolean', description: '是否闭合空隙，默认 false' }
      },
      required: ['clipId', 'edge', 'deltaMs'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'timeline.splitClips',
    name: 'timeline_split_clips',
    description: '在时间线的指定绝对时间切分一个或多个片段。',
    profiles: ['clip'],
    readOnly: false,
    scope: 'timeline',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        clipIds: timelineClipIdsParameter,
        atMs: { type: 'number', description: '时间线绝对时间（毫秒）' }
      },
      required: ['clipIds', 'atMs'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'timeline.splitByShots',
    name: 'timeline_split_by_shots',
    description:
      '分析一个选中视频片段的镜头切点，并按镜头自动切分。会改变片段结构，执行前需要用户确认。',
    profiles: ['clip'],
    readOnly: false,
    scope: 'timeline',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        clipId: { type: 'string', description: '作为镜头切分来源的视频片段 ID' },
        minShotMs: {
          type: 'number',
          description: '两个镜头之间的最短间隔，默认 500'
        },
        edgePaddingMs: {
          type: 'number',
          description: '片段首尾不切的缓冲，默认 100'
        }
      },
      required: ['clipId'],
      additionalProperties: false
    },
    replay: 'unsafe',
    requiresConfirm: true
  },
  {
    id: 'timeline.beatMarkers',
    name: 'timeline_beat_markers',
    description:
      '分析一个选中音频或视频片段的节拍，并把节拍点写成时间线标记。只新增标记，不改变片段。',
    profiles: ['clip'],
    readOnly: false,
    scope: 'timeline',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        clipId: { type: 'string', description: '作为节拍来源的音频或视频片段 ID' },
        label: { type: 'string', description: '标记名称，默认「节拍」' },
        color: { type: 'string', description: '标记颜色，例如 #7bd88f' }
      },
      required: ['clipId'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'timeline.beatSplit',
    name: 'timeline_beat_split',
    description:
      '分析一个选中音频或视频片段的节拍，并在目标轨道上按节拍点切分片段。省略 trackId 时使用主轨。执行前需要用户确认。',
    profiles: ['clip'],
    readOnly: false,
    scope: 'timeline',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        clipId: { type: 'string', description: '作为节拍来源的音频或视频片段 ID' },
        trackId: {
          type: 'string',
          description: '要切分的轨道 ID；省略时使用主轨'
        },
        minGapMs: {
          type: 'number',
          description: '两个节拍切点之间的最短间隔，默认 250'
        }
      },
      required: ['clipId'],
      additionalProperties: false
    },
    replay: 'unsafe',
    requiresConfirm: true
  },
  {
    id: 'timeline.removeClips',
    name: 'timeline_remove_clips',
    description: '删除一个或多个片段，可选择是否闭合空隙。',
    profiles: ['clip'],
    readOnly: false,
    scope: 'timeline',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        clipIds: timelineClipIdsParameter,
        ripple: { type: 'boolean', description: '是否闭合空隙，默认 false' }
      },
      required: ['clipIds'],
      additionalProperties: false
    },
    replay: 'unsafe',
    requiresConfirm: true
  },
  {
    id: 'timeline.updateClip',
    name: 'timeline_update_clip',
    description:
      '修改片段属性：名称、音量、静音、透明度、淡入淡出、速度。',
    profiles: ['clip'],
    readOnly: false,
    scope: 'timeline',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        clipId: { type: 'string', description: '片段 ID' },
        patch: {
          type: 'object',
          description:
            '可修改 name / volume(0-4) / muted / opacity(0-1) / fadeInMs / fadeOutMs / speed(0.1-10)'
        }
      },
      required: ['clipId', 'patch'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'timeline.setTrack',
    name: 'timeline_set_track',
    description: '设置轨道可见、静音或锁定状态。',
    profiles: ['clip'],
    readOnly: false,
    scope: 'timeline',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        trackId: { type: 'string', description: '轨道 ID' },
        flag: { type: 'string', enum: ['visible', 'muted', 'locked'] },
        value: { type: 'boolean' }
      },
      required: ['trackId', 'flag', 'value'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'timeline.addMarker',
    name: 'timeline_add_marker',
    description: '在时间线指定时间添加标记。',
    profiles: ['clip'],
    readOnly: false,
    scope: 'timeline',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        atMs: { type: 'number', description: '时间线绝对时间（毫秒）' },
        label: { type: 'string', description: '标记名称，最多 200 字' },
        color: { type: 'string', description: '标记颜色，例如 #7bd88f' }
      },
      required: ['atMs'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'timeline.autoSubtitles',
    name: 'timeline_auto_subtitles',
    description:
      '对指定片段或整条时间线做语音转写，自动生成字幕片段。省略 clipId 时优先使用当前选中片段；没有选中则转写整条时间线。需要先安装本地字幕运行时和 Whisper Base 模型。',
    profiles: ['clip'],
    readOnly: false,
    scope: 'timeline',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        clipId: {
          type: 'string',
          description: '可选，视频或音频片段 ID；省略时使用当前选中片段或整条时间线'
        }
      },
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'timeline.removeSilence',
    name: 'timeline_remove_silence',
    description:
      '检测并删除静音区间。省略 clipIds 时优先处理当前选中片段，没有选中则处理全部未锁定轨道上的视频和音频片段。会缩短成片时长，执行前需要用户确认。',
    profiles: ['clip'],
    readOnly: false,
    scope: 'timeline',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        clipIds: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 100,
          description: '可选，要检测的片段 ID 列表；省略时按选中或全部片段处理'
        },
        paddingMs: {
          type: 'number',
          description: '静音两端保留的缓冲毫秒，默认 120'
        },
        minDurationMs: {
          type: 'number',
          description: '短于该值的静音不处理，默认 400'
        },
        ripple: {
          type: 'boolean',
          description: '删除后是否闭合空隙，默认 true'
        }
      },
      additionalProperties: false
    },
    replay: 'unsafe',
    requiresConfirm: true
  },
  {
    id: 'timeline.setTransition',
    name: 'timeline_set_transition',
    description:
      '给单个视觉片段设置片头转场，或传 type=none 移除转场。音频片段不支持转场。',
    profiles: ['clip'],
    readOnly: false,
    scope: 'timeline',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        clipId: { type: 'string', description: '片段 ID' },
        type: {
          type: 'string',
          enum: ['none', ...TIMELINE_TRANSITION_TYPES],
          description: '转场类型；none 表示移除'
        },
        durationMs: {
          type: 'number',
          description: '转场时长毫秒，默认 500，范围 100-10000'
        }
      },
      required: ['clipId', 'type'],
      additionalProperties: false
    },
    replay: 'safe'
  },
  {
    id: 'timeline.export',
    name: 'timeline_export',
    description:
      '把当前时间线渲染导出为视频文件。任务可能耗时较长，执行前需要用户确认；导出完成后会尽量写回画布上的成片节点。',
    profiles: ['clip'],
    readOnly: false,
    scope: 'timeline',
    modes: ['current', 'full-access'],
    parameters: {
      type: 'object',
      properties: {
        codec: {
          type: 'string',
          enum: ['h264', 'hevc', 'av1'],
          description: '视频编码，默认 h264'
        }
      },
      additionalProperties: false
    },
    replay: 'unsafe',
    requiresConfirm: true
  }
]

/** 真正修改时间线文档的工具；只读、选择和导出不计入回合撤销 */
const TIMELINE_WRITE_TOOL_NAMES = new Set([
  'timeline_set_video',
  'timeline_move_clips',
  'timeline_trim_clip',
  'timeline_split_clips',
  'timeline_split_by_shots',
  'timeline_beat_markers',
  'timeline_beat_split',
  'timeline_remove_clips',
  'timeline_update_clip',
  'timeline_set_track',
  'timeline_add_marker',
  'timeline_auto_subtitles',
  'timeline_remove_silence',
  'timeline_set_transition'
])

export function isTimelineWriteTool(name: string): boolean {
  return TIMELINE_WRITE_TOOL_NAMES.has(name)
}

export function validateTimelineToolArgs(
  call: AgentToolCall,
  scope: AgentScope
): void {
  if (call.name.startsWith('timeline_')) {
    if (!scope.timelineId) {
      throw new AgentToolError('scope_denied', '请先打开剪辑室')
    }

    const assertClipIds = (value: unknown, allowEmpty = false): void => {
      if (!Array.isArray(value)) {
        throw new AgentToolError('invalid_params', 'clipIds 必须是数组')
      }
      if (allowEmpty && value.length === 0) return
      if (
        value.length < 1 ||
        value.length > 100 ||
        value.some(
          (id) => typeof id !== 'string' || !id.trim()
        ) ||
        new Set(value).size !== value.length
      ) {
        throw new AgentToolError('invalid_params', 'clipIds 无效')
      }
    }

    if (call.name === 'timeline_select_clips') {
      assertClipIds(call.args.clipIds, true)
      if (
        Array.isArray(call.args.clipIds) &&
        call.args.clipIds.length > 200
      ) {
        throw new AgentToolError('invalid_params', '一次最多选择 200 个片段')
      }
    }

    if (call.name === 'timeline_set_video') {
      const width = call.args.width
      const height = call.args.height
      const fps = call.args.fps
      const background = call.args.background

      if (
        (width === undefined) !== (height === undefined)
      ) {
        throw new AgentToolError('invalid_params', 'width 和 height 必须同时提供')
      }
      for (const [key, value, max] of [
        ['width', width, 7680],
        ['height', height, 4320]
      ] as const) {
        if (value === undefined) continue
        if (
          typeof value !== 'number' ||
          !Number.isInteger(value) ||
          value < 16 ||
          value > max ||
          value % 2 !== 0
        ) {
          throw new AgentToolError(
            'invalid_params',
            `${key} 必须是 16-${max} 之间的偶数`
          )
        }
      }
      if (fps !== undefined) {
        if (
          typeof fps !== 'number' ||
          !Number.isFinite(fps) ||
          fps < 1 ||
          fps > 120
        ) {
          throw new AgentToolError('invalid_params', 'fps 必须在 1-120 之间')
        }
      }
      if (background !== undefined) {
        if (
          !background ||
          typeof background !== 'object' ||
          Array.isArray(background)
        ) {
          throw new AgentToolError('invalid_params', 'background 必须是对象')
        }
        const item = background as Record<string, unknown>
        if (!['none', 'color', 'image'].includes(String(item.type))) {
          throw new AgentToolError('invalid_params', 'background.type 无效')
        }
        if (
          item.color !== undefined &&
          (typeof item.color !== 'string' || item.color.length > 50)
        ) {
          throw new AgentToolError('invalid_params', 'background.color 无效')
        }
        if (
          item.path !== undefined &&
          (typeof item.path !== 'string' ||
            !item.path.trim() ||
            item.path.length > 2000 ||
            item.path.includes('..') ||
            item.path.startsWith('/') ||
            item.path.startsWith('\\') ||
            /^[a-zA-Z]:/.test(item.path))
        ) {
          throw new AgentToolError(
            'invalid_params',
            'background.path 必须是项目内相对路径'
          )
        }
        if (item.type === 'image' && typeof item.path !== 'string') {
          throw new AgentToolError(
            'invalid_params',
            'background.type=image 时必须提供 path'
          )
        }
        if (item.type === 'color' && typeof item.color !== 'string') {
          throw new AgentToolError(
            'invalid_params',
            'background.type=color 时必须提供 color'
          )
        }
      }
      if (
        width === undefined &&
        fps === undefined &&
        background === undefined
      ) {
        throw new AgentToolError(
          'invalid_params',
          '至少需要 width/height、fps 或 background'
        )
      }
    }

    if (call.name === 'timeline_move_clips') {
      assertClipIds(call.args.clipIds)
      if (
        call.args.deltaMs === undefined &&
        call.args.startMs === undefined
      ) {
        throw new AgentToolError(
          'invalid_params',
          '需要 deltaMs 或 startMs'
        )
      }
      if (
        call.args.deltaMs !== undefined &&
        (typeof call.args.deltaMs !== 'number' ||
          !Number.isFinite(call.args.deltaMs))
      ) {
        throw new AgentToolError('invalid_params', 'deltaMs 必须是有限数字')
      }
      if (
        call.args.startMs !== undefined &&
        (typeof call.args.startMs !== 'number' ||
          !Number.isFinite(call.args.startMs) ||
          call.args.startMs < 0)
      ) {
        throw new AgentToolError('invalid_params', 'startMs 必须是非负数字')
      }
      if (
        call.args.mode !== undefined &&
        !['insert', 'overwrite'].includes(String(call.args.mode))
      ) {
        throw new AgentToolError('invalid_params', 'mode 无效')
      }
    }

    if (call.name === 'timeline_trim_clip') {
      if (
        typeof call.args.clipId !== 'string' ||
        !call.args.clipId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'clipId 必须是非空字符串')
      }
      if (!['start', 'end'].includes(String(call.args.edge))) {
        throw new AgentToolError('invalid_params', 'edge 必须是 start 或 end')
      }
      if (
        typeof call.args.deltaMs !== 'number' ||
        !Number.isFinite(call.args.deltaMs)
      ) {
        throw new AgentToolError('invalid_params', 'deltaMs 必须是有限数字')
      }
      if (
        call.args.ripple !== undefined &&
        typeof call.args.ripple !== 'boolean'
      ) {
        throw new AgentToolError('invalid_params', 'ripple 必须是布尔值')
      }
    }

    if (call.name === 'timeline_split_clips') {
      assertClipIds(call.args.clipIds)
      if (
        typeof call.args.atMs !== 'number' ||
        !Number.isFinite(call.args.atMs) ||
        call.args.atMs < 0
      ) {
        throw new AgentToolError('invalid_params', 'atMs 必须是非负数字')
      }
    }

    if (call.name === 'timeline_remove_clips') {
      assertClipIds(call.args.clipIds)
      if (
        call.args.ripple !== undefined &&
        typeof call.args.ripple !== 'boolean'
      ) {
        throw new AgentToolError('invalid_params', 'ripple 必须是布尔值')
      }
    }

    if (call.name === 'timeline_update_clip') {
      if (
        typeof call.args.clipId !== 'string' ||
        !call.args.clipId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'clipId 必须是非空字符串')
      }
      const patch = call.args.patch
      if (
        typeof patch !== 'object' ||
        patch === null ||
        Array.isArray(patch)
      ) {
        throw new AgentToolError('invalid_params', 'patch 必须是对象')
      }

      const allowed = new Set([
        'name',
        'volume',
        'muted',
        'opacity',
        'fadeInMs',
        'fadeOutMs',
        'speed'
      ])
      const entries = Object.entries(patch)
      if (entries.length === 0) {
        throw new AgentToolError('invalid_params', 'patch 不能为空')
      }
      for (const [key, value] of entries) {
        if (!allowed.has(key)) {
          throw new AgentToolError('invalid_params', `不支持修改 ${key}`)
        }
        if (key === 'name' && (typeof value !== 'string' || value.length > 200)) {
          throw new AgentToolError('invalid_params', 'name 无效')
        }
        if (key === 'muted' && typeof value !== 'boolean') {
          throw new AgentToolError('invalid_params', 'muted 必须是布尔值')
        }
        if (
          (key === 'volume' ||
            key === 'opacity' ||
            key === 'fadeInMs' ||
            key === 'fadeOutMs' ||
            key === 'speed') &&
          (typeof value !== 'number' || !Number.isFinite(value))
        ) {
          throw new AgentToolError('invalid_params', `${key} 必须是数字`)
        }
        if (
          key === 'volume' &&
          typeof value === 'number' &&
          (value < 0 || value > 4)
        ) {
          throw new AgentToolError('invalid_params', 'volume 必须在 0-4 之间')
        }
        if (
          key === 'opacity' &&
          typeof value === 'number' &&
          (value < 0 || value > 1)
        ) {
          throw new AgentToolError('invalid_params', 'opacity 必须在 0-1 之间')
        }
        if (
          (key === 'fadeInMs' || key === 'fadeOutMs') &&
          typeof value === 'number' &&
          value < 0
        ) {
          throw new AgentToolError('invalid_params', `${key} 不能为负`)
        }
        if (
          key === 'speed' &&
          typeof value === 'number' &&
          (value < 0.1 || value > 10)
        ) {
          throw new AgentToolError('invalid_params', 'speed 必须在 0.1-10 之间')
        }
      }
    }

    if (call.name === 'timeline_set_track') {
      if (
        typeof call.args.trackId !== 'string' ||
        !call.args.trackId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'trackId 必须是非空字符串')
      }
      if (
        !['visible', 'muted', 'locked'].includes(String(call.args.flag))
      ) {
        throw new AgentToolError('invalid_params', 'track flag 无效')
      }
      if (typeof call.args.value !== 'boolean') {
        throw new AgentToolError('invalid_params', 'value 必须是布尔值')
      }
    }

    if (call.name === 'timeline_add_marker') {
      if (
        typeof call.args.atMs !== 'number' ||
        !Number.isFinite(call.args.atMs) ||
        call.args.atMs < 0
      ) {
        throw new AgentToolError('invalid_params', 'atMs 必须是非负数字')
      }
      if (
        call.args.label !== undefined &&
        (typeof call.args.label !== 'string' ||
          call.args.label.length > 200)
      ) {
        throw new AgentToolError('invalid_params', 'label 过长')
      }
      if (
        call.args.color !== undefined &&
        (typeof call.args.color !== 'string' ||
          call.args.color.length > 50)
      ) {
        throw new AgentToolError('invalid_params', 'color 无效')
      }
    }

    if (call.name === 'timeline_auto_subtitles') {
      if (
        call.args.clipId !== undefined &&
        (typeof call.args.clipId !== 'string' ||
          !call.args.clipId.trim())
      ) {
        throw new AgentToolError('invalid_params', 'clipId 必须是非空字符串')
      }
    }

    if (call.name === 'timeline_remove_silence') {
      if (call.args.clipIds !== undefined) {
        assertClipIds(call.args.clipIds)
      }
      for (const key of ['paddingMs', 'minDurationMs'] as const) {
        const value = call.args[key]
        if (
          value !== undefined &&
          (typeof value !== 'number' ||
            !Number.isFinite(value) ||
            value < 0 ||
            value > 10_000)
        ) {
          throw new AgentToolError(
            'invalid_params',
            `${key} 必须是 0-10000 的数字`
          )
        }
      }
      if (
        call.args.ripple !== undefined &&
        typeof call.args.ripple !== 'boolean'
      ) {
        throw new AgentToolError('invalid_params', 'ripple 必须是布尔值')
      }
    }

    if (call.name === 'timeline_set_transition') {
      if (
        typeof call.args.clipId !== 'string' ||
        !call.args.clipId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'clipId 必须是非空字符串')
      }
      if (
        ![...TIMELINE_TRANSITION_TYPES, 'none'].includes(
          String(call.args.type)
        )
      ) {
        throw new AgentToolError('invalid_params', '转场类型无效')
      }
      if (
        call.args.durationMs !== undefined &&
        (typeof call.args.durationMs !== 'number' ||
          !Number.isFinite(call.args.durationMs) ||
          call.args.durationMs < 100 ||
          call.args.durationMs > 10_000)
      ) {
        throw new AgentToolError(
          'invalid_params',
          'durationMs 必须在 100-10000 之间'
        )
      }
    }

    if (call.name === 'timeline_split_by_shots') {
      if (
        typeof call.args.clipId !== 'string' ||
        !call.args.clipId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'clipId 必须是非空字符串')
      }
      for (const key of ['minShotMs', 'edgePaddingMs'] as const) {
        const value = call.args[key]
        if (
          value !== undefined &&
          (typeof value !== 'number' ||
            !Number.isFinite(value) ||
            value < 0 ||
            value > 10_000)
        ) {
          throw new AgentToolError(
            'invalid_params',
            `${key} 必须是 0-10000 的数字`
          )
        }
      }
    }

    if (call.name === 'timeline_beat_markers') {
      if (
        typeof call.args.clipId !== 'string' ||
        !call.args.clipId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'clipId 必须是非空字符串')
      }
      if (
        call.args.label !== undefined &&
        (typeof call.args.label !== 'string' ||
          call.args.label.length > 200)
      ) {
        throw new AgentToolError('invalid_params', 'label 过长')
      }
      if (
        call.args.color !== undefined &&
        (typeof call.args.color !== 'string' ||
          call.args.color.length > 50)
      ) {
        throw new AgentToolError('invalid_params', 'color 无效')
      }
    }

    if (call.name === 'timeline_beat_split') {
      if (
        typeof call.args.clipId !== 'string' ||
        !call.args.clipId.trim()
      ) {
        throw new AgentToolError('invalid_params', 'clipId 必须是非空字符串')
      }
      if (
        call.args.trackId !== undefined &&
        (typeof call.args.trackId !== 'string' ||
          !call.args.trackId.trim())
      ) {
        throw new AgentToolError('invalid_params', 'trackId 必须是非空字符串')
      }
      if (
        call.args.minGapMs !== undefined &&
        (typeof call.args.minGapMs !== 'number' ||
          !Number.isFinite(call.args.minGapMs) ||
          call.args.minGapMs < 0 ||
          call.args.minGapMs > 10_000)
      ) {
        throw new AgentToolError(
          'invalid_params',
          'minGapMs 必须是 0-10000 的数字'
        )
      }
    }

    if (call.name === 'timeline_export') {
      if (
        call.args.codec !== undefined &&
        !['h264', 'hevc', 'av1'].includes(String(call.args.codec))
      ) {
        throw new AgentToolError('invalid_params', 'codec 无效')
      }
    }
  }
}
