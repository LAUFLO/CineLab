import type { AssetScope } from './asset-schema'

export type NodeKind = 'text' | 'image' | 'video' | 'audio'

export type NodeStatus = 'idle' | 'queued' | 'running' | 'done' | 'error'

export interface OutputRef {
  id: string
  path: string
  scope?: AssetScope
  kind: 'image' | 'video' | 'audio' | 'text'
  createdAt: string
  model: string
  width?: number
  height?: number
  duration?: number
  fps?: number
  hasAudio?: boolean
  op?: string
  parentOutputId?: string
}

export interface CineNodeData extends Record<string, unknown> {
  kind: NodeKind
  title: string
  status: NodeStatus
  text?: string
  outputUrl?: string
  outputs?: OutputRef[]
  selectedOutputId?: string
  progress?: number
  error?: string
  templates: string[]
  /** 纯素材节点：由上传创建，不显示提示词输入框 */
  assetOnly?: boolean
}

export type GroupColor =
  | 'blue'
  | 'cyan'
  | 'teal'
  | 'green'
  | 'lime'
  | 'amber'
  | 'orange'
  | 'rose'
  | 'violet'
  | 'slate'

export const GROUP_COLORS: GroupColor[] = [
  'blue',
  'cyan',
  'teal',
  'green',
  'lime',
  'amber',
  'orange',
  'rose',
  'violet',
  'slate'
]

export const GROUP_LABELS: Record<GroupColor, string> = {
  blue: '蓝',
  cyan: '青',
  teal: '蓝绿',
  green: '绿',
  lime: '黄绿',
  amber: '琥珀',
  orange: '橙',
  rose: '玫红',
  violet: '紫',
  slate: '灰'
}

export type GroupMode = 'normal' | 'storyboard'

export type GroupRatio = '16:9' | '9:16' | '1:1' | '4:3'

export const GROUP_RATIOS: GroupRatio[] = ['16:9', '9:16', '1:1', '4:3']

export const GROUP_RATIO_LABEL: Record<GroupRatio, string> = {
  '16:9': '16:9',
  '9:16': '9:16',
  '1:1': '1:1',
  '4:3': '4:3'
}

export const GROUP_RATIO_VALUE: Record<GroupRatio, number> = {
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '1:1': 1,
  '4:3': 4 / 3
}

export const STORYBOARD_MAX_NODES = 25
export const STORYBOARD_CELL_WIDTH = 480
export const STORYBOARD_GAP = 24

export interface GroupNodeData extends Record<string, unknown> {
  title: string
  color: GroupColor
  mode?: GroupMode
  ratio?: GroupRatio
  gridCols?: number
  gridRows?: number
  showIndex?: boolean
}

export const GROUP_HEADER_HEIGHT = 36
export const GROUP_PADDING = 24
export const GROUP_GAP = 24

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
