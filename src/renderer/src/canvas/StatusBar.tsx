import { Icon } from '../components/Icon'
import { useCanvasStore } from '../stores/canvas'
import { useLibraryStore } from '../stores/library'
import { usePreferencesStore } from '../stores/preferences'
import { useUIStore } from '../stores/ui'
import { Button } from '../components/ui'

export function StatusBar() {
  const openLibrary = useLibraryStore((state) => state.openPanel)
  const zoom = useCanvasStore((state) => state.viewport.zoom)
  const snapToGrid = useUIStore((state) => state.snapToGrid)
  const edgesVisible = useUIStore((state) => state.edgesVisible)
  const minimapVisible = useUIStore((state) => state.minimapVisible)
  const toggleEdges = usePreferencesStore((state) => state.toggleEdges)
  const toggleSnap = usePreferencesStore((state) => state.toggleSnap)
  const toggleMinimap = usePreferencesStore((state) => state.toggleMinimap)
  const requestFitView = useUIStore((state) => state.requestFitView)
  const requestArrange = useUIStore((state) => state.requestArrange)

  return (
    <div data-slot="statusbar" className="absolute bottom-4 left-4 z-20 flex h-10 items-center gap-0.5 rounded-xl border border-border bg-surface px-1.5 py-1 text-xs text-fg-muted shadow-float">
      <Button
        type="button"
        variant="ghost"
        size="none"
        className="h-[30px] gap-1.5 rounded-lg px-2 !font-normal"
        onClick={() => openLibrary('角色')}
      >
        <Icon name="folder" size={15} />
        资产管理
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="none"
        className="h-[30px] w-[30px] rounded-lg"
        title="整理画布 Alt+Shift+F"
        onClick={requestArrange}
      >
        <Icon name="grid" size={15} />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="none"
        className="h-[30px] w-[30px] rounded-lg"
        title="适应视图"
        onClick={requestFitView}
      >
        <Icon name="target" size={15} />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="none"
        className={`h-[30px] w-[30px] rounded-lg ${
          edgesVisible ? '' : '!bg-surface-hover !text-fg'
        }`}
        title={edgesVisible ? '隐藏节点连线' : '显示节点连线'}
        onClick={toggleEdges}
      >
        <Icon name="link" size={15} />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="none"
        className={`h-[30px] w-[30px] rounded-lg ${
          snapToGrid ? '!bg-surface-hover !text-fg' : ''
        }`}
        title="网格吸附"
        onClick={toggleSnap}
      >
        <Icon name="magnet" size={15} />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="none"
        className={`h-[30px] w-[30px] rounded-lg ${
          minimapVisible ? '!bg-surface-hover !text-fg' : ''
        }`}
        title="小地图"
        onClick={toggleMinimap}
      >
        <Icon name="minimap" size={15} />
      </Button>

      <span className="whitespace-nowrap px-1.5 text-fg-muted tabular-nums">
        {Math.round(zoom * 100)}%
      </span>
    </div>
  )
}
