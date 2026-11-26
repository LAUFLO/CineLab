import { useEffect, useState } from 'react'
import type { CloseAction } from '@shared/preferences'
import { Button, Dialog, DIALOG_PANEL, Switch } from './ui'

export interface CloseConfirmDialogProps {
  open: boolean
  defaultAction: CloseAction
  onBackground: (remember: boolean) => void
  onQuit: () => void
  onCancel: () => void
}

export function CloseConfirmDialog({
  open,
  defaultAction,
  onBackground,
  onQuit,
  onCancel
}: CloseConfirmDialogProps) {
  const [remember, setRemember] = useState(false)

  useEffect(() => {
    if (open) setRemember(false)
  }, [open])

  if (!open) return null

  const backgroundPrimary = defaultAction === 'background'

  return (
    <Dialog
      open
      onClose={onCancel}
      bare
      ariaLabel="关闭 CineLab"
      overlayClassName="fixed inset-0 z-[1200] flex items-center justify-center bg-overlay p-6"
      panelClassName={`w-[min(440px,100%)] ${DIALOG_PANEL}`}
    >
      <div className="mb-2.5 text-[16px] text-fg">关闭 CineLab</div>
      <p className="mb-4 mt-0 text-[13px] leading-[1.7] text-fg-muted">
        关闭前将自动保存当前项目。选择「后台运行」后窗口会收起，后台任务将继续运行，完成时仍会通知你。
      </p>
      <div className="mb-5 flex items-center justify-between gap-4">
        <span className="text-[12px] text-fg-muted">不再提示（仅记住后台运行）</span>
        <Switch checked={remember} onChange={setRemember} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          取消
        </Button>
        <Button
          variant={backgroundPrimary ? 'secondary' : 'primary'}
          onClick={onQuit}
        >
          退出程序
        </Button>
        <Button
          variant={backgroundPrimary ? 'primary' : 'secondary'}
          onClick={() => onBackground(remember)}
        >
          后台运行
        </Button>
      </div>
    </Dialog>
  )
}
