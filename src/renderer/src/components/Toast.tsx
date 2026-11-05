import { useEffect } from 'react'
import { useUIStore } from '../stores/ui'

export function Toast() {
  const toast = useUIStore((state) => state.toast)
  const clearToast = useUIStore((state) => state.clearToast)

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(clearToast, 3600)
    return () => window.clearTimeout(timer)
  }, [toast, clearToast])

  if (!toast) return null

  return (
    <div className={`export-toast ${toast.tone === 'error' ? 'is-error' : ''}`}>
      {toast.message}
    </div>
  )
}
