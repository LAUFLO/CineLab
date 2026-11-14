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
    <div className="promptbar__upload-menu">
      <MenuItem
        className="promptbar__upload-item"
        icon={<Icon name="folder-plus" size={14} />}
        onSelect={onLocalUpload}
      >
        本地上传
      </MenuItem>
      <MenuItem
        className="promptbar__upload-item"
        icon={<Icon name="library" size={14} />}
        onSelect={onLibraryUpload}
      >
        资产库上传
      </MenuItem>
    </div>
  )
}
