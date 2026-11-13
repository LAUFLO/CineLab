import { useEffect } from 'react'
import { useUIStore } from '../stores/ui'
import { Toast as ToastView } from './ui/Toast'

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
    <ToastView tone={toast.tone === 'error' ? 'error' : 'default'}>
      {toast.message}
    </ToastView>
  )
}
