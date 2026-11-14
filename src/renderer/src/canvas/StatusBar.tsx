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
    <div className="statusbar">
      <Button
        type="button"
        className="statusbar__item"
        onClick={() => openLibrary('角色')}
        unstyled
      >
        <Icon name="folder" size={15} />
        资产管理
      </Button>

      <Button
        type="button"
        className="statusbar__icon"
        title="整理画布 Alt+Shift+F"
        onClick={requestArrange}
        unstyled
      >
        <Icon name="grid" size={15} />
      </Button>

      <Button
        type="button"
        className="statusbar__icon"
        title="适应视图"
        onClick={requestFitView}
        unstyled
      >
        <Icon name="target" size={15} />
      </Button>

      <Button
        type="button"
        className={`statusbar__icon ${edgesVisible ? '' : 'is-active'}`}
        title={edgesVisible ? '隐藏节点连线' : '显示节点连线'}
        onClick={toggleEdges}
        unstyled
      >
        <Icon name="link" size={15} />
      </Button>

      <Button
        type="button"
        className={`statusbar__icon ${snapToGrid ? 'is-active' : ''}`}
        title="网格吸附"
        onClick={toggleSnap}
        unstyled
      >
        <Icon name="magnet" size={15} />
      </Button>

      <Button
        type="button"
        className={`statusbar__icon ${minimapVisible ? 'is-active' : ''}`}
        title="小地图"
        onClick={toggleMinimap}
        unstyled
      >
        <Icon name="minimap" size={15} />
      </Button>

      <span className="statusbar__zoom">{Math.round(zoom * 100)}%</span>
    </div>
  )
}
