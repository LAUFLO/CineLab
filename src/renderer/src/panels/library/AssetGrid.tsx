import type { LibraryAsset } from '@shared/library-schema'
import { Icon } from '../../components/Icon'
import { assetUrl } from '../../lib/asset-url'

interface AssetGridProps {
  assets: LibraryAsset[]
  query: string
  onAddToCanvas: (asset: LibraryAsset) => void
  onExport: (asset: LibraryAsset) => void
  onRename: (asset: LibraryAsset) => void
  onDelete: (asset: LibraryAsset) => void
  onReveal: (asset: LibraryAsset) => void
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function AssetGrid({
  assets,
  query,
  onAddToCanvas,
  onExport,
  onRename,
  onDelete,
  onReveal
}: AssetGridProps) {
  const keyword = query.trim().toLowerCase()
  const filtered = keyword
    ? assets.filter((asset) => asset.name.toLowerCase().includes(keyword))
    : assets

  if (filtered.length === 0) {
    return (
      <div className="library-empty">
        <Icon name="image" size={30} />
        <div className="library-empty__title">
          {keyword ? '没有匹配的素材' : '这个文件夹还是空的'}
        </div>
        <div className="library-empty__desc">
          {keyword ? '换个关键词试试' : '从画布节点入库，或点击下方「上传」导入本地文件'}
        </div>
      </div>
    )
  }

  return (
    <div className="library-assets">
      {filtered.map((asset) => (
        <div key={asset.path} className="library-asset-card">
          <button
            type="button"
            className="library-asset-card__preview"
            onClick={() => onAddToCanvas(asset)}
            title="添加到画布"
          >
            {asset.kind === 'image' ? (
              <img
                src={assetUrl(asset.path, 'global')}
                alt=""
                loading="lazy"
                decoding="async"
              />
            ) : (
              <span className="library-asset-card__icon">
                <Icon
                  name={
                    asset.kind === 'video'
                      ? 'video'
                      : asset.kind === 'audio'
                        ? 'audio'
                        : 'image'
                  }
                  size={30}
                />
                <span>{asset.kind === 'video' ? '视频' : '音频'}</span>
              </span>
            )}
          </button>

          <div className="library-asset-card__body">
            <div className="library-asset-card__name" title={asset.fileName}>
              {asset.name}
            </div>
            <div className="library-asset-card__meta">
              {formatSize(asset.size)}
            </div>
          </div>

          <div className="library-asset-card__actions">
            <button
              type="button"
              title="添加到画布"
              onClick={() => onAddToCanvas(asset)}
            >
              <Icon name="plus" size={13} />
            </button>
            <button
              type="button"
              title="导出到本地"
              onClick={() => onExport(asset)}
            >
              <Icon name="download" size={13} />
            </button>
            <button
              type="button"
              title="重命名"
              onClick={() => onRename(asset)}
            >
              <Icon name="edit" size={13} />
            </button>
            <button
              type="button"
              title="在资源管理器中显示"
              onClick={() => onReveal(asset)}
            >
              <Icon name="folder" size={13} />
            </button>
            <button
              type="button"
              title="删除"
              onClick={() => onDelete(asset)}
            >
              <Icon name="trash" size={13} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
