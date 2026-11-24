import type { CanvasCommand } from './canvas-commands'

/**
 * 同步 CRUD 工具的命令映射。
 * 返回 null 表示参数不完整，交给对应 bridge handler 做完整校验。
 */
export function agentToolCommands(
  name: string,
  args: Record<string, unknown>
): CanvasCommand[] | null {
  if (name === 'canvas_update_title') {
    const nodeId = String(args.nodeId ?? '')
    const title = String(args.title ?? '').trim()
    if (!nodeId || !title) return null
    return [{ type: 'updateTitle', nodeId, title }]
  }

  if (name === 'canvas_update_text') {
    const nodeId = String(args.nodeId ?? '')
    if (!nodeId || typeof args.text !== 'string') return null
    return [{ type: 'updateText', nodeId, text: args.text }]
  }

  if (name === 'canvas_move_node') {
    const nodeId = String(args.nodeId ?? '')
    const x = Number(args.x)
    const y = Number(args.y)
    if (!nodeId || !Number.isFinite(x) || !Number.isFinite(y)) return null
    return [{ type: 'moveNode', nodeId, position: { x, y } }]
  }

  if (name === 'canvas_delete_node') {
    const nodeId = String(args.nodeId ?? '')
    if (!nodeId) return null
    return [{ type: 'removeNode', nodeId }]
  }

  return null
}
