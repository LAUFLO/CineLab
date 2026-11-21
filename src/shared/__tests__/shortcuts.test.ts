import { describe, expect, it } from 'vitest'
import {
  findShortcutConflict,
  formatShortcut,
  isValidShortcutBinding,
  normalizeShortcutEvent,
  shortcutMatchesEvent,
  type ShortcutKeyEvent
} from '../shortcuts'

function key(overrides: Partial<ShortcutKeyEvent>): ShortcutKeyEvent {
  return {
    key: '',
    code: '',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...overrides
  }
}

describe('shortcut normalization', () => {
  it('normalizes modifiers and keys', () => {
    expect(
      normalizeShortcutEvent(
        key({ code: 'KeyZ', key: 'z', ctrlKey: true, shiftKey: true })
      )
    ).toBe('mod+shift+z')
    expect(normalizeShortcutEvent(key({ code: 'Delete', key: 'Delete' }))).toBe(
      'delete'
    )
    expect(normalizeShortcutEvent(key({ code: 'Space', key: ' ' }))).toBe(
      'space'
    )
  })

  it('rejects fixed keys', () => {
    expect(normalizeShortcutEvent(key({ code: 'Escape', key: 'Escape' }))).toBe(
      null
    )
    expect(normalizeShortcutEvent(key({ code: 'Tab', key: 'Tab' }))).toBe(null)
  })

  it('matches alternatives', () => {
    expect(
      shortcutMatchesEvent(key({ code: 'Backspace', key: 'Backspace' }), 'delete|backspace')
    ).toBe(true)
  })
})

describe('shortcut formatting', () => {
  it('formats platform modifiers', () => {
    expect(formatShortcut('mod+shift+z', 'mac')).toBe('⌘ ⇧ Z')
    expect(formatShortcut('mod+shift+z', 'win')).toBe('Ctrl + Shift + Z')
  })

  it('formats alternatives', () => {
    expect(formatShortcut('delete|backspace', 'win')).toBe(
      'Delete / Backspace'
    )
    expect(formatShortcut(null, 'win')).toBe('未绑定')
  })
})

describe('shortcut validation and conflicts', () => {
  it('validates bindings', () => {
    expect(isValidShortcutBinding('mod+shift+z')).toBe(true)
    expect(isValidShortcutBinding('delete|backspace')).toBe(true)
    expect(isValidShortcutBinding('escape')).toBe(false)
    expect(isValidShortcutBinding('mod+mod+z')).toBe(false)
  })

  it('detects conflicts within the same scope', () => {
    const conflict = findShortcutConflict('canvas.copy', 'mod+z', {})
    expect(conflict?.id).toBe('canvas.undo')
  })

  it('allows the same key in different workspaces', () => {
    expect(findShortcutConflict('timeline.delete', 'delete', {})).toBeNull()
  })
})
