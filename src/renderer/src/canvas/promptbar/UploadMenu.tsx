import type { RefObject } from 'react'
import { Icon } from '../../components/Icon'
import { MenuItem, Popover } from '../../components/ui'

interface UploadMenuProps {
  open: boolean
  onLocalUpload: () => void
  onLibraryUpload: () => void
  onClose: () => void
  anchorRef: RefObject<HTMLElement | null>
}

export function UploadMenu({
  open,
  onLocalUpload,
  onLibraryUpload,
  onClose,
  anchorRef
}: UploadMenuProps) {
  return (
    <Popover
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      width={160}
      className="!p-1.5"
    >
      <MenuItem
        className="!h-[34px] gap-2 !rounded-md !px-2.5 !py-0 !text-[13px] !text-fg-muted hover:!text-fg [&>span:first-child]:!text-current"
        icon={<Icon name="folder-plus" size={14} />}
        onSelect={onLocalUpload}
      >
        本地上传
      </MenuItem>
      <MenuItem
        className="!h-[34px] gap-2 !rounded-md !px-2.5 !py-0 !text-[13px] !text-fg-muted hover:!text-fg [&>span:first-child]:!text-current"
        icon={<Icon name="library" size={14} />}
        onSelect={onLibraryUpload}
      >
        资产库上传
      </MenuItem>
    </Popover>
  )
}
