import { useEffect, type ReactNode } from 'react'
import { BottomBar } from './canvas/BottomBar'
import { Canvas } from './canvas/Canvas'
import { StatusBar } from './canvas/StatusBar'
import { TopBar } from './canvas/TopBar'
import { Toast } from './components/Toast'
import { WindowControls } from './components/WindowControls'
import { ConfirmDialog } from './panels/ConfirmDialog'
import { LibraryPanel } from './panels/LibraryPanel'
import { ToolbarSettings } from './canvas/nodes/ToolbarSettings'
import { ProjectCenter } from './panels/ProjectCenter'
import { SettingsPanel } from './panels/SettingsPanel'
import { useCanvasStore } from './stores/canvas'
import { useGenerationStore } from './stores/generation'
import { useProjectStore } from './stores/project'
import { useSettingsStore } from './stores/settings'
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

  const loadProviders = useSettingsStore((state) => state.load)
  const subscribeGeneration = useGenerationStore((state) => state.subscribe)

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  useEffect(() => {
    void loadProviders()
  }, [loadProviders])

  useEffect(() => {
    const unsubscribe = subscribeGeneration()
    return unsubscribe
  }, [subscribeGeneration])

  useEffect(() => {
    if (!hydrated || phase !== 'ready') return
    scheduleSave()
  }, [nodes, edges, hydrated, phase, scheduleSave])

  let content: ReactNode

  if (phase === 'loading') {
    content = (
      <div className="boot-screen">
        <div className="boot-screen__logo">CineLab</div>
        <div className="boot-screen__hint">正在打开项目…</div>
      </div>
    )
  } else if (phase === 'welcome') {
    content = <ProjectCenter />
  } else if (phase === 'error') {
    content = (
      <div className="boot-screen">
        <div className="boot-screen__logo">CineLab</div>
        <div className="boot-screen__hint">项目打开失败</div>
        <div className="boot-screen__error">{error}</div>
        <button type="button" className="empty-action" onClick={() => void bootstrap()}>
          重试
        </button>
      </div>
    )
  } else {
    content = (
      <div className="app-shell">
        <Canvas key={canvasId ?? 'canvas'} theme={resolved} />
        <TopBar />
        <BottomBar />
        <StatusBar />
        <LibraryPanel />
        <ToolbarSettings />
        <ConfirmDialog />
        {error ? <div className="toast">{error}</div> : null}
      </div>
    )
  }

  return (
    <>
      {content}
      {phase === 'ready' ? null : <div className="window-drag-strip" />}
      <SettingsPanel />
      <WindowControls theme={resolved} onToggleTheme={toggle} />
      <Toast />
    </>
  )
}
