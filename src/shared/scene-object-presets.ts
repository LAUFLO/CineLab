export type SceneObjectShape = 'box' | 'sphere' | 'plane' | 'human' | 'crowd'

export interface SceneObjectPreset {
  name: string
  aliases: string[]
  w: number
  d: number
  h: number
  color: string
  shape: SceneObjectShape
}

const BUILTIN: SceneObjectPreset[] = [
  // 室内
  { name: 'desk', aliases: ['书桌', '桌子', '写字台'], w: 1.4, d: 0.7, h: 0.75, color: '#8b6f47', shape: 'box' },
  { name: 'chair', aliases: ['椅子', '座椅'], w: 0.5, d: 0.5, h: 0.9, color: '#6b7280', shape: 'box' },
  { name: 'sofa', aliases: ['沙发'], w: 2.0, d: 0.9, h: 0.8, color: '#7c5c4a', shape: 'box' },
  { name: 'bed', aliases: ['床'], w: 1.6, d: 2.0, h: 0.5, color: '#a78bfa', shape: 'box' },
  { name: 'wardrobe', aliases: ['衣柜', '衣橱'], w: 1.2, d: 0.6, h: 2.0, color: '#8b5e3c', shape: 'box' },
  { name: 'bookshelf', aliases: ['书架', '书柜'], w: 1.0, d: 0.35, h: 1.8, color: '#7c4a2d', shape: 'box' },
  { name: 'table', aliases: ['餐桌', '茶几', '台子'], w: 1.2, d: 0.8, h: 0.75, color: '#9a6b4a', shape: 'box' },
  { name: 'tv', aliases: ['电视', '电视机'], w: 1.2, d: 0.1, h: 0.7, color: '#111827', shape: 'box' },
  { name: 'lamp', aliases: ['台灯', '灯'], w: 0.3, d: 0.3, h: 1.5, color: '#fbbf24', shape: 'box' },
  { name: 'rug', aliases: ['地毯'], w: 2.0, d: 3.0, h: 0.02, color: '#b91c1c', shape: 'plane' },
  { name: 'door', aliases: ['门', '房门'], w: 0.9, d: 0.1, h: 2.1, color: '#6b4f3a', shape: 'box' },
  { name: 'window', aliases: ['窗户', '窗'], w: 1.2, d: 0.1, h: 1.2, color: '#93c5fd', shape: 'box' },
  { name: 'counter', aliases: ['柜台', '吧台'], w: 2.0, d: 0.6, h: 0.9, color: '#7c5c4a', shape: 'box' },
  { name: 'fridge', aliases: ['冰箱'], w: 0.7, d: 0.7, h: 1.8, color: '#e5e7eb', shape: 'box' },
  { name: 'stove', aliases: ['灶台', '炉子'], w: 0.6, d: 0.6, h: 0.9, color: '#4b5563', shape: 'box' },
  { name: 'sink', aliases: ['水槽', '洗手池'], w: 0.6, d: 0.5, h: 0.85, color: '#d1d5db', shape: 'box' },
  { name: 'toilet', aliases: ['马桶'], w: 0.4, d: 0.6, h: 0.75, color: '#f3f4f6', shape: 'box' },
  { name: 'bathtub', aliases: ['浴缸'], w: 1.7, d: 0.75, h: 0.6, color: '#f3f4f6', shape: 'box' },
  { name: 'plant', aliases: ['盆栽', '植物'], w: 0.4, d: 0.4, h: 1.0, color: '#16a34a', shape: 'sphere' },
  { name: 'painting', aliases: ['画', '挂画'], w: 1.0, d: 0.05, h: 0.8, color: '#c084fc', shape: 'box' },
  { name: 'mirror', aliases: ['镜子'], w: 0.8, d: 0.05, h: 1.2, color: '#bfdbfe', shape: 'box' },
  { name: 'cabinet', aliases: ['柜子', '储物柜'], w: 0.8, d: 0.45, h: 1.0, color: '#8b5e3c', shape: 'box' },
  { name: 'stool', aliases: ['凳子'], w: 0.4, d: 0.4, h: 0.5, color: '#6b7280', shape: 'box' },
  { name: 'coffee_table', aliases: ['茶几', '矮桌'], w: 1.0, d: 0.6, h: 0.45, color: '#9a6b4a', shape: 'box' },
  // 室外
  { name: 'street_lamp', aliases: ['路灯'], w: 0.3, d: 0.3, h: 4.0, color: '#fbbf24', shape: 'box' },
  { name: 'bench', aliases: ['长椅', '长凳'], w: 1.8, d: 0.6, h: 0.8, color: '#8b5e3c', shape: 'box' },
  { name: 'trash_bin', aliases: ['垃圾桶'], w: 0.5, d: 0.5, h: 1.0, color: '#4b5563', shape: 'box' },
  { name: 'car', aliases: ['汽车', '轿车', '车'], w: 4.5, d: 1.8, h: 1.5, color: '#2563eb', shape: 'box' },
  { name: 'bus', aliases: ['公交车', '巴士'], w: 12.0, d: 2.5, h: 3.2, color: '#dc2626', shape: 'box' },
  { name: 'bicycle', aliases: ['自行车', '单车'], w: 1.8, d: 0.6, h: 1.1, color: '#111827', shape: 'box' },
  { name: 'motorcycle', aliases: ['摩托车'], w: 2.1, d: 0.8, h: 1.2, color: '#111827', shape: 'box' },
  { name: 'tree', aliases: ['树', '树木'], w: 1.0, d: 1.0, h: 4.0, color: '#15803d', shape: 'sphere' },
  { name: 'bush', aliases: ['灌木', '草丛'], w: 1.0, d: 1.0, h: 0.8, color: '#16a34a', shape: 'sphere' },
  { name: 'fence', aliases: ['栅栏', '围栏'], w: 2.0, d: 0.1, h: 1.2, color: '#9ca3af', shape: 'box' },
  { name: 'wall', aliases: ['墙', '围墙'], w: 3.0, d: 0.3, h: 2.5, color: '#9ca3af', shape: 'box' },
  { name: 'sign', aliases: ['招牌', '路牌'], w: 0.8, d: 0.1, h: 2.0, color: '#f59e0b', shape: 'box' },
  { name: 'traffic_light', aliases: ['红绿灯', '信号灯'], w: 0.3, d: 0.3, h: 3.0, color: '#111827', shape: 'box' },
  { name: 'hydrant', aliases: ['消防栓'], w: 0.3, d: 0.3, h: 0.8, color: '#dc2626', shape: 'box' },
  { name: 'phone_booth', aliases: ['电话亭'], w: 1.0, d: 1.0, h: 2.4, color: '#2563eb', shape: 'box' },
  { name: 'awning', aliases: ['雨棚', '遮阳棚'], w: 2.0, d: 1.0, h: 0.3, color: '#dc2626', shape: 'box' },
  { name: 'stairs', aliases: ['楼梯', '台阶'], w: 1.2, d: 1.2, h: 1.0, color: '#9ca3af', shape: 'box' },
  { name: 'railing', aliases: ['栏杆'], w: 2.0, d: 0.1, h: 1.0, color: '#6b7280', shape: 'box' },
  // 人物
  { name: 'person', aliases: ['人', '人物', '男人', '女人', '角色'], w: 0.6, d: 0.4, h: 1.75, color: '#60a5fa', shape: 'human' },
  { name: 'crowd', aliases: ['人群', '群众'], w: 3.0, d: 3.0, h: 1.75, color: '#60a5fa', shape: 'crowd' },
  // 自然
  { name: 'rock', aliases: ['石头', '岩石'], w: 1.0, d: 1.0, h: 0.8, color: '#78716c', shape: 'sphere' },
  { name: 'hill', aliases: ['山', '小山', '山丘'], w: 10.0, d: 10.0, h: 3.0, color: '#4d7c0f', shape: 'sphere' },
  { name: 'water', aliases: ['水', '水面', '湖', '河'], w: 5.0, d: 5.0, h: 0.05, color: '#0ea5e9', shape: 'plane' },
  { name: 'boat', aliases: ['船', '小船'], w: 4.0, d: 1.5, h: 1.2, color: '#7c5c4a', shape: 'box' },
  // 通用
  { name: 'box', aliases: ['盒子', '方块'], w: 1.0, d: 1.0, h: 1.0, color: '#9ca3af', shape: 'box' },
  { name: 'sphere', aliases: ['球', '球体'], w: 1.0, d: 1.0, h: 1.0, color: '#9ca3af', shape: 'sphere' },
  { name: 'plane', aliases: ['平面', '地面'], w: 2.0, d: 2.0, h: 0.02, color: '#9ca3af', shape: 'plane' }
]

export function builtinObjectPresets(): SceneObjectPreset[] {
  return BUILTIN.map((item) => ({ ...item, aliases: [...item.aliases] }))
}

export function findObjectPreset(
  presets: SceneObjectPreset[],
  label: string
): SceneObjectPreset | null {
  const needle = label.trim().toLowerCase()
  if (!needle) return null
  const exact = presets.find(
    (item) =>
      item.name.toLowerCase() === needle ||
      item.aliases.some((alias) => alias.toLowerCase() === needle)
  )
  if (exact) return exact
  return (
    presets.find(
      (item) =>
        needle.includes(item.name.toLowerCase()) ||
        item.aliases.some((alias) => needle.includes(alias.toLowerCase()))
    ) ?? null
  )
}

export const FALLBACK_OBJECT_PRESET: SceneObjectPreset = {
  name: 'unknown',
  aliases: [],
  w: 1,
  d: 1,
  h: 1,
  color: '#6b7280',
  shape: 'box'
}
