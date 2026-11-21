import { randomUUID } from 'node:crypto'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type {
  McpWriteCommand,
  McpWriteResult
} from '@shared/mcp-command'
import { TIMELINE_TRANSITION_TYPES } from '@shared/timeline-schema'

interface PendingCommand {
  resolve: (result: McpWriteResult) => void
  timer: NodeJS.Timeout
}

const pending = new Map<string, PendingCommand>()
let ipcRegistered = false

export function registerMcpCommandIpc(): void {
  if (ipcRegistered) return
  ipcRegistered = true

  ipcMain.on('mcp:command-result', (_event, result: McpWriteResult) => {
    const entry = pending.get(result.id)
    if (!entry) return
    pending.delete(result.id)
    clearTimeout(entry.timer)
    entry.resolve(result)
  })
}

function result(value: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }]
  }
}

function errorResult(message: string): CallToolResult {
  return {
    content: [{ type: 'text', text: message }],
    isError: true
  }
}

function appWindow(): BrowserWindow | null {
  return (
    BrowserWindow.getAllWindows().find((window) => !window.isDestroyed()) ?? null
  )
}

function sendCommand(
  tool: string,
  args: Record<string, unknown>,
  timeoutMs = 30_000
): Promise<McpWriteResult> {
  const win = appWindow()
  if (!win) {
    return Promise.reject(new Error('没有可用的 CineLab 窗口'))
  }

  const id = randomUUID()
  const command: McpWriteCommand = {
    id,
    tool,
    args,
    turnId: `mcp-${id}`
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error('渲染进程响应超时'))
    }, timeoutMs)

    pending.set(id, { resolve, timer })
    win.webContents.send('mcp:command', command)
  })
}

async function confirm(
  summary: string,
  args: Record<string, unknown>,
  destructive: boolean
): Promise<boolean> {
  const win = appWindow()
  const options: Electron.MessageBoxOptions = {
    type: destructive ? 'warning' : 'question',
    buttons: ['执行', '取消'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
    title: '外部 Agent 请求修改项目',
    message: summary,
    detail: JSON.stringify(args, null, 2).slice(0, 1200)
  }

  const response = win
    ? await dialog.showMessageBox(win, options)
    : await dialog.showMessageBox(options)
  return response.response === 0
}

async function runWrite(
  tool: string,
  summary: string,
  args: Record<string, unknown>,
  destructive = false,
  timeoutMs = 30_000
): Promise<CallToolResult> {
  if (!(await confirm(summary, args, destructive))) {
    return result({ cancelled: true })
  }

  const commandResult = await sendCommand(tool, args, timeoutMs)
  if (!commandResult.ok) {
    return errorResult(commandResult.error ?? '执行失败')
  }
  return result(commandResult.result)
}

/** 注册 MCP 写工具；每个工具执行前都需要用户在应用内确认 */
export function registerCineLabWriteTools(server: McpServer): void {
  registerMcpCommandIpc()

  server.registerTool(
    'node_create',
    {
      title: '创建画布节点',
      description:
        '在当前画布创建 text / image / video / audio 节点。执行前会弹出确认框。',
      inputSchema: {
        kind: z.enum(['text', 'image', 'video', 'audio']),
        title: z.string().max(200).optional(),
        text: z.string().max(20_000).optional(),
        x: z.number().optional(),
        y: z.number().optional(),
        nearNodeId: z.string().optional()
      },
      annotations: { readOnlyHint: false }
    },
    async ({ kind, title, text, x, y, nearNodeId }) =>
      runWrite(
        'canvas_add_node',
        `创建${kind === 'text' ? '文本' : kind === 'image' ? '图片' : kind === 'video' ? '视频' : '音频'}节点${title ? `「${title}」` : ''}`,
        {
          kind,
          ...(title ? { title } : {}),
          ...(text !== undefined ? { text } : {}),
          ...(x !== undefined ? { x } : {}),
          ...(y !== undefined ? { y } : {}),
          ...(nearNodeId ? { nearNodeId } : {})
        }
      )
  )

  server.registerTool(
    'node_update',
    {
      title: '修改节点',
      description:
        '修改节点标题或文本内容。执行前会弹出确认框。',
      inputSchema: {
        nodeId: z.string().min(1),
        title: z.string().max(200).optional(),
        text: z.string().max(20_000).optional()
      },
      annotations: { readOnlyHint: false }
    },
    async ({ nodeId, title, text }) => {
      if (title === undefined && text === undefined) {
        return errorResult('至少提供 title 或 text')
      }
      if (!(await confirm('修改画布节点', { nodeId, title, text }, false))) {
        return result({ cancelled: true })
      }

      if (title !== undefined) {
        const commandResult = await sendCommand('canvas_update_title', {
          nodeId,
          title
        })
        if (!commandResult.ok) {
          return errorResult(commandResult.error ?? '修改标题失败')
        }
      }
      if (text !== undefined) {
        const commandResult = await sendCommand('canvas_update_text', {
          nodeId,
          text
        })
        if (!commandResult.ok) {
          return errorResult(commandResult.error ?? '修改文本失败')
        }
      }

      return result({ nodeId, updated: { title, text } })
    }
  )

  server.registerTool(
    'node_move',
    {
      title: '移动节点',
      description: '移动画布节点到指定坐标。执行前会弹出确认框。',
      inputSchema: {
        nodeId: z.string().min(1),
        x: z.number(),
        y: z.number()
      },
      annotations: { readOnlyHint: false }
    },
    async ({ nodeId, x, y }) =>
      runWrite('canvas_move_node', `移动节点 ${nodeId}`, { nodeId, x, y })
  )

  server.registerTool(
    'node_delete',
    {
      title: '删除节点',
      description:
        '删除画布节点及相关连线。执行前会弹出危险操作确认框。',
      inputSchema: { nodeId: z.string().min(1) },
      annotations: { readOnlyHint: false, destructiveHint: true }
    },
    async ({ nodeId }) =>
      runWrite('canvas_delete_node', `删除节点 ${nodeId}`, { nodeId }, true)
  )

  server.registerTool(
    'node_connect',
    {
      title: '连接节点',
      description: '连接上游和下游节点。执行前会弹出确认框。',
      inputSchema: {
        sourceNodeId: z.string().min(1),
        targetNodeId: z.string().min(1)
      },
      annotations: { readOnlyHint: false }
    },
    async ({ sourceNodeId, targetNodeId }) =>
      runWrite(
        'canvas_connect',
        '连接两个画布节点',
        { sourceNodeId, targetNodeId }
      )
  )

  server.registerTool(
    'node_disconnect',
    {
      title: '删除连线',
      description: '删除指定连线。执行前会弹出危险操作确认框。',
      inputSchema: { edgeId: z.string().min(1) },
      annotations: { readOnlyHint: false, destructiveHint: true }
    },
    async ({ edgeId }) =>
      runWrite('node_disconnect', `删除连线 ${edgeId}`, { edgeId }, true)
  )

  server.registerTool(
    'generation_start',
    {
      title: '提交生成',
      description:
        '对已有画布节点提交生成。执行前会弹出确认框；模型和参数由 CineLab 校验。',
      inputSchema: {
        nodeId: z.string().min(1),
        modelKey: z.string().min(1),
        prompt: z.string().max(20_000),
        params: z.record(z.string(), z.unknown()).optional()
      },
      annotations: { readOnlyHint: false }
    },
    async ({ nodeId, modelKey, prompt, params }) =>
      runWrite(
        'generation_start',
        `提交生成：${modelKey}`,
        {
          nodeId,
          modelKey,
          prompt,
          ...(params ? { params } : {})
        }
      )
  )

  server.registerTool(
    'timeline_open',
    {
      title: '创建并打开剪辑室',
      description:
        '创建剪辑室节点并打开时间线。执行前会弹出确认框；需要先在画布中打开项目。',
      inputSchema: {
        x: z.number().optional(),
        y: z.number().optional(),
        title: z.string().max(200).optional()
      },
      annotations: { readOnlyHint: false }
    },
    async ({ x, y, title }) =>
      runWrite('timeline_open', '创建并打开剪辑室', {
        ...(x !== undefined ? { x } : {}),
        ...(y !== undefined ? { y } : {}),
        ...(title ? { title } : {})
      })
  )

  server.registerTool(
    'timeline_get',
    {
      title: '读取时间线',
      description:
        '读取当前打开的剪辑室时间线摘要。需要先在应用里打开剪辑室；只读。',
      annotations: { readOnlyHint: true }
    },
    async () => {
      const commandResult = await sendCommand('timeline_get', {})
      if (!commandResult.ok) {
        return errorResult(commandResult.error ?? '读取时间线失败')
      }
      return result(commandResult.result)
    }
  )

  server.registerTool(
    'timeline_move_clips',
    {
      title: '移动时间线片段',
      description:
        '移动一个或多个片段；可用 startMs 指定起点，或 deltaMs 相对移动。执行前会弹出确认框。',
      inputSchema: {
        clipIds: z.array(z.string().min(1)).min(1),
        startMs: z.number().optional(),
        deltaMs: z.number().optional(),
        mode: z.enum(['insert', 'overwrite']).optional()
      },
      annotations: { readOnlyHint: false }
    },
    async ({ clipIds, startMs, deltaMs, mode }) =>
      runWrite('timeline_move_clips', `移动 ${clipIds.length} 个时间线片段`, {
        clipIds,
        ...(startMs !== undefined ? { startMs } : {}),
        ...(deltaMs !== undefined ? { deltaMs } : {}),
        ...(mode ? { mode } : {})
      })
  )

  server.registerTool(
    'timeline_trim_clip',
    {
      title: '裁剪时间线片段',
      description: '裁剪片段起点或终点。执行前会弹出确认框。',
      inputSchema: {
        clipId: z.string().min(1),
        edge: z.enum(['start', 'end']),
        deltaMs: z.number(),
        ripple: z.boolean().optional()
      },
      annotations: { readOnlyHint: false }
    },
    async ({ clipId, edge, deltaMs, ripple }) =>
      runWrite('timeline_trim_clip', `裁剪片段 ${clipId} 的${edge === 'start' ? '起点' : '终点'}`, {
        clipId,
        edge,
        deltaMs,
        ...(ripple !== undefined ? { ripple } : {})
      })
  )

  server.registerTool(
    'timeline_split_clips',
    {
      title: '切分时间线片段',
      description: '在指定时间切分片段。执行前会弹出确认框。',
      inputSchema: {
        clipIds: z.array(z.string().min(1)).min(1),
        atMs: z.number()
      },
      annotations: { readOnlyHint: false }
    },
    async ({ clipIds, atMs }) =>
      runWrite('timeline_split_clips', `切分 ${clipIds.length} 个时间线片段`, {
        clipIds,
        atMs
      })
  )

  server.registerTool(
    'timeline_remove_clips',
    {
      title: '删除时间线片段',
      description:
        '删除一个或多个时间线片段。执行前会弹出危险操作确认框。',
      inputSchema: {
        clipIds: z.array(z.string().min(1)).min(1),
        ripple: z.boolean().optional()
      },
      annotations: { readOnlyHint: false, destructiveHint: true }
    },
    async ({ clipIds, ripple }) =>
      runWrite(
        'timeline_remove_clips',
        `删除 ${clipIds.length} 个时间线片段`,
        {
          clipIds,
          ...(ripple !== undefined ? { ripple } : {})
        },
        true
      )
  )

  server.registerTool(
    'timeline_update_clip',
    {
      title: '修改时间线片段',
      description:
        '修改片段属性，例如名称、静音、音量、透明度、速度、转场。执行前会弹出确认框。',
      inputSchema: {
        clipId: z.string().min(1),
        patch: z.record(z.string(), z.unknown())
      },
      annotations: { readOnlyHint: false }
    },
    async ({ clipId, patch }) =>
      runWrite('timeline_update_clip', `修改片段 ${clipId}`, {
        clipId,
        patch
      })
  )

  server.registerTool(
    'timeline_set_track',
    {
      title: '修改时间线轨道',
      description:
        '设置轨道的可见、静音或锁定状态。执行前会弹出确认框。',
      inputSchema: {
        trackId: z.string().min(1),
        flag: z.enum(['visible', 'muted', 'locked']),
        value: z.boolean()
      },
      annotations: { readOnlyHint: false }
    },
    async ({ trackId, flag, value }) =>
      runWrite(
        'timeline_set_track',
        `设置轨道 ${trackId} 的 ${flag}`,
        { trackId, flag, value }
      )
  )

  server.registerTool(
    'timeline_add_marker',
    {
      title: '添加时间线标记',
      description: '在时间线指定时间添加标记。执行前会弹出确认框。',
      inputSchema: {
        atMs: z.number(),
        label: z.string().max(200).optional(),
        color: z.string().max(40).optional()
      },
      annotations: { readOnlyHint: false }
    },
    async ({ atMs, label, color }) =>
      runWrite('timeline_add_marker', `添加时间线标记 @${atMs}ms`, {
        atMs,
        ...(label ? { label } : {}),
        ...(color ? { color } : {})
      })
  )

  server.registerTool(
    'timeline_set_transition',
    {
      title: '设置片段转场',
      description:
        '设置片段入场转场；type=none 表示移除。执行前会弹出确认框。',
      inputSchema: {
        clipId: z.string().min(1),
        type: z.enum(['none', ...TIMELINE_TRANSITION_TYPES]),
        durationMs: z.number().optional()
      },
      annotations: { readOnlyHint: false }
    },
    async ({ clipId, type, durationMs }) =>
      runWrite(
        'timeline_set_transition',
        `设置片段 ${clipId} 转场 ${type}`,
        {
          clipId,
          type,
          ...(durationMs !== undefined ? { durationMs } : {})
        }
      )
  )

  server.registerTool(
    'timeline_export',
    {
      title: '导出时间线',
      description:
        '把当前剪辑室时间线导出为视频文件。导出可能耗时，执行前会弹出确认框。',
      inputSchema: {
        codec: z.enum(['h264', 'hevc', 'av1']).optional()
      },
      annotations: { readOnlyHint: false }
    },
    async ({ codec }) =>
      runWrite(
        'timeline_export',
        `导出时间线（${codec ?? 'h264'}）`,
        { codec: codec ?? 'h264' },
        false,
        10 * 60_000
      )
  )

  server.registerTool(
    'stage_open',
    {
      title: '创建并打开导演台',
      description:
        '创建导演台节点并打开舞台。执行前会弹出确认框。',
      inputSchema: {
        name: z.string().max(200).optional(),
        x: z.number().optional(),
        y: z.number().optional()
      },
      annotations: { readOnlyHint: false }
    },
    async ({ name, x, y }) =>
      runWrite('stage_open', '创建并打开导演台', {
        ...(name ? { name } : {}),
        ...(x !== undefined ? { x } : {}),
        ...(y !== undefined ? { y } : {})
      })
  )

  server.registerTool(
    'stage_get',
    {
      title: '读取导演台',
      description: '读取指定导演台节点的对象、机位、镜头和世界摘要。只读。',
      inputSchema: { nodeId: z.string().min(1) },
      annotations: { readOnlyHint: true }
    },
    async ({ nodeId }) => {
      const commandResult = await sendCommand('stage_get', { nodeId })
      if (!commandResult.ok) {
        return errorResult(commandResult.error ?? '读取导演台失败')
      }
      return result(commandResult.result)
    }
  )

  server.registerTool(
    'stage_add_object',
    {
      title: '添加导演台对象',
      description:
        '在导演台添加人物、立方体、球体、平面、模型或群众。执行前会弹出确认框。',
      inputSchema: {
        nodeId: z.string().min(1),
        type: z.enum(['human', 'box', 'sphere', 'plane', 'gltf', 'crowd']),
        name: z.string().max(200).optional(),
        position: z.array(z.number()).length(3).optional(),
        rotation: z.array(z.number()).length(3).optional(),
        scale: z.array(z.number()).length(3).optional(),
        pose: z.string().max(80).optional(),
        color: z.string().max(40).optional(),
        count: z.number().int().min(1).max(500).optional()
      },
      annotations: { readOnlyHint: false }
    },
    async ({ nodeId, type, name, position, rotation, scale, pose, color, count }) =>
      runWrite(
        'stage_add_object',
        `添加导演台对象：${name ?? type}`,
        {
          nodeId,
          type,
          ...(name ? { name } : {}),
          ...(position ? { position } : {}),
          ...(rotation ? { rotation } : {}),
          ...(scale ? { scale } : {}),
          ...(pose ? { pose } : {}),
          ...(color ? { color } : {}),
          ...(count !== undefined ? { count } : {})
        }
      )
  )

  server.registerTool(
    'stage_add_camera',
    {
      title: '添加导演台机位',
      description: '在导演台添加机位。执行前会弹出确认框。',
      inputSchema: {
        nodeId: z.string().min(1),
        name: z.string().max(200).optional(),
        position: z.array(z.number()).length(3).optional(),
        target: z.array(z.number()).length(3).optional(),
        fov: z.number().min(10).max(120).optional(),
        aspect: z.enum(['16:9', '9:16', '1:1']).optional()
      },
      annotations: { readOnlyHint: false }
    },
    async ({ nodeId, name, position, target, fov, aspect }) =>
      runWrite(
        'stage_add_camera',
        `添加导演台机位${name ? `：${name}` : ''}`,
        {
          nodeId,
          ...(name ? { name } : {}),
          ...(position ? { position } : {}),
          ...(target ? { target } : {}),
          ...(fov !== undefined ? { fov } : {}),
          ...(aspect ? { aspect } : {})
        }
      )
  )

  server.registerTool(
    'stage_add_shot',
    {
      title: '添加导演台镜头',
      description: '用指定机位创建镜头。执行前会弹出确认框。',
      inputSchema: {
        nodeId: z.string().min(1),
        cameraId: z.string().min(1),
        name: z.string().max(200).optional(),
        durationMs: z.number().min(100).max(600_000),
        aspect: z.enum(['16:9', '9:16', '1:1'])
      },
      annotations: { readOnlyHint: false }
    },
    async ({ nodeId, cameraId, name, durationMs, aspect }) =>
      runWrite(
        'stage_add_shot',
        `添加导演台镜头${name ? `：${name}` : ''}`,
        {
          nodeId,
          cameraId,
          durationMs,
          aspect,
          ...(name ? { name } : {})
        }
      )
  )

  server.registerTool(
    'stage_auto_coverage',
    {
      title: '导演台自动分镜',
      description:
        '按主体、对话或群戏自动生成机位和镜头。执行前会弹出确认框。',
      inputSchema: {
        nodeId: z.string().min(1),
        subjectIds: z.array(z.string()).optional(),
        mode: z.enum(['auto', 'single', 'dialogue', 'group']).optional(),
        pace: z.number().min(0.25).max(4).optional(),
        replace: z.boolean().optional()
      },
      annotations: { readOnlyHint: false }
    },
    async ({ nodeId, subjectIds, mode, pace, replace }) =>
      runWrite(
        'stage_auto_coverage',
        '导演台自动分镜',
        {
          nodeId,
          ...(subjectIds ? { subjectIds } : {}),
          ...(mode ? { mode } : {}),
          ...(pace !== undefined ? { pace } : {}),
          ...(replace !== undefined ? { replace } : {})
        }
      )
  )

  server.registerTool(
    'stage_remove_object',
    {
      title: '删除导演台对象',
      description: '删除导演台对象。执行前会弹出危险操作确认框。',
      inputSchema: {
        nodeId: z.string().min(1),
        objectId: z.string().min(1)
      },
      annotations: { readOnlyHint: false, destructiveHint: true }
    },
    async ({ nodeId, objectId }) =>
      runWrite(
        'stage_remove_object',
        `删除导演台对象 ${objectId}`,
        { nodeId, objectId },
        true
      )
  )

  server.registerTool(
    'stage_remove_shot',
    {
      title: '删除导演台镜头',
      description: '删除导演台镜头。执行前会弹出危险操作确认框。',
      inputSchema: {
        nodeId: z.string().min(1),
        shotId: z.string().min(1)
      },
      annotations: { readOnlyHint: false, destructiveHint: true }
    },
    async ({ nodeId, shotId }) =>
      runWrite(
        'stage_remove_shot',
        `删除导演台镜头 ${shotId}`,
        { nodeId, shotId },
        true
      )
  )

  server.registerTool(
    'stage_export_preview',
    {
      title: '导出导演台预演',
      description:
        '导出整片或单镜预演并回画布。执行前会弹出确认框。',
      inputSchema: {
        nodeId: z.string().min(1),
        scope: z.enum(['shot', 'program']),
        shotId: z.string().optional(),
        resolution: z.enum(['720p', '1080p']).optional(),
        fps: z.union([z.literal(24), z.literal(30)]).optional(),
        frameDensity: z.enum(['first-only', 'three']).optional()
      },
      annotations: { readOnlyHint: false }
    },
    async ({ nodeId, scope, shotId, resolution, fps, frameDensity }) =>
      runWrite(
        'stage_export_preview',
        `导出导演台${scope === 'program' ? '整片' : '单镜'}预演`,
        {
          nodeId,
          scope,
          ...(shotId ? { shotId } : {}),
          ...(resolution ? { resolution } : {}),
          ...(fps !== undefined ? { fps } : {}),
          ...(frameDensity ? { frameDensity } : {})
        },
        false,
        10 * 60_000
      )
  )
}
