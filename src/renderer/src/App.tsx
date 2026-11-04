import { useEffect } from 'react'
import { BottomBar } from './canvas/BottomBar'
import { Canvas } from './canvas/Canvas'
import { StatusBar } from './canvas/StatusBar'
import { TopBar } from './canvas/TopBar'
import { useCanvasStore } from './stores/canvas'
import { useProjectStore } from './stores/project'
import { useTheme } from './theme/useTheme'

export default function App() {
  const { resolved, toggle } = useTheme()

  const phase = useProjectStore((state) => state.phase)
  const bootstrap = useProjectStore((state) => state.bootstrap)
  const scheduleSave = useProjectStore((state) => state.scheduleSave)
  const error = useProjectStore((state) => state.error)
  const canvasId = useProjectStore((state) => state.canvasId)

  const nodes = useCanvasStore((state) => state.nodes)
  const edges = useCanvasStore((state) => state.edges)
  const hydrated = useCanvasStore((state) => state.hydrated)

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  useEffect(() => {
    if (!hydrated || phase !== 'ready') return
    scheduleSave()
  }, [nodes, edges, hydrated, phase, scheduleSave])

  if (phase === 'loading') {
    return (
      <div className="boot-screen">
        <div className="boot-screen__logo">CineLab</div>
        <div className="boot-screen__hint">正在打开项目…</div>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="boot-screen">
        <div className="boot-screen__logo">CineLab</div>
        <div className="boot-screen__hint">项目打开失败</div>
        <div className="boot-screen__error">{error}</div>
        <button type="button" className="empty-action" onClick={() => void bootstrap()}>
          重试
        </button>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <Canvas key={canvasId ?? 'canvas'} theme={resolved} />
      <TopBar theme={resolved} onToggleTheme={toggle} />
      <BottomBar />
      <StatusBar />
      {error ? <div className="toast">{error}</div> : null}
    </div>
  )
}
