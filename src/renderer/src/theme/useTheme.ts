import { useCallback, useEffect, useState } from 'react'
import type { ThemeMode } from '@shared/ipc-contract'

type Resolved = 'light' | 'dark'

function systemTheme(): Resolved {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function resolve(mode: ThemeMode): Resolved {
  return mode === 'system' ? systemTheme() : mode
}

export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('cinelab.theme.v1')
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'dark'
  })

  const apply = useCallback((next: ThemeMode) => {
    const resolved = resolve(next)
    document.documentElement.dataset.theme = resolved
    void window.api?.app.setTheme(next)
  }, [])

  useEffect(() => {
    apply(mode)
    localStorage.setItem('cinelab.theme.v1', mode)
  }, [mode, apply])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => {
      if (mode === 'system') apply('system')
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [mode, apply])

  const toggle = useCallback(() => {
    setModeState((prev) => {
      const current = resolve(prev)
      return current === 'dark' ? 'light' : 'dark'
    })
  }, [])

  return { mode, setMode: setModeState, toggle, resolved: resolve(mode) }
}
