import { useEffect } from 'react'
import { useUIStore } from '../stores/ui'
import { Toast as ToastView } from './ui/Toast'
import { Button } from './ui'

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
      <div className="flex items-center gap-3">
        <span>{toast.message}</span>
        {toast.action ? (
          <Button
            type="button"
            variant="ghost"
            size="none"
            className="h-6 shrink-0 px-1.5 text-xs text-accent"
            onClick={() => {
              toast.action?.onClick()
              clearToast()
            }}
          >
            {toast.action.label}
          </Button>
        ) : null}
      </div>
    </ToastView>
  )
}
