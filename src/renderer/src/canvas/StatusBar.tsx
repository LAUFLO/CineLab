import { Icon } from '../components/Icon'
import { useCanvasStore } from '../stores/canvas'
import { useLibraryStore } from '../stores/library'
import { usePreferencesStore } from '../stores/preferences'
import { useUIStore } from '../stores/ui'

export function StatusBar() {
  const openLibrary = useLibraryStore((state) => state.openPanel)
  const zoom = useCanvasStore((state) => state.viewport.zoom)
  const snapToGrid = useUIStore((state) => state.snapToGrid)
  const edgesVisible = useUIStore((state) => state.edgesVisible)
  const minimapVisible = useUIStore((state) => state.minimapVisible)
  const toggleEdges = useUIStore((state) => state.toggleEdges)
  const toggleSnap = usePreferencesStore((state) => state.toggleSnap)
  const toggleMinimap = usePreferencesStore((state) => state.toggleMinimap)
  const requestFitView = useUIStore((state) => state.requestFitView)
  const requestArrange = useUIStore((state) => state.requestArrange)

  return (
    <div className="statusbar">
      <button
        type="button"
        className="statusbar__item"
        onClick={() => openLibrary('角色')}
      >
        <Icon name="folder" size={15} />
        资产管理
      </button>

      <button
        type="button"
        className="statusbar__icon"
        title="整理画布 Alt+Shift+F"
        onClick={requestArrange}
      >
        <Icon name="grid" size={15} />
      </button>

      <button
        type="button"
        className="statusbar__icon"
        title="适应视图"
        onClick={requestFitView}
      >
        <Icon name="target" size={15} />
      </button>

      <button
        type="button"
        className={`statusbar__icon ${edgesVisible ? '' : 'is-active'}`}
        title={edgesVisible ? '隐藏节点连线' : '显示节点连线'}
        onClick={toggleEdges}
      >
        <Icon name="link" size={15} />
      </button>

      <button
        type="button"
        className={`statusbar__icon ${snapToGrid ? 'is-active' : ''}`}
        title="网格吸附"
        onClick={toggleSnap}
      >
        <Icon name="magnet" size={15} />
      </button>

      <button
        type="button"
        className={`statusbar__icon ${minimapVisible ? 'is-active' : ''}`}
        title="小地图"
        onClick={toggleMinimap}
      >
        <Icon name="minimap" size={15} />
      </button>

      <span className="statusbar__zoom">{Math.round(zoom * 100)}%</span>
    </div>
  )
}
