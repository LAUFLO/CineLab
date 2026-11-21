export type ShortcutScope = 'global' | 'canvas' | 'timeline' | 'stage'

export interface ShortcutActionDef {
  id: string
  label: string
  group: string
  scope: ShortcutScope
  defaultKeys: string
}

export type ShortcutBinding = string | null
export type ShortcutBindings = Record<string, ShortcutBinding>

export const SHORTCUT_SCOPES: Record<ShortcutScope, string> = {
  global: '应用',
  canvas: '画布',
  timeline: '剪辑室',
  stage: '导演台'
}

export const SHORTCUT_ACTIONS: ShortcutActionDef[] = [
  {
    id: 'app.agent.toggle',
    label: '打开 / 关闭 CineBot',
    group: '应用',
    scope: 'global',
    defaultKeys: 'mod+shift+a'
  },
  {
    id: 'app.studio.open',
    label: '打开剪辑室',
    group: '应用',
    scope: 'global',
    defaultKeys: 'mod+shift+e'
  },
  {
    id: 'canvas.tool.select',
    label: '选择工具',
    group: '画布',
    scope: 'canvas',
    defaultKeys: 'v'
  },
  {
    id: 'canvas.tool.hand',
    label: '抓手工具',
    group: '画布',
    scope: 'canvas',
    defaultKeys: 'h'
  },
  {
    id: 'canvas.tool.tempHand',
    label: '临时抓手（按住）',
    group: '画布',
    scope: 'canvas',
    defaultKeys: 'space'
  },
  {
    id: 'canvas.delete',
    label: '删除选中节点 / 连线',
    group: '画布',
    scope: 'canvas',
    defaultKeys: 'delete|backspace'
  },
  {
    id: 'canvas.undo',
    label: '撤销',
    group: '画布',
    scope: 'canvas',
    defaultKeys: 'mod+z'
  },
  {
    id: 'canvas.redo',
    label: '重做',
    group: '画布',
    scope: 'canvas',
    defaultKeys: 'mod+shift+z'
  },
  {
    id: 'canvas.copy',
    label: '复制选中节点',
    group: '画布',
    scope: 'canvas',
    defaultKeys: 'mod+c'
  },
  {
    id: 'canvas.paste',
    label: '粘贴',
    group: '画布',
    scope: 'canvas',
    defaultKeys: 'mod+v'
  },
  {
    id: 'canvas.search',
    label: '搜索节点',
    group: '画布',
    scope: 'canvas',
    defaultKeys: 'mod+f'
  },
  {
    id: 'canvas.arrange',
    label: '整理画布',
    group: '画布',
    scope: 'canvas',
    defaultKeys: 'alt+shift+f'
  },
  {
    id: 'timeline.delete',
    label: '删除片段',
    group: '剪辑室',
    scope: 'timeline',
    defaultKeys: 'delete|backspace'
  },
  {
    id: 'timeline.deleteRipple',
    label: '涟漪删除',
    group: '剪辑室',
    scope: 'timeline',
    defaultKeys: 'shift+delete|shift+backspace'
  },
  {
    id: 'timeline.undo',
    label: '撤销',
    group: '剪辑室',
    scope: 'timeline',
    defaultKeys: 'mod+z'
  },
  {
    id: 'timeline.redo',
    label: '重做',
    group: '剪辑室',
    scope: 'timeline',
    defaultKeys: 'mod+shift+z'
  },
  {
    id: 'timeline.splitAtPlayhead',
    label: '在播放头切分',
    group: '剪辑室',
    scope: 'timeline',
    defaultKeys: 'mod+b'
  },
  {
    id: 'timeline.splitSelected',
    label: '切分选中片段',
    group: '剪辑室',
    scope: 'timeline',
    defaultKeys: 'mod+k'
  },
  {
    id: 'timeline.trimStart',
    label: '删除片段左侧',
    group: '剪辑室',
    scope: 'timeline',
    defaultKeys: 'q'
  },
  {
    id: 'timeline.trimEnd',
    label: '删除片段右侧',
    group: '剪辑室',
    scope: 'timeline',
    defaultKeys: 'w'
  },
  {
    id: 'timeline.freeze',
    label: '定格帧',
    group: '剪辑室',
    scope: 'timeline',
    defaultKeys: 'f'
  },
  {
    id: 'timeline.mute',
    label: '切换静音',
    group: '剪辑室',
    scope: 'timeline',
    defaultKeys: 'm'
  },
  {
    id: 'timeline.snap',
    label: '切换吸附',
    group: '剪辑室',
    scope: 'timeline',
    defaultKeys: 'n'
  },
  {
    id: 'timeline.tool.select',
    label: '选择工具',
    group: '剪辑室',
    scope: 'timeline',
    defaultKeys: 'v'
  },
  {
    id: 'timeline.tool.cut',
    label: '切割工具',
    group: '剪辑室',
    scope: 'timeline',
    defaultKeys: 'c'
  },
  {
    id: 'stage.undo',
    label: '撤销',
    group: '导演台',
    scope: 'stage',
    defaultKeys: 'mod+z'
  },
  {
    id: 'stage.redo',
    label: '重做',
    group: '导演台',
    scope: 'stage',
    defaultKeys: 'mod+shift+z'
  }
]

export const DEFAULT_SHORTCUT_BINDINGS: Record<string, string> =
  Object.fromEntries(
    SHORTCUT_ACTIONS.map((action) => [action.id, action.defaultKeys])
  )

const ACTION_IDS = new Set(SHORTCUT_ACTIONS.map((action) => action.id))
const ACTION_BY_ID = new Map(
  SHORTCUT_ACTIONS.map((action) => [action.id, action])
)

const MODIFIERS = new Set(['mod', 'ctrl', 'alt', 'shift', 'meta'])
const FIXED_KEYS = new Set([
  'escape',
  'tab',
  'enter',
  'arrowup',
  'arrowdown',
  'arrowleft',
  'arrowright'
])

export function isShortcutActionId(value: string): boolean {
  return ACTION_IDS.has(value)
}

export function shortcutAction(id: string): ShortcutActionDef | undefined {
  return ACTION_BY_ID.get(id)
}

function isShortcutKey(key: string): boolean {
  if (FIXED_KEYS.has(key)) return false
  return (
    /^[a-z0-9]$/.test(key) ||
    /^f([1-9]|1[0-2])$/.test(key) ||
    ['delete', 'backspace', 'space', 'home', 'end', 'pageup', 'pagedown'].includes(
      key
    )
  )
}

/** 校验单个组合键，例如 mod+shift+z、delete、space */
export function isValidShortcutPart(part: string): boolean {
  const tokens = part
    .trim()
    .toLowerCase()
    .split('+')
    .filter(Boolean)
  if (tokens.length === 0) return false

  const key = tokens[tokens.length - 1]
  if (!isShortcutKey(key)) return false

  const seen = new Set<string>()
  for (const token of tokens.slice(0, -1)) {
    if (!MODIFIERS.has(token) || seen.has(token)) return false
    seen.add(token)
  }
  return true
}

/** 允许用 | 表示默认键的多个备选，例如 delete|backspace */
export function isValidShortcutBinding(binding: string): boolean {
  const parts = binding.split('|').map((part) => part.trim())
  return parts.length > 0 && parts.every(isValidShortcutPart)
}

export function shortcutParts(binding: string | null): string[] {
  if (!binding) return []
  return binding
    .split('|')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
}

export interface ShortcutKeyEvent {
  key: string
  code: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
  isComposing?: boolean
}

function eventKey(event: ShortcutKeyEvent): string | null {
  if (event.isComposing) return null
  const code = event.code
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase()
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  if (/^F([1-9]|1[0-2])$/.test(code)) return code.toLowerCase()
  if (code === 'Delete') return 'delete'
  if (code === 'Backspace') return 'backspace'
  if (code === 'Space') return 'space'
  if (code === 'Home') return 'home'
  if (code === 'End') return 'end'
  if (code === 'PageUp') return 'pageup'
  if (code === 'PageDown') return 'pagedown'

  const key = event.key.toLowerCase()
  if (/^[a-z0-9]$/.test(key)) return key
  return null
}

/** 把键盘事件归一化为 mod+shift+z 形式；不支持固定键时返回 null */
export function normalizeShortcutEvent(
  event: ShortcutKeyEvent
): string | null {
  const key = eventKey(event)
  if (!key) return null

  const parts: string[] = []
  if (event.ctrlKey || event.metaKey) parts.push('mod')
  if (event.altKey) parts.push('alt')
  if (event.shiftKey) parts.push('shift')
  parts.push(key)
  return parts.join('+')
}

export function shortcutMatchesEvent(
  event: ShortcutKeyEvent,
  binding: ShortcutBinding
): boolean {
  if (!binding) return false
  const normalized = normalizeShortcutEvent(event)
  if (!normalized) return false
  return shortcutParts(binding).includes(normalized)
}

const MAC_KEY_LABELS: Record<string, string> = {
  mod: '⌘',
  ctrl: '⌃',
  alt: '⌥',
  shift: '⇧',
  meta: '⌘',
  delete: 'Delete',
  backspace: 'Backspace',
  space: 'Space',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown'
}

const WIN_KEY_LABELS: Record<string, string> = {
  mod: 'Ctrl',
  ctrl: 'Ctrl',
  alt: 'Alt',
  shift: 'Shift',
  meta: 'Meta',
  delete: 'Delete',
  backspace: 'Backspace',
  space: 'Space',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown'
}

function formatPart(part: string, mac: boolean): string {
  return part
    .split('+')
    .map((token) => {
      const labels = mac ? MAC_KEY_LABELS : WIN_KEY_LABELS
      if (labels[token]) return labels[token]
      if (/^f\d+$/.test(token)) return token.toUpperCase()
      return token.toUpperCase()
    })
    .join(mac ? ' ' : ' + ')
}

export function formatShortcut(
  binding: ShortcutBinding,
  platform: 'mac' | 'win'
): string {
  const parts = shortcutParts(binding)
  if (parts.length === 0) return '未绑定'
  return parts.map((part) => formatPart(part, platform === 'mac')).join(' / ')
}

export function effectiveShortcutBinding(
  actionId: string,
  overrides: ShortcutBindings
): ShortcutBinding {
  if (actionId in overrides) return overrides[actionId]
  return DEFAULT_SHORTCUT_BINDINGS[actionId] ?? null
}

export function findShortcutConflict(
  actionId: string,
  binding: ShortcutBinding,
  overrides: ShortcutBindings
): ShortcutActionDef | null {
  if (!binding) return null
  const action = ACTION_BY_ID.get(actionId)
  if (!action) return null
  const keys = shortcutParts(binding)
  if (keys.length === 0) return null

  for (const other of SHORTCUT_ACTIONS) {
    if (other.id === actionId) continue
    const sameScope = other.scope === action.scope
    const globalConflict =
      action.scope === 'global' || other.scope === 'global'
    if (!sameScope && !globalConflict) continue

    const otherKeys = shortcutParts(
      effectiveShortcutBinding(other.id, overrides)
    )
    if (otherKeys.some((key) => keys.includes(key))) return other
  }
  return null
}
