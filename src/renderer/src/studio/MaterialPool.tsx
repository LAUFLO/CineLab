import { useEffect, useMemo, useState } from 'react'
import type { LibraryAsset } from '@shared/library-schema'
import type { SoundAsset } from '@shared/sound-schema'
import { createTrack, mainTrackId } from '@shared/timeline-schema'
import { Icon } from '../components/Icon'
import { assetUrl } from '../lib/asset-url'
import { useCanvasStore, nodeOutputs } from '../stores/canvas'
import { useStudioStore, type StudioTab } from '../stores/studio'
import { useTimelineStore } from '../stores/timeline'
import { useUIStore } from '../stores/ui'
import {
  assetToClip,
  formatDuration,
  poolFromLibrary,
  poolFromNodes,
  type PoolAsset
} from './assets'
import { uploadToStudio } from './nodes'
import { Button } from '../components/ui'

const TABS: { id: StudioTab; label: string }[] = [
  { id: 'linked', label: '画布素材' },
  { id: 'library', label: '资产库' },
  { id: 'sounds', label: '音效' },
  { id: 'upload', label: '上传' }
]

/** 缩略图渐变按素材类型静态映射，Tailwind 需要完整类名才会生成 */
const THUMB_GRADIENT: Record<PoolAsset['kind'], string> = {
  video:
    '[background:linear-gradient(135deg,rgba(99,102,241,0.35),rgba(14,165,233,0.2))]',
  image:
    '[background:linear-gradient(135deg,rgba(244,114,182,0.3),rgba(251,191,36,0.2))]',
  audio:
    '[background:repeating-linear-gradient(90deg,rgba(148,163,184,0.35)_0_2px,transparent_2px_5px)]'
}

function AssetThumbnail({ asset }: { asset: PoolAsset }) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setSrc(null)
    if (asset.kind === 'image') {
      setSrc(assetUrl(asset.path, asset.scope))
      return
    }
    if (asset.kind !== 'video' && asset.kind !== 'audio') return
    void window.api.media
      .thumbnail(asset.path, 0.1, asset.kind)
      .then((url) => {
        if (!cancelled && url) setSrc(url)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [asset.id, asset.kind, asset.path, asset.scope])

  if (!src) return null
  return (
    <img
      className="absolute inset-0 h-full w-full bg-media-bg object-contain"
      src={src}
      alt=""
      onError={() => setSrc(null)}
    />
  )
}

export function MaterialPool() {
  const tab = useStudioStore((state) => state.tab)
  const setTab = useStudioStore((state) => state.setTab)
  const studioNodeId = useStudioStore((state) => state.nodeId)
  const nodes = useCanvasStore((state) => state.nodes)
  const edges = useCanvasStore((state) => state.edges)
  const doc = useTimelineStore((state) => state.doc)
  const dispatch = useTimelineStore((state) => state.dispatch)
  const showToast = useUIStore((state) => state.showToast)
  const [libraryAssets, setLibraryAssets] = useState<LibraryAsset[]>([])
  const [sounds, setSounds] = useState<SoundAsset[]>([])
  const [importingSound, setImportingSound] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (tab !== 'library') return
    void window.api.library
      .listAllAssets()
      .then(setLibraryAssets)
      .catch(() => undefined)
  }, [tab])

  useEffect(() => {
    if (tab !== 'sounds') return
    void window.api.media
      .listSounds()
      .then(setSounds)
      .catch(() => undefined)
  }, [tab])

  const linkedNodes = useMemo(() => {
    if (!studioNodeId) return []
    const ids = new Set(
      edges
        .filter((edge) => edge.target === studioNodeId)
        .map((edge) => edge.source)
    )
    return nodes.filter((node) => ids.has(node.id))
  }, [nodes, edges, studioNodeId])

  const updateNodeIds = useMemo(() => {
    const result = new Set<string>()
    if (!doc) return result

    for (const clip of doc.clips) {
      const media = clip.media
      if (!media?.nodeId || !media.outputId) continue
      const node = nodes.find((entry) => entry.id === media.nodeId)
      if (!node || (node.type !== 'cine' && node.type !== 'film')) continue
      const latest = nodeOutputs(node)[0]
      if (
        latest &&
        (latest.id !== media.outputId || latest.path !== media.path)
      ) {
        result.add(media.nodeId)
      }
    }

    return result
  }, [doc, nodes])

  const assets = useMemo<PoolAsset[]>(() => {
    if (tab === 'linked') return poolFromNodes(linkedNodes)
    if (tab === 'library') return poolFromLibrary(libraryAssets)
    return []
  }, [tab, linkedNodes, libraryAssets])

  const addToMain = (asset: PoolAsset): void => {
    if (!doc) return
    const main = mainTrackId(doc)
    if (!main) return
    const end = doc.clips
      .filter((clip) => clip.trackId === main)
      .reduce((max, clip) => Math.max(max, clip.startMs + clip.durationMs), 0)
    dispatch({ op: 'addClip', clip: assetToClip(asset, main, end) })
  }

  const addSound = async (sound: SoundAsset): Promise<void> => {
    if (!doc || importingSound) return
    setImportingSound(sound.id)
    try {
      const imported = await window.api.media.importSound(sound.id)
      const state = useTimelineStore.getState()
      const current = state.doc
      if (!current) return

      let track = current.tracks.find((item) => item.kind === 'audio')
      if (!track) {
        track = createTrack('audio', '音效')
        state.dispatch({ op: 'addTrack', track })
      }
      const end = current.clips
        .filter((clip) => clip.trackId === track.id)
        .reduce((max, clip) => Math.max(max, clip.startMs + clip.durationMs), 0)
      const asset: PoolAsset = {
        id: `sfx:${sound.id}`,
        name: imported.name,
        kind: 'audio',
        durationMs: imported.durationMs,
        path: imported.path,
        scope: 'project'
      }
      const clip = assetToClip(asset, track.id, end)
      state.dispatch({ op: 'addClip', clip })
      state.select([clip.id])
      showToast(`已添加音效：${sound.name}`)
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setImportingSound(null)
    }
  }

  const upload = async (): Promise<void> => {
    if (!studioNodeId || uploading) return
    setUploading(true)
    try {
      const count = await uploadToStudio(studioNodeId)
      if (count > 0) {
        setTab('linked')
        showToast(`已导入 ${count} 个素材并连线到剪辑室`)
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setUploading(false)
    }
  }

  return (
    <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[10px] border border-border bg-surface [grid-area:left]">
      <div className="flex shrink-0 gap-0.5 border-b border-divider p-2">
        {TABS.map((item) => (
          <Button
            key={item.id}
            type="button"
            variant="ghost"
            size="none"
            className={`h-[26px] min-w-0 flex-1 !rounded-[6px] !font-normal text-xs ${
              tab === item.id ? '!bg-surface-hover !text-fg' : ''
            }`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      {tab === 'upload' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 p-5 text-center text-xs text-fg-subtle">
          <Icon name="plus" size={18} />
          <span>{uploading ? '正在导入…' : '上传本地素材'}</span>
          <small className="text-[11px] opacity-70">
            导入后自动创建节点、成组并连线到剪辑室
          </small>
          <Button
            type="button"
            variant="ghost"
            size="none"
            className="h-7 gap-1 !rounded-[7px] px-2 text-xs !font-normal"
            disabled={uploading || !studioNodeId}
            onClick={() => void upload()}
          >
            选择文件
          </Button>
        </div>
      ) : tab === 'sounds' ? (
        sounds.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1.5 p-5 text-center text-xs text-fg-subtle">
            <Icon name="audio" size={18} />
            <span>音效库为空</span>
            <small className="text-[11px] opacity-70">
              安装包应包含 resources/sounds
            </small>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-x-2 gap-y-2.5 overflow-y-auto p-2">
            {sounds.map((sound) => (
              <div
                key={sound.id}
                className="group flex min-w-0 cursor-grab flex-col gap-1"
                title={`${sound.name} · ${sound.category} · 双击添加到音效轨`}
                onDoubleClick={() => void addSound(sound)}
              >
                <div
                  className={`relative aspect-[16/10] w-full overflow-hidden rounded-[6px] border border-border bg-surface-raised group-hover:border-border-strong group-hover:brightness-[1.08] ${THUMB_GRADIENT.audio}`}
                >
                  <Icon name="audio" size={16} />
                  <span className="absolute bottom-1 right-1 rounded-[3px] bg-black/66 px-1 py-px text-[10px] tabular-nums text-media-text">
                    {formatDuration(Math.round(sound.duration * 1000))}
                  </span>
                </div>
                <span className="truncate text-[11px] text-fg-muted">
                  {sound.name}
                </span>
                <span className="text-[10px] text-fg-subtle">
                  {sound.category}
                </span>
              </div>
            ))}
          </div>
        )
      ) : assets.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 p-5 text-center text-xs text-fg-subtle">
          <Icon name="library" size={18} />
          <span>
            {tab === 'linked' ? '剪辑室还没有连线素材' : '资产库是空的'}
          </span>
          <small className="text-[11px] opacity-70">
            {tab === 'linked'
              ? '把素材节点连到剪辑室后会出现在这里'
              : '在资产库导入素材'}
          </small>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-x-2 gap-y-2.5 overflow-y-auto p-2">
          {assets.map((item) => (
            <div
              key={item.id}
              className="group flex min-w-0 cursor-grab flex-col gap-1"
              title={`${item.name} · 双击或拖到时间线`}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData(
                  'application/x-cinelab-asset',
                  JSON.stringify(item)
                )
                event.dataTransfer.effectAllowed = 'copy'
              }}
              onDoubleClick={() => addToMain(item)}
            >
              <div
                className={`relative aspect-[16/10] w-full overflow-hidden rounded-[6px] border border-border bg-surface-raised group-hover:border-border-strong group-hover:brightness-[1.08] ${THUMB_GRADIENT[item.kind]}`}
              >
                <AssetThumbnail asset={item} />
                <span className="absolute bottom-1 right-1 rounded-[3px] bg-black/66 px-1 py-px text-[10px] tabular-nums text-media-text">
                  {formatDuration(item.durationMs)}
                </span>
                {item.kind === 'audio' ? (
                  <span className="absolute left-1.5 top-1.5 text-fg-muted">
                    <Icon name="audio" size={16} />
                  </span>
                ) : null}
                {item.nodeId && updateNodeIds.has(item.nodeId) ? (
                  <span className="absolute right-1.5 top-1.5 rounded-full px-1.5 py-px text-[10px] leading-4 text-fg-inverse [background:color-mix(in_srgb,var(--pick-bar)_80%,transparent)]">
                    有新版本
                  </span>
                ) : null}
              </div>
              <span className="truncate text-[11px] text-fg-muted">
                {item.name}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="shrink-0 border-t border-divider p-2">
        <Button
          type="button"
          variant="ghost"
          size="none"
          className="h-7 w-full gap-1 !rounded-[7px] border border-border px-2 text-xs !font-normal"
          disabled={uploading || !studioNodeId}
          onClick={() => void upload()}
        >
          <Icon name="plus" size={14} /> {uploading ? '导入中…' : '上传素材'}
        </Button>
      </div>
    </aside>
  )
}
