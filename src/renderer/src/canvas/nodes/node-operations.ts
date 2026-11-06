import type { NodeKind } from '@shared/canvas-schema'
import type { IconName } from '../../components/Icon'

export interface OperationContext {
  kind: NodeKind
  hasOutput: boolean
  /** 视频是否带音轨；元数据未接入前为 undefined，此时不禁用 */
  hasAudio?: boolean
}

export interface OperationMenuItem {
  id: string
  label: string
  hint?: string
  disabled?: boolean
}

export type OperationSection = 'generate' | 'edit' | 'video'

export interface NodeOperation {
  id: string
  label: string
  icon: IconName
  kinds: NodeKind[]
  /** 默认固定到一级工具栏 */
  defaultPrimary?: boolean
  /** 框架阶段全部为 false，点击只提示「正在接入」 */
  implemented?: boolean
  menu?: OperationMenuItem[]
  section?: OperationSection
  hint?: string
  prompt?: string
  promptByItem?: Record<string, string>
  /** 返回 null 表示可用；返回字符串为禁用原因 */
  disabledReason?: (ctx: OperationContext) => string | null
}

export const OPERATION_SECTIONS: Record<OperationSection, string> = {
  generate: '生成',
  edit: '编辑',
  video: '视频'
}

const PROMPT_GRID_MULTI =
  '基于参考图生成一张 3×3 多机位九宫格分镜图。保持同一角色、同一服装、同一场景、同一光线和同一画风；九个格子分别展示：正面全景、左前 45°、右前 45°、左侧面、右侧面、背面、高机位俯视、低机位仰视、面部特写。每格独立完整，格与格之间用细白线分隔，不要文字、不要水印、不要拼贴边框。'

const PROMPT_GRID_STORY =
  '基于参考图生成一张 2×2 剧情推演四宫格。保持同一角色身份、服装、场景和画风；四格依次展示接下来四个连续时刻的动作与表情变化，形成连贯的小叙事。每格独立完整，细白线分隔，不要文字、不要水印。'

const PROMPT_CHARACTER_SHEET =
  '基于参考图生成同一角色的正面、侧面、背面三视图。角色自然站姿，白色纯色背景，保持五官、发型、服装、体型和比例完全一致，全身完整，画面干净，不要文字、不要水印。'

const PROMPT_TIME_AFTER =
  '基于参考图推演 3 秒后的画面。保持同一角色、同一场景、同一镜头角度、同一光线和同一画风；只让角色动作、表情和环境细节自然延续，输出单张画面，不要分屏、不要文字、不要水印。'

const PROMPT_TIME_BEFORE =
  '基于参考图推演 5 秒前的画面。保持同一角色、同一场景、同一镜头角度、同一光线和同一画风；只让角色动作、表情和环境细节回到更早的状态，输出单张画面，不要分屏、不要文字、不要水印。'

const PROMPT_COLOR_GRADE =
  '对参考图进行电影级光影校正。保持人物身份、构图、服装和场景不变；重新平衡主光、辅光、轮廓光和色温，增加电影感的明暗层次、体积光和景深，肤色自然真实，不要文字、不要水印。'

const PROMPT_CUTOUT =
  '去除参考图背景，完整保留主体，输出透明背景 PNG；主体边缘干净自然，保留发丝和半透明细节，不要阴影、不要文字、不要水印。若模型不支持透明通道，请输出纯白背景的干净抠图。'

const PROMPT_PORTRAIT: Record<string, string> = {
  natural:
    '在保持人物身份、五官、发型和构图完全不变的前提下，提升人像质感：真实皮肤纹理、自然毛孔和细微瑕疵，减少塑料感和过度磨皮，改善人物与背景的光影融合，输出写实摄影质感，不要文字、不要水印。',
  standard:
    '在保持人物身份和构图完全不变的前提下，明显提升人像质感：真实皮肤肌理、自然毛孔、轻微眼袋和法令纹，减弱 AI 磨皮感，改善人景光影融合和面部立体感，输出高级写实摄影质感，不要文字、不要水印。',
  strong:
    '在保持人物身份和构图完全不变的前提下，强力去除 AI 塑料感：高细节皮肤纹理、真实毛孔和细微瑕疵、自然眼袋和法令纹，强化面部骨骼结构和光影层次，人物与背景光影高度融合，输出电影级写实人像，不要文字、不要水印。'
}

const PROMPT_RELIGHT_PREFIX =
  '保持画面内容、人物身份、服装和构图不变，只重新打光：'

const PROMPT_RELIGHT: Record<string, string> = {
  top:
    PROMPT_RELIGHT_PREFIX +
    '主光从正上方打下，眉骨、鼻梁和肩部形成清晰高光，眼窝和下颌有自然阴影，背景适当压暗。',
  left:
    PROMPT_RELIGHT_PREFIX +
    '主光从画面左侧 45° 打入，右侧形成柔和阴影，左侧发丝和肩线有轮廓光。',
  right:
    PROMPT_RELIGHT_PREFIX +
    '主光从画面右侧 45° 打入，左侧形成柔和阴影，右侧发丝和肩线有轮廓光。',
  back:
    PROMPT_RELIGHT_PREFIX +
    '主光改为逆光，人物边缘出现明亮轮廓光，正面保留柔和补光，背景有空气感。',
  golden:
    PROMPT_RELIGHT_PREFIX +
    '改为黄金时刻光线，低角度暖色阳光从侧后方照入，皮肤呈暖金色，阴影绵长，整体氛围温暖电影感。',
  blue:
    PROMPT_RELIGHT_PREFIX +
    '改为蓝调时刻光线，冷蓝色环境光与少量暖色实用光形成对比，氛围安静克制，电影感强。'
}

const PROMPT_ANGLE_PREFIX =
  '保持同一角色、服装、发型、场景、光线和画风不变，只改变机位：'

const PROMPT_ANGLE: Record<string, string> = {
  front: PROMPT_ANGLE_PREFIX + '正面平视机位，人物正对镜头，视线自然。',
  left: PROMPT_ANGLE_PREFIX + '机位移动到人物左前方 45°，保持人物身份和场景一致。',
  right: PROMPT_ANGLE_PREFIX + '机位移动到人物右前方 45°，保持人物身份和场景一致。',
  high: PROMPT_ANGLE_PREFIX + '高机位俯视，摄影机从上向下拍摄，空间关系自然。',
  low: PROMPT_ANGLE_PREFIX + '低机位仰视，摄影机从下向上拍摄，人物更有压迫感。',
  back: PROMPT_ANGLE_PREFIX + '机位绕到人物背面，展示背影和所处环境，保持同一场景。'
}

const GRID_MENU: OperationMenuItem[] = [
  { id: '2x2', label: '4 宫格（2×2）' },
  { id: '3x3', label: '9 宫格（3×3）' },
  { id: '4x4', label: '16 宫格（4×4）' },
  { id: '5x5', label: '25 宫格（5×5）' },
  { id: 'custom', label: '自定义', hint: '行列数' }
]

const CROP_MENU: OperationMenuItem[] = [
  { id: '1:1', label: '1:1' },
  { id: '16:9', label: '16:9' },
  { id: '9:16', label: '9:16' },
  { id: '4:3', label: '4:3' },
  { id: '3:4', label: '3:4' },
  { id: 'free', label: '自由裁剪' }
]

const FRAME_MENU: OperationMenuItem[] = [
  { id: 'first', label: '首帧' },
  { id: 'last', label: '尾帧' },
  { id: 'current', label: '当前帧', hint: '播放头位置' }
]

const VIDEO_CROP_MENU: OperationMenuItem[] = [
  { id: '16:9', label: '16:9' },
  { id: '9:16', label: '9:16' },
  { id: '1:1', label: '1:1' },
  { id: 'source', label: '原比例' }
]

const SUBTITLE_MENU: OperationMenuItem[] = [
  { id: 'smart', label: '智能去字幕' },
  { id: 'box', label: '框选去字幕' }
]

export const NODE_OPERATIONS: NodeOperation[] = [
  // ---------- P0：图片 ----------
  {
    id: 'grid-split',
    label: '宫格切分',
    icon: 'grid',
    kinds: ['image'],
    defaultPrimary: true,
    implemented: true,
    section: 'edit',
    menu: GRID_MENU
  },
  {
    id: 'crop',
    label: '裁剪',
    icon: 'crop',
    kinds: ['image'],
    defaultPrimary: true,
    implemented: true,
    section: 'edit',
    menu: CROP_MENU
  },

  // ---------- P0：视频 ----------
  {
    id: 'motion-capture',
    label: '深度动作捕捉',
    icon: 'video',
    kinds: ['video'],
    defaultPrimary: true,
    implemented: true,
    section: 'video'
  },
  {
    id: 'clip-trim',
    label: '片段截取',
    icon: 'scissors',
    kinds: ['video'],
    defaultPrimary: true,
    implemented: true,
    section: 'video'
  },
  {
    id: 'split-av',
    label: '分离音视频',
    icon: 'audio',
    kinds: ['video'],
    defaultPrimary: true,
    implemented: true,
    section: 'video',
    disabledReason: (ctx) =>
      ctx.hasAudio === false ? '当前视频无音轨，无法分离音视频' : null
  },
  {
    id: 'frame-study',
    label: '抽帧',
    icon: 'film',
    kinds: ['video'],
    defaultPrimary: true,
    implemented: true,
    section: 'video',
    menu: FRAME_MENU
  },
  {
    id: 'video-crop',
    label: '画面裁切',
    icon: 'crop',
    kinds: ['video'],
    defaultPrimary: true,
    implemented: true,
    section: 'video',
    menu: VIDEO_CROP_MENU
  },

  // ---------- 图片：更多 ----------
  {
    id: 'grid-generate',
    label: '九宫格',
    icon: 'grid',
    kinds: ['image'],
    implemented: true,
    section: 'generate',
    hint: '多机位 / 剧情推演',
    menu: [
      { id: 'multi', label: '多机位九宫格' },
      { id: 'story', label: '剧情推演四宫格' }
    ],
    promptByItem: {
      multi: PROMPT_GRID_MULTI,
      story: PROMPT_GRID_STORY
    }
  },
  {
    id: 'character-sheet',
    label: '角色三视图',
    icon: 'image',
    kinds: ['image'],
    implemented: true,
    section: 'generate',
    prompt: PROMPT_CHARACTER_SHEET
  },
  {
    id: 'time-shift',
    label: '画面推演',
    icon: 'history',
    kinds: ['image'],
    implemented: true,
    section: 'generate',
    menu: [
      { id: 'after', label: '3 秒后' },
      { id: 'before', label: '5 秒前' }
    ],
    promptByItem: {
      after: PROMPT_TIME_AFTER,
      before: PROMPT_TIME_BEFORE
    }
  },
  {
    id: 'multi-angle',
    label: '多角度',
    icon: 'target',
    kinds: ['image'],
    implemented: true,
    section: 'generate',
    hint: '预设机位',
    menu: [
      { id: 'front', label: '正面' },
      { id: 'left', label: '左前 45°' },
      { id: 'right', label: '右前 45°' },
      { id: 'high', label: '高机位俯视' },
      { id: 'low', label: '低机位仰视' },
      { id: 'back', label: '背面' },
      { id: 'custom', label: '自定义机位…' }
    ],
    promptByItem: PROMPT_ANGLE
  },
  {
    id: 'panorama',
    label: '720 度全景图',
    icon: 'expand',
    kinds: ['image'],
    section: 'generate'
  },
  {
    id: 'color-grade',
    label: '电影级光影校正',
    icon: 'sun',
    kinds: ['image'],
    implemented: true,
    section: 'edit',
    prompt: PROMPT_COLOR_GRADE
  },
  {
    id: 'relight',
    label: '打光',
    icon: 'sun',
    kinds: ['image'],
    implemented: true,
    section: 'edit',
    hint: '预设光位',
    menu: [
      { id: 'top', label: '顶光' },
      { id: 'left', label: '左侧光' },
      { id: 'right', label: '右侧光' },
      { id: 'back', label: '逆光' },
      { id: 'golden', label: '黄金时刻' },
      { id: 'blue', label: '蓝调时刻' },
      { id: 'custom', label: '自定义光位…' }
    ],
    promptByItem: PROMPT_RELIGHT
  },
  {
    id: 'portrait',
    label: '人像质感调节',
    icon: 'sparkles',
    kinds: ['image'],
    implemented: true,
    section: 'edit',
    menu: [
      { id: 'natural', label: '自然' },
      { id: 'standard', label: '标准' },
      { id: 'strong', label: '强质感' }
    ],
    promptByItem: PROMPT_PORTRAIT
  },
  {
    id: 'outpaint',
    label: '扩图',
    icon: 'expand',
    kinds: ['image'],
    section: 'edit',
    disabledReason: () => '扩图依赖蒙版，暂未开放'
  },
  {
    id: 'cutout',
    label: '抠图',
    icon: 'image',
    kinds: ['image'],
    implemented: true,
    section: 'edit',
    prompt: PROMPT_CUTOUT
  },
  {
    id: 'inpaint',
    label: '重绘',
    icon: 'droplet',
    kinds: ['image'],
    section: 'edit',
    disabledReason: () => '蒙版编辑器未开放，暂不能重绘'
  },
  {
    id: 'erase',
    label: '擦除',
    icon: 'close',
    kinds: ['image'],
    section: 'edit',
    disabledReason: () => '蒙版编辑器未开放，暂不能擦除'
  },
  {
    id: 'element-edit',
    label: '元素编辑',
    icon: 'cursor',
    kinds: ['image'],
    section: 'edit'
  },
  {
    id: 'layer-split',
    label: '图层分离',
    icon: 'layers',
    kinds: ['image'],
    section: 'edit'
  },

  // ---------- 视频：更多 ----------
  {
    id: 'subtitle',
    label: '去字幕',
    icon: 'text',
    kinds: ['video'],
    implemented: true,
    section: 'video',
    menu: SUBTITLE_MENU
  },
  {
    id: 'shot-retake',
    label: '片段重拍',
    icon: 'history',
    kinds: ['video'],
    section: 'video'
  },
  {
    id: 'element-replace',
    label: '元素替换',
    icon: 'cursor',
    kinds: ['video'],
    section: 'video'
  },
  {
    id: 'object-remove',
    label: '主体消除',
    icon: 'target',
    kinds: ['video'],
    section: 'video'
  },
  {
    id: 'matting',
    label: '智能抠像',
    icon: 'image',
    kinds: ['video'],
    section: 'video'
  },
  {
    id: 'intro',
    label: '创意片头',
    icon: 'film',
    kinds: ['video'],
    section: 'generate'
  },
  {
    id: 'extend',
    label: '智能续写',
    icon: 'arrow-up',
    kinds: ['video'],
    section: 'generate'
  }
]

export function buildOperationPrompt(
  op: NodeOperation,
  item?: OperationMenuItem
): string {
  if (item && op.promptByItem?.[item.id]) return op.promptByItem[item.id]
  return op.prompt ?? ''
}

export function operationsForKind(kind: NodeKind): NodeOperation[] {
  return NODE_OPERATIONS.filter((op) => op.kinds.includes(kind))
}

export function defaultPrimaryForKind(kind: NodeKind): string[] {
  return operationsForKind(kind)
    .filter((op) => op.defaultPrimary)
    .map((op) => op.id)
}

/**
 * 操作执行入口。框架阶段只返回 false，由工具栏提示「正在接入」。
 * 后续接入本地媒体处理 / 模型执行器时，在这里分发。
 */
export function runNodeOperation(
  op: NodeOperation,
  _ctx: OperationContext,
  _item?: OperationMenuItem
): boolean {
  if (!op.implemented) return false
  return true
}
