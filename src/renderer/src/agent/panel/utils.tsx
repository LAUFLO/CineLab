import type { ReactNode } from 'react'
import type { AgentModelInfo } from '@shared/agent'
import type { AgentMessage } from '../agentStore'

const TOOL_LABELS: Record<string, string> = {
  canvas_get: '读取画布',
  canvas_update_title: '修改标题',
  canvas_update_text: '修改文本',
  canvas_move_node: '移动节点',
  canvas_add_node: '添加节点',
  canvas_connect: '连接节点',
  canvas_remove_edge: '删除连线',
  canvas_delete_node: '删除节点',
  canvas_group: '分组节点',
  canvas_ungroup: '解散分组',
  canvas_node_operations: '查看节点操作',
  canvas_node_operation: '执行节点操作',
  capability_catalog: '查看可用能力',
  generation_catalog: '查看生成模型',
  generation_propose: '登记生成提案',
  library_search: '搜索资产库',
  stage_get: '读取导演台',
  stage_capabilities: '读取导演台能力',
  stage_add_object: '添加场景对象',
  stage_transform_object: '移动场景对象',
  stage_add_camera: '添加机位',
  stage_transform_camera: '调整机位',
  stage_add_shot: '添加镜头',
  stage_update_shot: '修改镜头',
  stage_remove_shot: '删除镜头',
  stage_set_camera_track: '设置运镜',
  stage_set_background: '设置背景',
  stage_update_object: '调整场景对象',
  stage_export_preview: '导出白模预演',
  stage_set_active_camera: '切换机位',
  stage_remove_object: '删除场景对象',
  timeline_get: '读取时间线',
  timeline_select_clips: '选择片段',
  timeline_set_video: '设置画幅',
  timeline_move_clips: '移动片段',
  timeline_trim_clip: '裁剪片段',
  timeline_split_clips: '切分片段',
  timeline_split_by_shots: '按镜头切分',
  timeline_beat_markers: '节拍标记',
  timeline_beat_split: '节拍切分',
  timeline_remove_clips: '删除片段',
  timeline_update_clip: '调整片段',
  timeline_set_track: '调整轨道',
  timeline_add_marker: '添加标记',
  timeline_auto_subtitles: '自动字幕',
  timeline_remove_silence: '删除静音',
  timeline_set_transition: '设置转场',
  timeline_export: '导出成片',
  film_study_get: '读取拉片',
  film_study_auto: '逐帧拉片',
  film_study_update_segment: '修改拉片段落',
  film_study_extract_subtitles: '提取拉片字幕',
  film_study_export: '导出拉片',
  capability_search: '搜索能力',
  skill_list: '查看技能',
  skill_read: '读取技能'
}


export function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name
}

export function relativeTime(iso: string): string {
  const time = Date.parse(iso)
  if (!Number.isFinite(time)) return ''
  const diff = Date.now() - time
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时`
  return new Date(time).toLocaleDateString('zh-CN')
}

export function modelNameOf(model: AgentModelInfo | null): string {
  if (!model) return '选择模型'
  return model.name
}

export interface MentionItem {
  key: string
  name: string
  kind: 'image' | 'video' | 'audio'
  path: string
  scope: 'project' | 'global'
  nodeId?: string
}

export function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = []
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    const token = match[0]
    const key = `${match.index}-${token.slice(0, 8)}`
    if (token.startsWith('**')) {
      parts.push(<strong key={key}>{token.slice(2, -2)}</strong>)
    } else {
      parts.push(<code key={key}>{token.slice(1, -1)}</code>)
    }
    lastIndex = pattern.lastIndex
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts
}

export type RenderItem =
  | { kind: 'message'; message: AgentMessage }
  | { kind: 'thoughts'; id: string; tools: AgentMessage[] }

export function buildRenderItems(messages: AgentMessage[]): RenderItem[] {
  const items: RenderItem[] = []
  let tools: AgentMessage[] = []

  const flush = (): void => {
    if (tools.length === 0) return
    items.push({
      kind: 'thoughts',
      id: tools[0].callId ?? tools[0].id,
      tools
    })
    tools = []
  }

  for (const message of messages) {
    if (message.role === 'tool') {
      tools.push(message)
      continue
    }
    flush()
    items.push({ kind: 'message', message })
  }
  flush()
  return items
}
