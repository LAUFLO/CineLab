export type NodeKind = 'text' | 'image' | 'video' | 'audio'

export type NodeStatus = 'idle' | 'queued' | 'running' | 'done' | 'error'

export interface CineNodeData extends Record<string, unknown> {
  kind: NodeKind
  title: string
  status: NodeStatus
  text?: string
  outputUrl?: string
  templates: string[]
}

export interface NodeMeta {
  label: string
  width: number
  height: number
  templates: string[]
}

export const NODE_META: Record<NodeKind, NodeMeta> = {
  text: {
    label: '文本',
    width: 348,
    height: 348,
    templates: ['自己编写内容', '文生视频', '图片反推提示词', '文学生成音乐']
  },
  image: {
    label: '图片',
    width: 614,
    height: 348,
    templates: ['图生图', '图片高清', '局部重绘']
  },
  video: {
    label: '视频',
    width: 614,
    height: 348,
    templates: ['首尾帧生成视频', '音效生成视频', '5 秒视频']
  },
  audio: {
    label: '音频',
    width: 348,
    height: 220,
    templates: ['文字转语音', '音乐生成']
  }
}

export const NODE_KINDS: NodeKind[] = ['text', 'image', 'video', 'audio']

export const TITLE_HEIGHT = 28
