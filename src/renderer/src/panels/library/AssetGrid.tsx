import type { LibraryAsset } from '@shared/library-schema'
import { Icon } from '../../components/Icon'
import { IconButton, Button } from '../../components/ui'
import { assetUrl } from '../../lib/asset-url'

interface AssetGridProps {
  assets: LibraryAsset[]
  query: string
  selectionMode: boolean
  selectedPaths: Set<string>
  onToggleSelect: (asset: LibraryAsset) => void
  onAddToCanvas: (asset: LibraryAsset) => void
  onExport: (asset: LibraryAsset) => void
  onMove: (asset: LibraryAsset) => void
  onRename: (asset: LibraryAsset) => void
  onEditTags: (asset: LibraryAsset) => void
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
  selectionMode,
  selectedPaths,
  onToggleSelect,
  onAddToCanvas,
  onExport,
  onMove,
  onRename,
  onEditTags,
  onDelete,
  onReveal
}: AssetGridProps) {
  const keyword = query.trim().toLowerCase()
  const filtered = keyword
    ? assets.filter(
        (asset) =>
          asset.name.toLowerCase().includes(keyword) ||
          (asset.tags ?? []).some((tag) => tag.toLowerCase().includes(keyword))
      )
    : assets

  if (filtered.length === 0) {
    return (
      <div className="col-span-full flex flex-col items-center gap-1.5 px-3 pb-[18px] pt-[30px] text-center text-fg-subtle">
        <Icon name="image" size={30} className="mb-0.5 opacity-[0.65]" />
        <div className="text-[13px] text-fg-muted">
          {keyword ? '没有匹配的素材' : '这个文件夹还是空的'}
        </div>
        <div className="max-w-[236px] text-xs leading-[1.7]">
          {keyword
            ? '换个关键词试试'
            : '从画布节点入库，或点击下方「上传」导入本地文件'}
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(148px,1fr))] gap-3">
      {filtered.map((asset) => (
        <div
          key={asset.path}
          className={`group relative flex flex-col overflow-hidden rounded-card border bg-surface-raised [contain-intrinsic-size:auto_220px] [content-visibility:auto] hover:border-border-strong ${
            selectedPaths.has(asset.path)
              ? '!border-border-selected shadow-[0_0_0_1px_var(--border-selected)]'
              : 'border-border'
          }`}
        >
          {selectionMode ? (
            <span
              className={`absolute left-2 top-2 z-[2] flex h-5 w-5 items-center justify-center rounded-full border text-xs text-fg-inverse ${
                selectedPaths.has(asset.path)
                  ? 'border-pick-bar bg-pick-bar'
                  : 'border-border-strong bg-surface'
              }`}
            >
              {selectedPaths.has(asset.path) ? '✓' : ''}
            </span>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="none"
            className="aspect-square w-full cursor-pointer overflow-hidden bg-canvas p-0 hover:!bg-canvas"
            onClick={() =>
              selectionMode ? onToggleSelect(asset) : onAddToCanvas(asset)
            }
            title={selectionMode ? '选择素材' : '添加到画布'}
          >
            {asset.thumbnail ? (
              <img
                className="block h-full w-full object-cover"
                src={assetUrl(asset.thumbnail, 'global')}
                alt=""
                loading="lazy"
                decoding="async"
              />
            ) : asset.kind === 'image' ? (
              <img
                className="block h-full w-full object-cover"
                src={assetUrl(asset.path, 'global')}
                alt=""
                loading="lazy"
                decoding="async"
              />
            ) : (
              <span className="flex flex-col items-center gap-1.5 text-[11px] text-fg-subtle">
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
          </Button>

          <div className="px-2.5 py-2">
            <div className="truncate text-xs text-fg" title={asset.fileName}>
              {asset.name}
            </div>
            <div className="mt-[3px] text-[10.5px] text-fg-subtle">
              {formatSize(asset.size)}
            </div>
            {(asset.tags ?? []).length > 0 ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {(asset.tags ?? []).slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-surface-hover px-1.5 py-px text-[10px] text-fg-subtle"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="absolute right-1.5 top-1.5 flex gap-0.5 rounded-md bg-black/55 p-[3px] opacity-0 transition-opacity duration-[120ms] group-hover:opacity-100">
            {selectionMode ? null : (
              <>
                <IconButton
                  label="添加到画布"
                  size="xs"
                  className="!h-[22px] !w-[22px] !rounded-md cursor-pointer !text-white/80 hover:!bg-white/16 hover:!text-white"
                  onClick={() => onAddToCanvas(asset)}
                >
                  <Icon name="plus" size={13} />
                </IconButton>
                <IconButton
                  label="导出到本地"
                  size="xs"
                  className="!h-[22px] !w-[22px] !rounded-md cursor-pointer !text-white/80 hover:!bg-white/16 hover:!text-white"
                  onClick={() => onExport(asset)}
                >
                  <Icon name="download" size={13} />
                </IconButton>
                <IconButton
                  label="移动到文件夹"
                  size="xs"
                  className="!h-[22px] !w-[22px] !rounded-md cursor-pointer !text-white/80 hover:!bg-white/16 hover:!text-white"
                  onClick={() => onMove(asset)}
                >
                  <Icon name="move" size={13} />
                </IconButton>
                <IconButton
                  label="重命名"
                  size="xs"
                  className="!h-[22px] !w-[22px] !rounded-md cursor-pointer !text-white/80 hover:!bg-white/16 hover:!text-white"
                  onClick={() => onRename(asset)}
                >
                  <Icon name="edit" size={13} />
                </IconButton>
                <IconButton
                  label="编辑标签"
                  size="xs"
                  className="!h-[22px] !w-[22px] !rounded-md cursor-pointer !text-white/80 hover:!bg-white/16 hover:!text-white"
                  onClick={() => onEditTags(asset)}
                >
                  <Icon name="pin" size={13} />
                </IconButton>
                <IconButton
                  label="在资源管理器中显示"
                  size="xs"
                  className="!h-[22px] !w-[22px] !rounded-md cursor-pointer !text-white/80 hover:!bg-white/16 hover:!text-white"
                  onClick={() => onReveal(asset)}
                >
                  <Icon name="folder" size={13} />
                </IconButton>
                <IconButton
                  label="删除"
                  size="xs"
                  className="!h-[22px] !w-[22px] !rounded-md cursor-pointer !text-white/80 hover:!bg-white/16 hover:!text-white"
                  onClick={() => onDelete(asset)}
                >
                  <Icon name="trash" size={13} />
                </IconButton>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
