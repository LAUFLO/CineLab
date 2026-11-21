import {
  effectiveShortcutBinding,
  formatShortcut,
  shortcutMatchesEvent
} from '@shared/shortcuts'
import { usePreferencesStore } from '../stores/preferences'

let recording = false

/** 录制快捷键时暂时关闭全局快捷键匹配 */
export function setShortcutRecording(value: boolean): void {
  recording = value
}

export function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        'input, textarea, select, [contenteditable="true"], [role="textbox"]'
      )
    )
  )
}

/** 设置页、快捷键浮窗、Dialog 等模态层打开时，不响应画布/时间线快捷键 */
export function hasShortcutBlockingOverlay(): boolean {
  if (typeof document === 'undefined') return false
  return Boolean(document.querySelector('[data-shortcut-block]'))
}

export function shortcutMatches(
  event: KeyboardEvent,
  actionId: string
): boolean {
  if (recording) return false
  if (event.defaultPrevented) return false
  if (isEditableTarget(event.target)) return false
  if (hasShortcutBlockingOverlay()) return false

  const overrides = usePreferencesStore.getState().preferences.shortcuts.bindings
  const binding = effectiveShortcutBinding(actionId, overrides)
  return shortcutMatchesEvent(event, binding)
}

export function useShortcutLabel(actionId: string): string {
  const bindings = usePreferencesStore(
    (state) => state.preferences.shortcuts.bindings
  )
  return formatShortcut(
    effectiveShortcutBinding(actionId, bindings),
    shortcutPlatform()
  )
}

export function shortcutPlatform(): 'mac' | 'win' {
  if (typeof document !== 'undefined') {
    return document.documentElement.dataset.platform === 'darwin'
      ? 'mac'
      : 'win'
  }
  return 'win'
}
