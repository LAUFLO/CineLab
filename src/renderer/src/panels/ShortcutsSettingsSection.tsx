import { useEffect, useMemo, useState } from 'react'
import {
  SHORTCUT_ACTIONS,
  SHORTCUT_SCOPES,
  effectiveShortcutBinding,
  findShortcutConflict,
  formatShortcut,
  normalizeShortcutEvent,
  type ShortcutScope
} from '@shared/shortcuts'
import { Button, Input } from '../components/ui'
import { usePreferencesStore } from '../stores/preferences'
import { useUIStore } from '../stores/ui'
import {
  setShortcutRecording,
  shortcutPlatform
} from '../shortcuts/useShortcut'

const SCOPES: ShortcutScope[] = ['global', 'canvas', 'timeline', 'stage']

const KEYCAP =
  'min-w-[54px] whitespace-nowrap rounded-md border border-border bg-surface-hover px-2 py-1 text-center font-sans text-[11px] text-fg-muted'

const FIXED_SHORTCUTS: Array<[string, string]> = [
  ['Esc', '关闭弹窗、设置、剪辑室或导演台'],
  ['Enter', '输入框发送或确认'],
  ['Ctrl / ⌘ + Enter', '文本编辑器保存'],
  ['Tab', '在弹窗控件之间移动焦点']
]

export function ShortcutsSettingsSection() {
  const bindings = usePreferencesStore(
    (state) => state.preferences.shortcuts.bindings
  )
  const setShortcut = usePreferencesStore((state) => state.setShortcut)
  const resetShortcut = usePreferencesStore((state) => state.resetShortcut)
  const resetAllShortcuts = usePreferencesStore(
    (state) => state.resetAllShortcuts
  )
  const requestConfirm = useUIStore((state) => state.requestConfirm)
  const [search, setSearch] = useState('')
  const [recordingId, setRecordingId] = useState<string | null>(null)
  const [error, setError] = useState<{ id: string; message: string } | null>(
    null
  )
  const isMac = shortcutPlatform() === 'mac'

  const groups = useMemo(() => {
    const query = search.trim().toLowerCase()
    return SCOPES.map((scope) => ({
      scope,
      label: SHORTCUT_SCOPES[scope],
      actions: SHORTCUT_ACTIONS.filter((action) => {
        if (action.scope !== scope) return false
        if (!query) return true
        const keys = formatShortcut(
          effectiveShortcutBinding(action.id, bindings),
          isMac ? 'mac' : 'win'
        ).toLowerCase()
        return (
          action.label.toLowerCase().includes(query) ||
          keys.includes(query)
        )
      })
    })).filter((group) => group.actions.length > 0)
  }, [bindings, isMac, search])

  useEffect(() => {
    if (!recordingId) {
      setShortcutRecording(false)
      return
    }

    setShortcutRecording(true)
    const onKeyDown = (event: KeyboardEvent): void => {
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      if (event.repeat) return
      if (event.key === 'Escape') {
        setRecordingId(null)
        setError(null)
        return
      }

      const normalized = normalizeShortcutEvent(event)
      if (!normalized) {
        setError({
          id: recordingId,
          message: '这个按键不能用于快捷键，请换一个组合键'
        })
        return
      }

      const conflict = findShortcutConflict(recordingId, normalized, bindings)
      if (conflict) {
        setError({
          id: recordingId,
          message: `与「${conflict.label}」冲突`
        })
        return
      }

      void setShortcut(recordingId, normalized).then(() => {
        setRecordingId(null)
        setError(null)
      })
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      setShortcutRecording(false)
    }
  }, [bindings, recordingId, setShortcut])

  const resetAll = (): void => {
    requestConfirm({
      title: '恢复默认快捷键',
      message: '所有自定义快捷键都会恢复默认，确定继续？',
      confirmLabel: '恢复默认',
      onConfirm: async () => {
        await resetAllShortcuts()
        setRecordingId(null)
        setError(null)
      }
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[15px] font-semibold">快捷键</div>
          <div className="mt-1 max-w-[560px] text-[11px] leading-[1.6] text-fg-subtle">
            点击「录制」后按下组合键；Esc 取消。应用、画布、剪辑室和导演台分别检测冲突。
          </div>
        </div>
        <Input
          className="!h-8 w-[190px] shrink-0 !rounded-md !border-border !bg-surface !px-2.5 !text-xs"
          value={search}
          placeholder="搜索动作或按键"
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-3">
        {groups.map((group) => (
          <section
            key={group.scope}
            className="rounded-card border border-border bg-surface p-2.5"
          >
            <div className="mb-1.5 px-0.5 text-[11px] font-semibold text-fg-subtle">
              {group.label}
            </div>
            <div className="flex flex-col">
              {group.actions.map((action) => {
                const binding = effectiveShortcutBinding(action.id, bindings)
                const customized = action.id in bindings
                const recording = recordingId === action.id
                const rowError = error?.id === action.id ? error.message : null
                return (
                  <div
                    key={action.id}
                    data-shortcut-action={action.id}
                    className={`flex flex-wrap items-center gap-2 rounded-md px-1.5 py-1.5 ${
                      recording ? 'bg-surface-hover' : ''
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate text-xs text-fg">
                      {action.label}
                    </span>
                    {rowError ? (
                      <span className="shrink-0 text-[10.5px] text-danger">
                        {rowError}
                      </span>
                    ) : null}
                    <kbd
                      className={`${KEYCAP} ${
                        recording ? '!border-border-strong !text-fg' : ''
                      }`}
                    >
                      {recording
                        ? '按下组合键…'
                        : formatShortcut(binding, isMac ? 'mac' : 'win')}
                    </kbd>
                    <Button
                      type="button"
                      variant={recording ? 'primary' : 'secondary'}
                      size="none"
                      className="!h-7 !rounded-md !px-2 !text-[11px] !font-normal"
                      onClick={() => {
                        setRecordingId(recording ? null : action.id)
                        setError(null)
                      }}
                    >
                      {recording ? '取消录制' : '录制'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="none"
                      className="!h-7 !rounded-md !px-2 !text-[11px] !font-normal"
                      disabled={!customized || recording}
                      onClick={() => {
                        void resetShortcut(action.id)
                        setError(null)
                      }}
                    >
                      恢复默认
                    </Button>
                  </div>
                )
              })}
            </div>
          </section>
        ))}
        {groups.length === 0 ? (
          <div className="rounded-card border border-dashed border-border px-3 py-6 text-center text-xs text-fg-subtle">
            没有匹配的快捷键
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-divider pt-3">
        <div className="text-[11px] leading-[1.6] text-fg-subtle">
          固定快捷键不参与自定义：
          <div className="mt-1 flex flex-col gap-0.5">
            {FIXED_SHORTCUTS.map(([keys, label]) => (
              <span key={keys}>
                <kbd className="font-sans text-fg-muted">{keys}</kbd>
                {' · '}
                {label}
              </span>
            ))}
          </div>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="xs"
          className="shrink-0"
          onClick={resetAll}
        >
          全部恢复默认
        </Button>
      </div>
    </div>
  )
}
