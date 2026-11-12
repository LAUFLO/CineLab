import {
  GROUP_GAP,
  GROUP_HEADER_HEIGHT,
  GROUP_PADDING,
  NODE_META,
  TITLE_HEIGHT,
  type NodeKind
} from './canvas-schema'
import type { CanvasData, PersistedEdge } from './project-schema'

type TemplateNode = CanvasData['nodes'][number]

export type ProjectTemplateId = 'blank' | 'storyboard' | 'product' | 'character'

export interface ProjectTemplate {
  id: ProjectTemplateId
  name: string
  description: string
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'blank',
    name: '空白项目',
    description: '从一块空画布开始'
  },
  {
    id: 'storyboard',
    name: '分镜脚本',
    description: '2×2 分镜组，适合把一段镜头拆成四格'
  },
  {
    id: 'product',
    name: '产品广告',
    description: '卖点文案 → 主图 / 场景 / 细节 → 广告片'
  },
  {
    id: 'character',
    name: '角色短片',
    description: '角色设定 → 四视图 / 场景 / 分镜 → 短片'
  }
]

function cineNode(
  id: string,
  kind: NodeKind,
  title: string,
  position: { x: number; y: number },
  options: {
    text?: string
    parentId?: string
    width?: number
    height?: number
  } = {}
): TemplateNode {
  const meta = NODE_META[kind]
  const width = options.width ?? meta.width
  const height = options.height ?? meta.height + TITLE_HEIGHT

  return {
    id,
    type: 'cine',
    ...(options.parentId ? { parentId: options.parentId } : {}),
    position,
    data: {
      kind,
      title,
      status: 'idle',
      ...(options.text ? { text: options.text } : {}),
      templates: meta.templates
    },
    style: { width, height }
  }
}

function groupNode(
  id: string,
  title: string,
  position: { x: number; y: number },
  width: number,
  height: number,
  options: {
    mode?: 'normal' | 'storyboard'
    color?: 'blue' | 'cyan' | 'teal' | 'green' | 'amber'
    ratio?: '16:9' | '9:16' | '1:1' | '4:3'
    gridCols?: number
    gridRows?: number
    showIndex?: boolean
  } = {}
): TemplateNode {
  return {
    id,
    type: 'group',
    position,
    data: {
      title,
      color: options.color ?? 'blue',
      ...(options.mode ? { mode: options.mode } : {}),
      ...(options.ratio ? { ratio: options.ratio } : {}),
      ...(options.gridCols ? { gridCols: options.gridCols } : {}),
      ...(options.gridRows ? { gridRows: options.gridRows } : {}),
      ...(options.showIndex ? { showIndex: options.showIndex } : {})
    },
    style: { width, height }
  }
}

function edge(id: string, source: string, target: string): PersistedEdge {
  return {
    id,
    source,
    target,
    type: 'flow',
    data: { role: 'auto' }
  }
}

function storyboardCanvas(): { nodes: TemplateNode[]; edges: PersistedEdge[] } {
  const columns = 2
  const rows = 2
  const cellWidth = 480
  const cellHeight = Math.round((cellWidth * 9) / 16) + TITLE_HEIGHT
  const groupWidth =
    columns * cellWidth + (columns - 1) * GROUP_GAP + GROUP_PADDING * 2
  const groupHeight =
    rows * cellHeight + (rows - 1) * GROUP_GAP + GROUP_HEADER_HEIGHT + GROUP_PADDING

  const nodes: TemplateNode[] = [
    groupNode('group_storyboard', '分镜组 1', { x: 0, y: 0 }, groupWidth, groupHeight, {
      mode: 'storyboard',
      color: 'blue',
      ratio: '16:9',
      gridCols: columns,
      gridRows: rows,
      showIndex: true
    })
  ]

  for (let index = 0; index < columns * rows; index += 1) {
    const column = index % columns
    const row = Math.floor(index / columns)
    nodes.push(
      cineNode(
        `shot_${index + 1}`,
        'image',
        `分镜 ${String(index + 1).padStart(2, '0')}`,
        {
          x: GROUP_PADDING + column * (cellWidth + GROUP_GAP),
          y: GROUP_HEADER_HEIGHT + row * (cellHeight + GROUP_GAP)
        },
        {
          parentId: 'group_storyboard',
          width: cellWidth,
          height: cellHeight
        }
      )
    )
  }

  return { nodes, edges: [] }
}

function productCanvas(): { nodes: TemplateNode[]; edges: PersistedEdge[] } {
  const brief = cineNode(
    'text_brief',
    'text',
    '产品卖点',
    { x: 0, y: 0 },
    {
      text: '产品：\n核心卖点：\n目标人群：\n画面风格：\n\n把上面的信息补全，再用右侧图片节点生成主图、场景图和细节图，最后合成广告片。'
    }
  )

  const images = [
    { id: 'image_hero', title: '产品主图', y: 0 },
    { id: 'image_scene', title: '使用场景', y: 380 },
    { id: 'image_detail', title: '细节特写', y: 760 }
  ]

  const nodes: TemplateNode[] = [brief]
  images.forEach((item) => {
    nodes.push(
      cineNode(item.id, 'image', item.title, { x: 430, y: item.y })
    )
  })
  nodes.push(
    cineNode('video_ad', 'video', '广告片', { x: 880, y: 0 })
  )

  const edges: PersistedEdge[] = images.map((item, index) =>
    edge(`edge_brief_${index}`, 'text_brief', item.id)
  )
  edges.push(edge('edge_hero_video', 'image_hero', 'video_ad'))

  return { nodes, edges }
}

function characterCanvas(): { nodes: TemplateNode[]; edges: PersistedEdge[] } {
  const brief = cineNode(
    'text_character',
    'text',
    '角色设定',
    { x: 0, y: 0 },
    {
      text: '角色名：\n年龄 / 身份：\n性格：\n外观特征：\n服装：\n\n补全设定后，用右侧节点生成四视图、场景概念和分镜，最后合成角色短片。'
    }
  )

  const images = [
    { id: 'image_turnaround', title: '角色四视图', y: 0 },
    { id: 'image_scene', title: '场景概念', y: 380 },
    { id: 'image_shot', title: '分镜 01', y: 760 }
  ]

  const nodes: TemplateNode[] = [brief]
  images.forEach((item) => {
    nodes.push(
      cineNode(item.id, 'image', item.title, { x: 430, y: item.y })
    )
  })
  nodes.push(
    cineNode('video_short', 'video', '角色短片', { x: 880, y: 0 })
  )

  const edges: PersistedEdge[] = images.map((item, index) =>
    edge(`edge_character_${index}`, 'text_character', item.id)
  )
  edges.push(edge('edge_scene_video', 'image_scene', 'video_short'))

  return { nodes, edges }
}

export function buildTemplateCanvas(
  templateId: ProjectTemplateId,
  canvasId: string
): CanvasData {
  const template =
    templateId === 'storyboard'
      ? storyboardCanvas()
      : templateId === 'product'
        ? productCanvas()
        : templateId === 'character'
          ? characterCanvas()
          : { nodes: [], edges: [] }

  return {
    schemaVersion: 1,
    id: canvasId,
    name: '画布 1',
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: template.nodes,
    edges: template.edges
  }
}
