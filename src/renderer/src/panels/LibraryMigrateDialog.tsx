import { useEffect, useState } from 'react'
import type { LibraryMigrateProgress } from '@shared/library-migration'
import { Button, Dialog } from '../components/ui'
import { useLibraryStore } from '../stores/library'
import { useUIStore } from '../stores/ui'

export type LibraryMigrateTarget =
  | { kind: 'path'; path: string }
  | { kind: 'default' }
  | null

interface LibraryMigrateDialogProps {
  target: LibraryMigrateTarget
  onClose: () => void
}

export function LibraryMigrateDialog({
  target,
  onClose
}: LibraryMigrateDialogProps) {
  const root = useLibraryStore((state) => state.root)
  const refresh = useLibraryStore((state) => state.refresh)
  const showToast = useUIStore((state) => state.showToast)
  const [progress, setProgress] = useState<LibraryMigrateProgress | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    return window.api.library.onMigrateProgress(setProgress)
  }, [])

  if (!target) return null

  const targetLabel =
    target.kind === 'default' ? '默认资产库目录' : target.path
  const percent =
    progress && progress.totalBytes > 0
      ? Math.min(
          100,
          Math.round((progress.copiedBytes / progress.totalBytes) * 100)
        )
      : 0

  const migrate = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const result =
        target.kind === 'default'
          ? await window.api.library.migrateDefault()
          : await window.api.library.migrateRoot(target.path)
      await refresh()
      showToast(
        `资产库已迁移：${result.files} 个文件，${(result.bytes / 1024 / 1024).toFixed(1)} MB`
      )
      if (result.warnings.length > 0) {
        showToast(result.warnings[0], 'error')
      }
      onClose()
    } catch (migrationError) {
      setError(
        migrationError instanceof Error
          ? migrationError.message
          : String(migrationError)
      )
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const switchOnly = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      if (target.kind === 'default') {
        await window.api.library.resetRoot()
      } else {
        await window.api.library.setRoot(target.path)
      }
      await refresh()
      showToast('资产库位置已切换，旧内容未迁移')
      onClose()
    } catch (switchError) {
      setError(
        switchError instanceof Error ? switchError.message : String(switchError)
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onClose={() => {
        if (!busy) onClose()
      }}
      ariaLabel="更改资产库位置"
      panelClassName="w-[min(520px,100%)] p-5"
    >
      <div className="mb-2 text-[16px] text-fg">更改资产库位置</div>
      <p className="mb-4 mt-0 text-[12px] leading-[1.7] text-fg-subtle">
        旧位置的内容可以选择一起迁移。迁移完成后旧目录会移入回收站。
      </p>

      <div className="mb-3 flex flex-col gap-1 rounded-md bg-surface-hover px-2.5 py-2 text-[11px] leading-[1.6] text-fg-muted">
        <div>
          <span className="text-fg-subtle">当前：</span>
          <span className="break-all">{root || '读取中…'}</span>
        </div>
        <div>
          <span className="text-fg-subtle">新位置：</span>
          <span className="break-all">{targetLabel}</span>
        </div>
      </div>

      {progress ? (
        <div className="mb-3">
          <div className="mb-1.5 flex items-center justify-between text-[11px] text-fg-subtle">
            <span>
              {progress.phase === 'scan'
                ? '正在统计文件…'
                : progress.phase === 'verify'
                  ? '正在校验…'
                  : progress.phase === 'switch'
                    ? '正在切换…'
                    : `正在迁移 ${progress.copiedFiles}/${progress.totalFiles}`}
            </span>
            <span>{percent}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-hover">
            <div
              className="h-full bg-accent transition-[width] duration-[160ms]"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mb-3 break-all rounded-md bg-[rgba(239,68,68,0.08)] px-2.5 py-2 text-[11px] leading-[1.6] text-danger">
          {error}
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        {busy ? (
          <Button
            variant="secondary"
            onClick={() => void window.api.library.cancelMigrate()}
          >
            取消迁移
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              取消
            </Button>
            <Button variant="secondary" onClick={() => void switchOnly()}>
              仅切换位置
            </Button>
            <Button variant="primary" onClick={() => void migrate()}>
              迁移全部内容
            </Button>
          </>
        )}
      </div>
    </Dialog>
  )
}
