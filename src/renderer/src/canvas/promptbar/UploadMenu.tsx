import { Icon } from '../../components/Icon'
import { MenuItem } from '../../components/ui'

interface UploadMenuProps {
  open: boolean
  onLocalUpload: () => void
  onLibraryUpload: () => void
}

export function UploadMenu({
  open,
  onLocalUpload,
  onLibraryUpload
}: UploadMenuProps) {
  if (!open) return null

  return (
    <div className="absolute left-0 top-[30px] z-20 min-w-[140px] rounded-[10px] border border-border bg-surface p-1.5 shadow-menu">
      <MenuItem
        className="!h-[34px] gap-2 !rounded-[7px] !px-2.5 !py-0 !text-[13px] !text-fg-muted hover:!text-fg [&>span:first-child]:!text-current"
        icon={<Icon name="folder-plus" size={14} />}
        onSelect={onLocalUpload}
      >
        本地上传
      </MenuItem>
      <MenuItem
        className="!h-[34px] gap-2 !rounded-[7px] !px-2.5 !py-0 !text-[13px] !text-fg-muted hover:!text-fg [&>span:first-child]:!text-current"
        icon={<Icon name="library" size={14} />}
        onSelect={onLibraryUpload}
      >
        资产库上传
      </MenuItem>
    </div>
  )
}
